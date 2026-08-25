/**
 * En-têtes navigateur pour les appels à MPG et Ligue 1 Connect.
 *
 * Les requêtes d'authentification n'envoyaient que `Content-Type`. Node se
 * présente alors avec `User-Agent: node`, signature typique d'un robot : la
 * première étape OIDC recevait un `405 Not Allowed` renvoyé par nginx, donc
 * par le filtrage en amont et non par l'application. Les scrapers du projet,
 * eux, envoient déjà un User-Agent de navigateur (cf. lib/scrapers/base-scraper)
 * et passent sans problème.
 */

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** En-têtes communs à toutes les requêtes d'authentification. */
export function mpgBrowserHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    ...extra,
  };
}

/**
 * En-têtes pour une navigation de page (étapes qui suivent une redirection).
 * `Accept` annonce du HTML, comme le ferait un navigateur.
 */
export function mpgPageHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return mpgBrowserHeaders({
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...extra,
  });
}
