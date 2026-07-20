import { NextRequest } from "next/server";

const upstreamBase = (process.env.OLLAMA_GATEWAY_URL || "http://152.42.253.49/api/v1").replace(/\/$/, "");
const upstreamRoot = upstreamBase.replace(/\/api\/v1$/, "");

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  // Health endpoints live outside FastAPI's /api/v1 prefix; all other routes use it.
  const targetBase = path[0] === "health" ? upstreamRoot : upstreamBase;
  const target = `${targetBase}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      // Required by Node's fetch when forwarding a readable request stream.
      // @ts-expect-error duplex is supported by Node/Undici but absent from RequestInit typings.
      duplex: "half",
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return Response.json({ detail: `Gateway proxy could not reach API: ${(error as Error).message}` }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
