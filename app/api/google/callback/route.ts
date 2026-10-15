import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isTeamRole } from "@/lib/authz";
import {
  decryptToken,
  encryptToken,
  exchangeCode,
  revokeToken,
  GOOGLE_STATE_COOKIE,
} from "@/lib/googleCalendar";

// Paso 2: Google vuelve acá con ?code=…&state=…. Se guarda el refresh
// token (cifrado) de la persona logueada en REVO, no de quien diga el state.
export async function GET(req: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(
      new URL(`/perfil?tab=calendario&google=${result}`, req.url),
    );
    res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const user = await getSessionUser();
  if (!user || !isTeamRole(user.role))
    return NextResponse.redirect(new URL("/login", req.url));

  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  const expected = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  // ?error=access_denied cuando la persona apreta "Cancelar" en Google.
  if (params.get("error")) return back("cancelado");
  const code = params.get("code");
  if (!code || !state || !expected || state !== expected) return back("error");

  const result = await exchangeCode(code).catch(() => null);
  if (!result) return back("error");

  // Re-vincular (otra cuenta o la misma): el token anterior se revoca para
  // no dejar permisos huérfanos en Google.
  const previous = await prisma.googleCalendarLink.findUnique({
    where: { userId: user.id },
  });
  const previousToken = previous ? decryptToken(previous.refreshToken) : null;
  await prisma.googleCalendarLink.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      googleEmail: result.email,
      refreshToken: encryptToken(result.refreshToken),
    },
    update: {
      googleEmail: result.email,
      refreshToken: encryptToken(result.refreshToken),
    },
  });
  if (previousToken && previousToken !== result.refreshToken)
    await revokeToken(previousToken);

  return back("ok");
}
