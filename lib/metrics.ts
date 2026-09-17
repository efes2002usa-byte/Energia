/** Lightweight server metrics that stay useful in both local D1 and production Workers. */
export function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export function logMetric(name: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ metric: name, ...fields }));
}
