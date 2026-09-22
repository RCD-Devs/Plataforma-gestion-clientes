// Slug cosmético para URLs — el ID real (cuid, sin guiones) sigue siendo
// la clave de búsqueda; el slug solo hace la URL legible. Un link viejo
// sin slug ("/clientes/{id}/reporte") sigue funcionando igual, porque
// idFromSlug(id) sobre un id puro devuelve el mismo id.
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function withSlug(id: string, name: string): string {
  const slug = slugify(name);
  return slug ? `${id}-${slug}` : id;
}

// El id (cuid) nunca trae guiones, así que todo lo antes del primer
// guión es el id real — el resto es puro adorno para el lector.
export function idFromSlug(param: string): string {
  return param.split("-")[0];
}
