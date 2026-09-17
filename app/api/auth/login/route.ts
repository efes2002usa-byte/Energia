import { chatGPTSignInPath } from "@/app/chatgpt-auth";

const attempts = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  const key = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(timestamp => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    return Response.json({ error: { code: "RATE_LIMITED", message: "Слишком много попыток входа. Повторите через минуту." } }, { status: 429, headers: { "retry-after": "60" } });
  }
  recent.push(now);
  attempts.set(key, recent);
  const returnTo = new URL(request.url).searchParams.get("return_to") ?? "/";
  return Response.json({ data: { redirectTo: chatGPTSignInPath(returnTo) } }, { status: 200 });
}
