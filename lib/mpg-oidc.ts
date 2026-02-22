/**
 * Auth OIDC MPG - pour comptes créés après février 2025
 * Basé sur mpg-coach-bot AuthentMpgWebClient + AuthentConnectLigue1Client
 */

import type { UserSignIn } from "@/types/mpg";

const MPG_WEB_URL = "https://mpg.football";
const LIGUE1_CONNECT_URL = "https://connect.ligue1.fr";

function getSetCookieHeaders(res: Response): string[] {
  if (typeof res.headers.getSetCookie === "function") {
    return res.headers.getSetCookie();
  }
  const v = res.headers.get("set-cookie");
  return v ? [v] : [];
}

function joinCookies(setCookie: string[]): string {
  if (!setCookie.length) return "";
  return setCookie
    .map((s) => (s ?? "").split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function extractFirstGroup(text: string, regex: string): string | null {
  const m = text.match(new RegExp(regex));
  return m ? m[1] : null;
}

function paramsToMap(params: string | null): Record<string, string> {
  if (!params) return {};
  const map: Record<string, string> = {};
  params.split("&").forEach((p) => {
    const [k, v] = p.split("=");
    if (k && v) map[k] = decodeURIComponent(v);
  });
  return map;
}

export async function signInOidc(login: string, password: string): Promise<UserSignIn> {
  const amplitudeId = crypto.randomUUID();

  // --- Step 1: POST auth MPG ---
  const form1 = new URLSearchParams();
  form1.set("email", login);
  form1.set("password", password);

  const res1 = await fetch(
    `${MPG_WEB_URL}/auth?_data=routes/__home/__auth/auth&ext-amplitudeId=${amplitudeId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form1.toString(),
      redirect: "manual",
    }
  );

  const redirectHeader = res1.headers.get("x-remix-redirect");
  if (!redirectHeader) {
    const text = await res1.text();
    throw new Error(`OIDC step 1 failed: no redirect. ${text.slice(0, 200)}`);
  }

  const redirectUrl = redirectHeader.replace(
    "ext-amplitudeId=",
    `ext-amplitudeId=${amplitudeId}`
  );
  const url1 = new URL(redirectUrl.startsWith("http") ? redirectUrl : `${MPG_WEB_URL}${redirectUrl}`);

  // --- Step 2: Follow redirect to Ligue1 ---
  const res2 = await fetch(url1.toString(), {
    redirect: "manual",
    headers: { Cookie: joinCookies(getSetCookieHeaders(res1)) },
  });

  if (res2.status !== 302 && res2.status !== 303) {
    throw new Error(`OIDC step 2: expected redirect, got ${res2.status}`);
  }

  const loginUrl = res2.headers.get("location");
  if (!loginUrl) throw new Error("OIDC step 2: no location header");

  const fullLoginUrl = loginUrl.startsWith("http") ? loginUrl : `${LIGUE1_CONNECT_URL}${loginUrl}`;
  const loginUri = new URL(fullLoginUrl);
  const state = extractFirstGroup(fullLoginUrl, "state=([^&]+)");
  if (!state) throw new Error("OIDC step 2: state not found");

  const cookies2 = joinCookies(res2.headers.getSetCookie?.() ?? res2.headers.get("set-cookie"));

  // --- Step 3: POST credentials to Ligue1 ---
  const form3 = new URLSearchParams();
  form3.set("state", state);
  form3.set("username", login);
  form3.set("password", password);

  const path3 = loginUri.pathname;
  const query3 = loginUri.search.slice(1);

  const res3 = await fetch(
    `${LIGUE1_CONNECT_URL}${path3}${query3 ? `?${query3}` : ""}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies2,
      },
      body: form3.toString(),
      redirect: "manual",
    }
  );

  const location3 = res3.headers.get("location");
  if (!location3) {
    const text = await res3.text();
    if (text.includes("invalid") || text.includes("error")) {
      throw new Error("Identifiants incorrects (Ligue 1)");
    }
    throw new Error(`OIDC step 3: no location. Status ${res3.status}`);
  }

  const resumeUrl = location3.startsWith("http") ? location3 : `${LIGUE1_CONNECT_URL}${location3}`;
  const resumeUri = new URL(resumeUrl);
  const cookies3 = joinCookies(getSetCookieHeaders(res3));

  // --- Step 4: GET resume page to extract code ---
  const res4 = await fetch(
    `${resumeUri.origin}${resumeUri.pathname}${resumeUri.search}`,
    {
      headers: { Cookie: cookies3 },
      redirect: "manual",
    }
  );

  const html4 = await res4.text();
  const code = extractFirstGroup(html4, 'name="code"\\s+value="([^"]+)"');
  if (!code) {
    throw new Error("OIDC step 4: code not found. Vérifie tes identifiants.");
  }

  // --- Step 5: POST code to MPG callback ---
  const form5 = new URLSearchParams();
  form5.set("code", code);

  const res5 = await fetch(`${MPG_WEB_URL}/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form5.toString(),
    redirect: "manual",
  });

  const sessionCookie = getSetCookieHeaders(res5);
  const session = sessionCookie
    .find((s) => s?.includes("__session="))
    ?.split(";")[0]
    ?.split("=")[1];

  if (!session) {
    throw new Error("OIDC step 5: session cookie not found");
  }

  // --- Step 6: GET dashboard to extract token ---
  const res6 = await fetch(`${MPG_WEB_URL}/dashboard?_data=root`, {
    headers: { Cookie: `__session=${session}` },
  });

  if (!res6.ok) {
    throw new Error(`OIDC step 6: dashboard failed ${res6.status}`);
  }

  const text = await res6.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    const tokenMatch = text.match(/"token"\s*:\s*"([^"]+)"/);
    const userIdMatch = text.match(/"userId"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      return {
        token: tokenMatch[1],
        userId: userIdMatch?.[1] ?? "",
      };
    }
    throw new Error("Réponse dashboard invalide");
  }

  const token = (data.token ?? data.authorization) as string | undefined;

  if (!token) {
    throw new Error("Token non trouvé dans la réponse dashboard");
  }

  // Récupérer userId via l'API (le dashboard web peut ne pas le retourner)
  let userId = (data.userId ?? data.id ?? "") as string;
  if (!userId) {
    const userRes = await fetch("https://api.mpg.football/user", {
      headers: { Authorization: token },
    });
    if (userRes.ok) {
      const userData = (await userRes.json()) as { id?: string };
      userId = userData.id ?? "";
    }
  }

  return { token, userId };
}
