// "@ale" justo antes del cursor → "ale". Null si no se está escribiendo una
// mención (el @ tiene que ir al inicio o después de un espacio, así un
// correo como x@y.cl no abre el menú).
export function mentionQuery(text: string, caret: number) {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return m ? { query: m[1], start: caret - m[1].length - 1 } : null;
}
