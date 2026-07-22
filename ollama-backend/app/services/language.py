def response_language_instruction(language: str | None) -> str | None:
    """Return the system instruction that applies a user's reply-language preference."""
    if not language:
        return None
    return (
        f"Always reply in {language}. Use that language even if the user writes in another language, "
        "unless they explicitly request a different language for this answer."
    )
