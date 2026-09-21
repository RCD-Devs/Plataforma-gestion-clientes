// Reglas puras (sin prisma/bcrypt) para poder usarlas también en el cliente.
export const PASSWORD_SYMBOLS = "! @ # $ % & * ? + -";

export const PASSWORD_RULES = [
  { key: "len", label: "Mínimo 8 caracteres", test: (v: string) => v.length >= 8 },
  { key: "upper", label: "Una letra mayúscula (A-Z)", test: (v: string) => /[A-Z]/.test(v) },
  {
    key: "symbol",
    label: `Un símbolo de esta lista: ${PASSWORD_SYMBOLS}`,
    test: (v: string) => /[!@#$%&*?+\-]/.test(v),
  },
];

export function missingPasswordRules(password: string) {
  const v = String(password || "");
  return PASSWORD_RULES.filter((r) => !r.test(v)).map((r) => r.label);
}
