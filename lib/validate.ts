// Rec. #63 — el <input type="email"> del cliente ya filtra la mayoría de
// los errores, pero un Server Action es un endpoint POST más: alguien
// puede llamarlo sin pasar por el formulario. Chequeo de forma, no de
// existencia real del correo (eso ya lo resuelve el flujo de verificación).
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
