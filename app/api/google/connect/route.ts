import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { isTeamRole } from "@/lib/authz";
import {
  authorizeUrl,
  googleConfigured,
  GOOGLE_STATE_COOKIE,
} from "@/lib/googleCalendar";

// Paso 1 de "Vincular Google Calendar": manda a la pantalla de permiso de
// Google. El state aleatorio en cookie protege el callback de CSRF.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !isTeamRole(user.role))
    return NextResponse.redirect(new URL("/login", req.url));
  if (!googleConfigured())
    return NextResponse.redirect(
      new URL("/perfil?tab=calendario&google=no-config", req.url),
    );

  const state = crypto.randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // lax: la cookie tiene que viajar en la vuelta desde Google
    path: "/api/google",
    maxAge: 600,
  });
  return res;
}
