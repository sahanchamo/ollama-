from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import UUID
from zipfile import BadZipFile, ZipFile

from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import DocumentChunk, KnowledgeDocument
from app.services.ollama import OllamaService

ARCHIVE_EXTENSION = ".zip"


def extract_text(filename: str, raw: bytes) -> str:
    extension = Path(filename).suffix.lower()
    if extension == ARCHIVE_EXTENSION:
        return extract_zip_text(raw)
    if extension == ".pdf":
        return "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(raw)).pages).strip()
    return extract_source_text(raw)


def extract_source_text(raw: bytes) -> str:
    """Accept any text-based source/configuration file while rejecting binaries."""
    if b"\x00" in raw:
        raise ValueError("Binary files cannot be attached; choose a text-based source file or ZIP archive")
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        raise ValueError("No readable text was found in this file")
    controls = sum(1 for character in text if ord(character) < 32 and character not in "\n\r\t")
    if controls > max(20, len(text) // 50):
        raise ValueError("This file does not appear to be text-based source code")
    return text


def extract_zip_text(raw: bytes) -> str:
    """Safely combine supported documents from an uploaded archive into one RAG source."""
    maximum = get_settings().rag_max_upload_bytes
    try:
        with ZipFile(BytesIO(raw)) as archive:
            entries = [entry for entry in archive.infolist() if not entry.is_dir()]
            if not entries:
                raise ValueError("The ZIP file contains no files")
            total_size = sum(entry.file_size for entry in entries)
            if total_size > maximum:
                raise ValueError("The extracted ZIP contents exceed the document upload limit")
            parts: list[str] = []
            for entry in entries:
                try:
                    text = extract_text(entry.filename, archive.read(entry))
                except ValueError:
                    # Archives often contain binary build artifacts; only index readable source files.
                    continue
                if text:
                    parts.append(f"[File: {Path(entry.filename).name}]\n{text}")
            if not parts:
                raise ValueError("The ZIP file contains no readable text or source files")
    except BadZipFile as exc:
        raise ValueError("The ZIP file is invalid or corrupted") from exc
    return "\n\n".join(parts).strip()


def split_text(text: str) -> list[str]:
    settings = get_settings()
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + settings.rag_chunk_size)
        if end < len(normalized):
            boundary = max(normalized.rfind(". ", start, end), normalized.rfind("\n", start, end))
            if boundary > start + settings.rag_chunk_size // 2:
                end = boundary + 1
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized):
            break
        start = max(end - settings.rag_chunk_overlap, start + 1)
    return chunks


async def index_document(
    db: AsyncSession, ollama: OllamaService, user_id: object, filename: str, content_type: str, raw: bytes
) -> KnowledgeDocument:
    text = extract_text(filename, raw)
    if not text:
        raise ValueError("No readable text was found in this document")
    chunks = split_text(text)
    if not chunks:
        raise ValueError("No indexable text was found in this document")
    fingerprint = sha256(raw).hexdigest()
    existing = await db.scalar(
        select(KnowledgeDocument).where(KnowledgeDocument.user_id == user_id, KnowledgeDocument.content_hash == fingerprint)
    )
    if existing:
        return existing
    vectors = await ollama.embed(chunks)
    document = KnowledgeDocument(
        user_id=user_id,
        filename=Path(filename).name[:255],
        content_type=content_type or "application/octet-stream",
        content_hash=fingerprint,
        chunk_count=len(chunks),
    )
    db.add(document)
    await db.flush()
    db.add_all(
        DocumentChunk(document_id=document.id, user_id=user_id, chunk_index=index, content=chunk, embedding=vector)
        for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True))
    )
    await db.commit()
    await db.refresh(document)
    return document


async def retrieve_context(
    db: AsyncSession, ollama: OllamaService, user_id: object, query: str, document_ids: list[UUID] | None = None
) -> list[tuple[DocumentChunk, KnowledgeDocument, float]]:
    settings = get_settings()
    if not settings.rag_enabled or not query.strip():
        return []
    if document_ids == []:
        return []
    has_documents = await db.scalar(
        select(DocumentChunk.id).where(DocumentChunk.user_id == user_id, *( [DocumentChunk.document_id.in_(document_ids)] if document_ids is not None else [])).limit(1)
    )
    if has_documents is None:
        return []
    vector = (await ollama.embed([query]))[0]
    distance = DocumentChunk.embedding.cosine_distance(vector).label("distance")
    rows = await db.execute(
        select(DocumentChunk, KnowledgeDocument, distance)
        .join(KnowledgeDocument, KnowledgeDocument.id == DocumentChunk.document_id)
        .where(DocumentChunk.user_id == user_id, *( [DocumentChunk.document_id.in_(document_ids)] if document_ids is not None else []))
        .order_by(distance)
        .limit(settings.rag_top_k)
    )
    return [(chunk, document, float(score)) for chunk, document, score in rows.all()]


def build_rag_instruction(results: list[tuple[DocumentChunk, KnowledgeDocument, float]]) -> str | None:
    if not results:
        return None
    excerpts = "\n\n".join(
        f"[Source: {document.filename}, section {chunk.chunk_index + 1}]\n{chunk.content}"
        for chunk, document, _ in results
    )
    return (
        "Answer using the knowledge-base excerpts below when they are relevant. "
        "Do not invent facts not supported by the excerpts. If the answer is not in the excerpts, say so. "
        "Cite supporting sources using [Source: filename, section N].\n\n"
        f"Knowledge-base excerpts:\n{excerpts}"
    )
