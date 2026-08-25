/**
 * Sonde temporaire de diagnostic pour l'authentification MPG.
 *
 * L'environnement de développement n'a pas accès à mpg.football ; cette route
 * s'exécute sur Vercel, qui y a accès.
 *
 * Constat des passes précédentes :
 *  - mpg.football sert désormais une application statique : tout POST reçoit
 *    un 405 de nginx, l'ancien parcours OIDC ne peut plus fonctionner ;
 *  - api.mpg.football/user/sign-in est bien vivant (400 sur charge invalide).
 *
 * Cette passe lit le JavaScript public du site pour retrouver l'adresse de
 * connexion réellement utilisée aujourd'hui.
 *
 * À SUPPRIMER une fois le diagnostic terminé.
 */

import { NextResponse } from "next/server";

const MPG_WEB_URL = "https://mpg.football";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Mots-clés dont on veut lire le contexte dans le bundle. */
const KEYWORDS = ["AUTH0_AUDIENCE", "AUTH0_CLIENT", "AUTH0_NATIVE_DOMAIN"];

/** Motifs révélateurs d'un point d'entrée d'authentification. */
const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "api.mpg.football/…", re: /api\.mpg\.football\/[A-Za-z0-9/_.-]{2,60}/g },
  { label: "connect.ligue1.fr/…", re: /connect\.ligue1\.fr[A-Za-z0-9/_.?=&-]{0,80}/g },
  { label: "chemins d'auth", re: /["'`]\/(?:user\/)?(?:sign-in|signin|login|auth|oauth|token|authorize)[A-Za-z0-9/_-]{0,40}["'`]/g },
  { label: "client_id", re: /client_?[Ii]d["'`\s:=]{1,4}["'`][A-Za-z0-9_-]{4,60}["'`]/g },
  { label: "autres hôtes d'API", re: /https:\/\/[a-z0-9.-]*(?:mpg|ligue1|mlnstats)[a-z0-9.-]*\.[a-z]{2,6}/g },
];

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) return "";
  return res.text();
}

export async function GET() {
  const html = await fetchText(`${MPG_WEB_URL}/auth`).catch(() => "");

  const scriptUrls: string[] = [];
  for (const m of html.matchAll(/(?:src|href)=["']([^"']+\.js[^"']*)["']/g)) {
    const raw = m[1];
    scriptUrls.push(raw.startsWith("http") ? raw : `${MPG_WEB_URL}${raw.startsWith("/") ? "" : "/"}${raw}`);
  }

  const extraits: Record<string, string[]> = {};
  for (const k of KEYWORDS) extraits[k] = [];
  const lus: string[] = [];

  for (const url of scriptUrls.slice(0, 6)) {
    let js = "";
    try {
      js = await fetchText(url);
    } catch {
      continue;
    }
    if (!js) continue;
    lus.push(`${url.split("/").pop()} (${Math.round(js.length / 1024)} ko)`);

    for (const k of KEYWORDS) {
      let from = 0;
      while (extraits[k].length < 3) {
        const i = js.indexOf(k, from);
        if (i === -1) break;
        extraits[k].push(js.slice(Math.max(0, i - 420), i + 320).replace(/\s+/g, " "));
        from = i + k.length;
      }
    }
  }

  return NextResponse.json(
    {
      note: "Sonde de diagnostic — contexte des mots-clés d'authentification. À supprimer après usage.",
      date: new Date().toISOString(),
      bundlesLus: lus,
      extraits,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
