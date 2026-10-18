/**
 * POST   /api/mpg/auth — connexion MPG (simple, puis OIDC pour les comptes
 *        créés depuis février 2025). Le jeton part dans un cookie httpOnly.
 * DELETE /api/mpg/auth — déconnexion.
 * GET    /api/mpg/auth — session ouverte ?
 */
import { NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";
import { encodeSession, MPG_COOKIE, readMpgSession } from "@/lib/mpg-link";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!rateLimit(`mpgauth:${clientKey(request)}`, 8, 15 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie dans quelques minutes." }, { status: 429 });
  }
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
  }
  try {
    const { token, userId } = await createMpgClient().signIn(body.email, body.password);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(MPG_COOKIE, encodeSession(token, userId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/mpg",
      maxAge: 7 * 24 * 3600,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Connexion MPG refusée : vérifie ton email et ton mot de passe." }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MPG_COOKIE, "", { path: "/api/mpg", maxAge: 0 });
  return res;
}

export async function GET() {
  return NextResponse.json({ connected: !!(await readMpgSession()) });
}
