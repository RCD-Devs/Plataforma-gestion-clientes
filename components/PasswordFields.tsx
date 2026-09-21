"use client";

import { useState } from "react";
import { PASSWORD_RULES } from "@/lib/password-rules";
import { SubmitButton } from "@/components/SubmitButton";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

// Campos de contraseña nueva + repetir, con checklist en vivo. El botón queda
// deshabilitado hasta que se cumplan las reglas y coincidan (el servidor
// vuelve a validar igual).
export function PasswordFields({ name }: { name: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const rules = PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(pw) }));
  const matches = pw.length > 0 && pw === pw2;
  const ready = rules.every((r) => r.ok) && matches;
  const type = show ? "text" : "password";

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-semibold">Contraseña nueva</label>
        <input
          name={name}
          type={type}
          required
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold">Repite la contraseña nueva</label>
        <input
          name="confirmPassword"
          type={type}
          required
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className={inputCls}
        />
        {pw2.length > 0 && !matches && (
          <p className="mt-1 text-xs text-[#9a4a1e]">Las contraseñas no coinciden.</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-[#5d6b77]">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Mostrar contraseñas
      </label>
      <ul className="space-y-1 rounded-lg bg-[#f4f6f8] p-3 text-xs">
        {rules.map((r) => (
          <li key={r.key} className={r.ok ? "text-[#08a89f]" : "text-[#5d6b77]"}>
            {r.ok ? "✓" : "○"} {r.label}
          </li>
        ))}
        <li className="text-[#7f7f7f]">
          Otros símbolos (_ . , ( ) etc.) no cuentan como símbolo válido.
        </li>
      </ul>
      <SubmitButton
        disabled={!ready}
        className="w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
        pendingLabel="Guardando…"
      >
        Guardar contraseña
      </SubmitButton>
    </>
  );
}
