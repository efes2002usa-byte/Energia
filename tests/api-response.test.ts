import assert from "node:assert/strict";
import test from "node:test";
import { envelope } from "../lib/api-response.ts";

test("versioned API envelopes successful payloads without double wrapping errors", () => {
  assert.deepEqual(envelope({ devices: [] }), { data: { devices: [] } });
  const error = { error: { code: "VALIDATION_ERROR", message: "Некорректный запрос" } };
  assert.deepEqual(envelope(error), error);
});
