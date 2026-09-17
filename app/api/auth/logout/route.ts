import { chatGPTSignOutPath } from "@/app/chatgpt-auth";

export async function POST(request: Request) {
  const returnTo = new URL(request.url).searchParams.get("return_to") ?? "/";
  return Response.json({ data: { redirectTo: chatGPTSignOutPath(returnTo) } }, { status: 200 });
}
