import { chatGPTSignInPath } from "@/app/chatgpt-auth";

export async function POST(request: Request) {
  const returnTo = new URL(request.url).searchParams.get("return_to") ?? "/";
  return Response.json({ data: { redirectTo: chatGPTSignInPath(returnTo) } }, { status: 200 });
}
