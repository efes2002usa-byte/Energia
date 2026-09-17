export async function POST() {
  return Response.json({ error: { code: "PASSWORD_MANAGED_EXTERNALLY", message: "Пароль управляется провайдером входа ChatGPT" } }, { status: 422 });
}
