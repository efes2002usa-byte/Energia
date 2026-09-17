export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

export function envelope<T>(body: T): { data: T } | T {
  if (body && typeof body === "object" && ("data" in body || "error" in body)) return body as { data: T } | ApiErrorBody;
  return { data: body };
}
