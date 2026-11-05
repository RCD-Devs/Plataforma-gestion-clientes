"use client";

import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/lib/constants";

// Avisa del exceso de tamaño antes de enviar: pasado el límite, el servidor
// rechaza la petición completa y se perdería lo escrito en el formulario.
// Con varios archivos el límite es para el total, porque viajan juntos.
export function FileInput({
  className,
  multiple,
  required,
}: {
  className?: string;
  multiple?: boolean;
  required?: boolean;
}) {
  return (
    <input
      type="file"
      name="file"
      accept=".pdf,.png,.jpg,.jpeg,.gif"
      multiple={multiple}
      required={required}
      className={className}
      onChange={(e) => {
        const total = Array.from(e.target.files ?? []).reduce((sum, f) => sum + f.size, 0);
        e.target.setCustomValidity(
          total > MAX_FILE_SIZE_BYTES ? `Supera el máximo de ${MAX_FILE_SIZE_MB} MB. Elige archivos más livianos.` : "",
        );
        e.target.reportValidity();
      }}
    />
  );
}
