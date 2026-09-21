import crypto from "crypto";

export function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Mensaje específico según por qué un enlace no sirve (null = sirve).
export function tokenRecordProblem(
  record: { usedAt: Date | null; expiresAt: Date } | null,
) {
  if (!record)
    return "Este enlace no es válido. Puede que se haya generado uno más nuevo: revisa tu correo y usa el último enlace recibido.";
  if (record.usedAt)
    return "Este enlace ya fue usado o fue reemplazado por uno más nuevo. Si ya definiste tu contraseña, inicia sesión; si no, pide un enlace nuevo.";
  if (record.expiresAt < new Date()) return "Este enlace venció. Pide uno nuevo.";
  return null;
}
