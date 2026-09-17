import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const requiredRoutes = [
  "app/api/dashboard/route.ts",
  "app/api/reconciliation/route.ts",
  "app/api/meter-readings/route.ts",
  "app/api/meter-readings/[id]/impact/route.ts",
  "app/api/manual-consumption/[date]/[hour]/route.ts",
  "app/api/devices/[id]/restore/route.ts",
  "app/api/v1/[...path]/route.ts",
  "app/api/auth/me/route.ts",
];

test("acceptance-critical API surface remains present", () => {
  for (const route of requiredRoutes) assert.equal(existsSync(route), true, `missing route: ${route}`);
});
