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
  const found: Record<string, Set<string>> = {};
  for (const p of PATTERNS) found[p.label] = new Set<string>();

  const scanned: string[] = [];
  const errors: string[] = [];

  function scan(text: string) {
    for (const p of PATTERNS) {
      for (const m of text.matchAll(p.re)) {
        const v = m[0].replace(/^["'`]|["'`]$/g, "");
        if (found[p.label].size < 60) found[p.label].add(v);
      }
    }
  }

  let html = "";
  try {
    html = await fetchText(`${MPG_WEB_URL}/auth`);
    scan(html);
  } catch (err) {
    errors.push(`html: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Adresses des bundles JavaScript référencés par la page
  const scriptUrls = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)=["']([^"']+\.js[^"']*)["']/g)) {
    const raw = m[1];
    scriptUrls.add(raw.startsWith("http") ? raw : `${MPG_WEB_URL}${raw.startsWith("/") ? "" : "/"}${raw}`);
  }

  // Les bundles principaux d'abord, et on borne pour rester raisonnable
  const targets = Array.from(scriptUrls).slice(0, 12);
  for (const url of targets) {
    try {
      const js = await fetchText(url);
      if (js) {
        scanned.push(`${url} (${Math.round(js.length / 1024)} ko)`);
        scan(js);
      }
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(
    {
      note: "Sonde de diagnostic — lecture du JavaScript public de MPG. À supprimer après usage.",
      date: new Date().toISOString(),
      scriptsTrouves: scriptUrls.size,
      scriptsLus: scanned,
      erreurs: errors,
      resultats: Object.fromEntries(
        Object.entries(found).map(([k, v]) => [k, Array.from(v)])
      ),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
