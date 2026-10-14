"use client";

import { useRef, useState, useTransition } from "react";
import { setAvatar, removeAvatar } from "@/app/actions";

const SIZE = 256;

// Recorta al centro y achica a 256x256 JPEG en el navegador: el servidor
// solo recibe ~20 KB, sin importar si la foto original era de 8 MB.
async function toSquareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas
    .getContext("2d")!
    .drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85),
  );
}

export function AvatarUpload({ hasPhoto }: { hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError("");
          startTransition(async () => {
            try {
              const fd = new FormData();
              fd.append("avatar", await toSquareJpeg(file), "avatar.jpg");
              const res = await setAvatar(fd);
              if (!res.ok) setError("No se pudo guardar la foto.");
            } catch {
              setError("No se pudo leer esa imagen.");
            }
          });
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="font-semibold text-[#08a89f] hover:underline disabled:opacity-50"
      >
        {pending ? "Guardando…" : hasPhoto ? "Cambiar foto" : "Subir foto"}
      </button>
      {hasPhoto && !pending && (
        <button
          type="button"
          onClick={() => startTransition(() => removeAvatar())}
          className="text-[#6b7280] hover:text-[#d21f3c] hover:underline"
        >
          Quitar
        </button>
      )}
      {error && <span className="text-[#d21f3c]">{error}</span>}
    </div>
  );
}
