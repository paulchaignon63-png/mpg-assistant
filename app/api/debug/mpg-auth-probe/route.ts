/**
 * Sonde temporaire de diagnostic pour l'authentification MPG.
 *
 * Constat des passes précédentes :
 *  - mpg.football est une application Expo statique (tout POST → 405 nginx) ;
 *  - api.mpg.football/user/sign-in est vivant mais refuse (403) ;
 *  - le site s'authentifie via Auth0 (fournisseur d'identité de Ligue 1).
 *
 * Configuration extraite du bundle public :
 *   domaine   : connect.ligue1.fr
 *   audience  : https://mpg.ligue1.fr
 *   client web: XNNUupMREjh0ULck1InJRC6gb8kyMfdg
 *   client app: MPSvFrsiwRmRr36YFQ7cI2P5RgxddoDK
 *
 * Cette passe teste si l'échange direct « identifiant + mot de passe → jeton »
 * est ouvert. Aucun identifiant réel n'est utilisé : la réponse d'Auth0
 * distingue « mode ouvert, identifiants invalides » de « mode fermé » sans
 * qu'un vrai mot de passe soit nécessaire.
 *
 * À SUPPRIMER une fois le diagnostic terminé.
 */

import { NextResponse } from "next/server";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const AUTH0_DOMAIN = "https://connect.ligue1.fr";
const AUDIENCE = "https://mpg.ligue1.fr";
const SCOPE = "openid profile email offline_access";
const NATIVE_CLIENT_ID = "MPSvFrsiwRmRr36YFQ7cI2P5RgxddoDK";
const WEB_CLIENT_ID = "XNNUupMREjh0ULck1InJRC6gb8kyMfdg";

const FAKE_USER = "probe.diagnostic@example.com";
const FAKE_PASS = "not-a-real-password-000";

interface GrantResult {
  test: string;
  status?: number;
  reponse?: string;
  erreur?: string;
}

async function tryGrant(
  label: string,
  payload: Record<string, string>
): Promise<GrantResult> {
  try {
    const res = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": BROWSER_UA },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return { test: label, status: res.status, reponse: text.slice(0, 300) };
  } catch (err) {
    return { test: label, erreur: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const results: GrantResult[] = [];

  // Configuration publique du fournisseur : dit quels modes sont supportés.
  try {
    const res = await fetch(`${AUTH0_DOMAIN}/.well-known/openid-configuration`, {
      headers: { "User-Agent": BROWSER_UA },
    });
    const json = (await res.json()) as Record<string, unknown>;
    results.push({
      test: "0-configuration-publique",
      status: res.status,
      reponse: JSON.stringify({
        issuer: json.issuer,
        token_endpoint: json.token_endpoint,
        grant_types_supported: json.grant_types_supported,
      }),
    });
  } catch (err) {
    results.push({ test: "0-configuration-publique", erreur: String(err) });
  }

  results.push(
    await tryGrant("1-mot-de-passe-client-mobile", {
      grant_type: "password",
      username: FAKE_USER,
      password: FAKE_PASS,
      audience: AUDIENCE,
      scope: SCOPE,
      client_id: NATIVE_CLIENT_ID,
    })
  );
  results.push(
    await tryGrant("2-mot-de-passe-client-web", {
      grant_type: "password",
      username: FAKE_USER,
      password: FAKE_PASS,
      audience: AUDIENCE,
      scope: SCOPE,
      client_id: WEB_CLIENT_ID,
    })
  );
  results.push(
    await tryGrant("3-mot-de-passe-realm", {
      grant_type: "http://auth0.com/oauth/grant-type/password-realm",
      realm: "Username-Password-Authentication",
      username: FAKE_USER,
      password: FAKE_PASS,
      audience: AUDIENCE,
      scope: SCOPE,
      client_id: NATIVE_CLIENT_ID,
    })
  );

  return NextResponse.json(
    {
      note: "Sonde de diagnostic — aucun identifiant réel. À supprimer après usage.",
      lecture:
        "invalid_grant / 'Wrong email or password' = mode OUVERT (il ne manque que de vrais identifiants). unauthorized_client / unsupported = mode FERMÉ.",
      date: new Date().toISOString(),
      results,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
