import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    const client = createMpgClient();
    const { token, userId } = await client.signIn(email, password);

    return NextResponse.json({
      token,
      userId,
      success: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de connexion";
    return NextResponse.json(
      { error: message, success: false },
      { status: 401 }
    );
  }
}
