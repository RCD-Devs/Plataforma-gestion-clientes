import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveProjectId, projectHref } from "@/lib/projectInsights";

export const dynamic = "force-dynamic";

// Compat: /proyectos/{id} y /proyectos/{id}-{nombre} (formato de antes de
// anidar por cliente) — resuelve y redirige a la URL nueva
// /proyectos/{cliente}/{proyecto}. Un link guardado nunca se rompe.
export default async function ProyectoCompatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = await resolveProjectId(rawId);
  if (!id) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, client: { select: { id: true, name: true, slug: true } } },
  });
  if (!project) notFound();

  redirect(projectHref(project, project.client));
}
