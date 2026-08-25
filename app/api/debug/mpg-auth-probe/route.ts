/**
 * Sonde temporaire de diagnostic pour l'authentification MPG.
 *
 * L'environnement de développement n'a pas accès à mpg.football ; cette route
 * s'exécute sur Vercel, qui y a accès. Elle teste plusieurs variantes de la
 * première étape OIDC et rapporte ce que MPG répond.
 *
 * Aucun identifiant réel n'est utilisé ni accepté : le 405 observé survient
 * avant toute vérification des identifiants, des valeurs bidon suffisent donc
 * à distinguer « l'adresse refuse ce type de requête » de « identifiants
 * incorrects ».
 *
 * À SUPPRIMER une fois le diagnostic terminé.
 */

import { NextResponse } from "next/server";

const MPG_WEB_URL = "https://mpg.football";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FAKE = { email: "probe@example.invalid", password: "probe-not-a-real-password" };

interface ProbeResult {
  test: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  server?: string | null;
  contentType?: string | null;
  /** En-tête que l'étape 1 doit renvoyer quand tout va bien. */
  remixRedirect?: string | null;
  location?: string | null;
  bodyStart?: string;
  error?: string;
}

async function probe(
  test: string,
  url: string,
  init: RequestInit & { method: string }
): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const text = await res.text().catch(() => "");
    return {
      test,
      url,
      method: init.method,
      status: res.status,
      statusText: res.statusText,
      server: res.headers.get("server"),
      contentType: res.headers.get("content-type"),
      remixRedirect: res.headers.get("x-remix-redirect"),
      location: res.headers.get("location"),
      bodyStart: text.slice(0, 180).replace(/\s+/g, " ").trim(),
    };
  } catch (err) {
    return {
      test,
      url,
      method: init.method,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const form = new URLSearchParams();
  form.set("email", FAKE.email);
  form.set("password", FAKE.password);

  const postHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": BROWSER_UA,
    Accept: "*/*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    Origin: MPG_WEB_URL,
    Referer: `${MPG_WEB_URL}/auth`,
  };

  const dataParam = "routes/__home/__auth/auth";
  const amplitude = "00000000-0000-4000-8000-000000000000";

  const results = await Promise.all([
    // 0. La lambda joint-elle simplement le site ?
    probe("0-accueil", `${MPG_WEB_URL}/`, {
      method: "GET",
      headers: { "User-Agent": BROWSER_UA },
    }),
    // 1. La page de connexion existe-t-elle en GET ?
    probe("1-page-auth-GET", `${MPG_WEB_URL}/auth`, {
      method: "GET",
      headers: { "User-Agent": BROWSER_UA },
    }),
    // 2. La requête telle que l'app la fait aujourd'hui (slashes non encodés)
    probe(
      "2-etape1-actuelle",
      `${MPG_WEB_URL}/auth?_data=${dataParam}&ext-amplitudeId=${amplitude}`,
      { method: "POST", headers: postHeaders, body: form.toString() }
    ),
    // 3. Même chose mais avec le paramètre _data encodé
    probe(
      "3-etape1-data-encode",
      `${MPG_WEB_URL}/auth?_data=${encodeURIComponent(dataParam)}&ext-amplitudeId=${amplitude}`,
      { method: "POST", headers: postHeaders, body: form.toString() }
    ),
    // 4. Sans aucun paramètre de requête
    probe("4-etape1-sans-params", `${MPG_WEB_URL}/auth`, {
      method: "POST",
      headers: postHeaders,
      body: form.toString(),
    }),
    // 5. Convention Remix v2 (points au lieu de doubles tirets bas)
    probe(
      "5-etape1-remix-v2",
      `${MPG_WEB_URL}/auth?_data=routes%2F_home._auth.auth&ext-amplitudeId=${amplitude}`,
      { method: "POST", headers: postHeaders, body: form.toString() }
    ),
    // 6. Sans User-Agent navigateur, pour isoler l'effet du filtrage
    probe(
      "6-etape1-sans-UA",
      `${MPG_WEB_URL}/auth?_data=${dataParam}&ext-amplitudeId=${amplitude}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }
    ),
  ]);

  return NextResponse.json(
    {
      note: "Sonde de diagnostic. Aucun identifiant réel n'est utilisé. À supprimer après usage.",
      date: new Date().toISOString(),
      results,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
