/**
 * Limiteur de débit en mémoire, par clé (IP…). Suffisant pour une petite app :
 * sur plusieurs instances serverless chaque instance compte à part, ce qui
 * reste un garde-fou contre les abus, pas une facturation.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return { ok: false, remaining: 0 };
  }
  list.push(now);
  hits.set(key, list);
  return { ok: true, remaining: max - list.length };
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
