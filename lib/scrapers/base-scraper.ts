/**
 * Base scraper - fetch avec retry, rate-limit, user-agent
 * Respect des bonnes pratiques (pas de surcharge des serveurs)
 */

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Délai minimum entre 2 requêtes (ms) */
const RATE_LIMIT_MS = 2000;

/** Dernière requête effectuée (par domaine) */
const lastRequestByDomain = new Map<string, number>();

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Rate-limit : attend si nécessaire avant de faire une requête
 */
async function rateLimit(domain: string): Promise<void> {
  const last = lastRequestByDomain.get(domain) ?? 0;
  const now = Date.now();
  const elapsed = now - last;
  if (elapsed < RATE_LIMIT_MS) {
    await delay(RATE_LIMIT_MS - elapsed);
  }
  lastRequestByDomain.set(domain, Date.now());
}

/**
 * Fetch avec retry, user-agent, timeout
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 2
): Promise<Response> {
  const urlObj = new URL(url);
  const domain = urlObj.hostname;

  await rateLimit(domain);

  const headers: HeadersInit = {
    "User-Agent": DEFAULT_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    ...(options.headers as Record<string, string>),
  };

  let lastError: Error | null = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries) {
        await delay(1000 * (i + 1));
      }
    }
  }
  throw lastError ?? new Error("Fetch failed");
}

/**
 * Récupère le HTML d'une page
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
  return res.text();
}
