import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { User } from "@prisma/client";

// Misma política que ya usa Codia Task en producción
// (RCD CodiaTask/backend/src/utils/password.js) — se porta tal cual para
// mantener un solo criterio entre los dos sistemas.
export const PASSWORD_MAX_AGE_DAYS = 182;

export const STRONG_PASSWORD_MESSAGE =
  "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un símbolo (! @ # $ % & * ? + -)";
export const REUSE_PASSWORD_MESSAGE =
  "No puedes reutilizar la contraseña anterior de forma seguida";
export const SAME_AS_CURRENT_MESSAGE =
  "La nueva contraseña debe ser distinta a la actual";

export class PasswordPolicyError extends Error {}

export function isStrongPassword(password: string) {
  const value = String(password || "");
  return (
    value.length >= 8 && /[A-Z]/.test(value) && /[!@#$%&*?+\-]/.test(value)
  );
}

function isPasswordExpired(passwordChangedAt: Date | null) {
  if (!passwordChangedAt) return true;
  const changed = passwordChangedAt.getTime();
  if (Number.isNaN(changed)) return true;
  const maxAgeMs = PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - changed >= maxAgeMs;
}

export function passwordPolicyFlags(
  user: Pick<User, "mustChangePassword" | "passwordChangedAt">,
) {
  const passwordExpired = isPasswordExpired(user.passwordChangedAt);
  return {
    passwordExpired,
    mustChangePassword: Boolean(user.mustChangePassword) || passwordExpired,
  };
}

async function hashesMatch(plain: string, hash: string | null) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export async function assertNewPasswordAllowed(
  newPassword: string,
  currentHash: string | null,
  previousHash: string | null,
) {
  if (!isStrongPassword(newPassword)) {
    throw new PasswordPolicyError(STRONG_PASSWORD_MESSAGE);
  }
  if (currentHash && (await hashesMatch(newPassword, currentHash))) {
    throw new PasswordPolicyError(SAME_AS_CURRENT_MESSAGE);
  }
  if (previousHash && (await hashesMatch(newPassword, previousHash))) {
    throw new PasswordPolicyError(REUSE_PASSWORD_MESSAGE);
  }
}

export async function rotateUserPassword(
  userId: string,
  newPassword: string,
  currentHash: string | null,
) {
  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: {
      previousPasswordHash: currentHash,
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    },
  });
  return newHash;
}
