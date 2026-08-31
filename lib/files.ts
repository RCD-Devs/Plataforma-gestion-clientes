// Valida el tipo real de un archivo por sus primeros bytes (magic number),
// no por la extensión declarada ni el Content-Type que manda el navegador —
// ambos los controla quien sube el archivo y son triviales de falsificar.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

type FileSignature = {
  kind: "pdf" | "png";
  ext: string;
  contentType: string;
  match: (buf: Buffer) => boolean;
};

const SIGNATURES: FileSignature[] = [
  {
    kind: "pdf",
    ext: ".pdf",
    contentType: "application/pdf",
    match: (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-",
  },
  {
    kind: "png",
    ext: ".png",
    contentType: "image/png",
    match: (buf) =>
      buf
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    kind: "png", // se agrupa con las imágenes para el badge "IMG" existente
    ext: ".jpg",
    contentType: "image/jpeg",
    match: (buf) => buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    kind: "png",
    ext: ".gif",
    contentType: "image/gif",
    match: (buf) => {
      const s = buf.subarray(0, 6).toString("latin1");
      return s === "GIF87a" || s === "GIF89a";
    },
  },
];

export function sniffFile(buf: Buffer): FileSignature | null {
  return SIGNATURES.find((s) => s.match(buf)) ?? null;
}
