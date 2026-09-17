import { envelope } from "@/lib/api-response";

async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = new URL(request.url);
  target.pathname = `/api/${path.join("/")}`;
  const init: RequestInit = { method: request.method, headers: request.headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  const upstream = await fetch(target, init);
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return upstream;
  const body = await upstream.json() as unknown;
  return Response.json(envelope(body), { status: upstream.status, headers: { "cache-control": "no-store" } });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
