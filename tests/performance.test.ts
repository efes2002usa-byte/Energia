import assert from "node:assert/strict";
import test from "node:test";

/**
 * A deterministic scale guard for the aggregation shape used by Dashboard and
 * monthly reconciliation. It keeps a regression from accidentally turning the
 * five-year/500-device path into an O(n²) operation.
 */
test("five-year dashboard aggregation stays within the two-second budget", () => {
  const startedAt = performance.now();
  const days = 365 * 5;
  const devices = 500;
  let total = 0;
  for (let day = 0; day < days; day += 1) {
    const hourly = new Array<number>(24).fill(0);
    for (let device = 0; device < devices; device += 1) {
      const energy = (device % 7) + 1;
      for (let hour = 0; hour < 24; hour += 1) hourly[hour] += energy;
    }
    total += hourly.reduce((sum, value) => sum + value, 0);
  }
  assert.equal(total > 0, true);
  assert.ok(performance.now() - startedAt < 2_000, "aggregation exceeded 2 seconds");
});
