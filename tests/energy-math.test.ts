import assert from "node:assert/strict";
import test from "node:test";

import {
  distributeMicros,
  hoursBetween,
  isReconciliationAnomaly,
  microsToDecimal,
  parseDecimalToMicros,
  selectEffectiveTariff,
  validateDate,
  validateHour,
} from "../lib/energy-math.ts";

test("decimal arithmetic keeps six decimal places without floating point drift", () => {
  assert.equal(parseDecimalToMicros("3,300001"), 3_300_001);
  assert.equal(parseDecimalToMicros("0.2"), 200_000);
  assert.equal(microsToDecimal(3_300_001), "3.300001");
  assert.throws(() => parseDecimalToMicros("1.1234567"));
});

test("date, hour and interval validation uses the domain hour type", () => {
  assert.equal(validateDate("2026-09-15"), "2026-09-15");
  assert.equal(validateHour("23"), 23);
  assert.equal(hoursBetween({ reading_date: "2026-09-15", reading_hour: 10 }, { reading_date: "2026-09-15", reading_hour: 15 }), 5);
  assert.throws(() => validateDate("2026-02-30"));
  assert.throws(() => validateHour(24));
});

test("manual hourly redistribution preserves the interval total", () => {
  const values = distributeMicros(10_000_000, 3, new Map([[1, 4_000_000]]));
  assert.deepEqual(values, [3_000_000, 4_000_000, 3_000_000]);
  assert.equal(values?.reduce((sum, value) => sum + value, 0), 10_000_000);
  assert.equal(distributeMicros(5_000_000, 2, new Map([[0, 3_000_000], [1, 3_000_000]])), null);
});

test("effective tariff selection chooses the latest version for a slot", () => {
  const tariffs = [{ valid_from_date: "2026-01-01", price: 300 }, { valid_from_date: "2026-09-01", price: 330 }, { valid_from_date: "2026-10-01", price: 345 }];
  assert.equal(selectEffectiveTariff(tariffs, "2026-09-15")?.price, 330);
  assert.equal(selectEffectiveTariff(tariffs, "2025-12-31"), null);
});

test("reconciliation anomaly requires both configured tolerances", () => {
  assert.equal(isReconciliationAnomaly(900_000, 10_000_000, 1_000_000, 5), false);
  assert.equal(isReconciliationAnomaly(1_100_000, 10_000_000, 1_000_000, 5), true);
  assert.equal(isReconciliationAnomaly(-1_100_000, 10_000_000, 1_000_000, 5), true);
});
