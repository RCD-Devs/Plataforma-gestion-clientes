# Integración CodiaTask → Plataforma de gestión de clientes

> Punto de entrada de la documentación de integración. Léelo primero si eres nuevo en el proyecto.

## Por qué existe esta carpeta

Grupo Revo / Rompecabeza tiene dos aplicaciones internas construidas por separado:

1. **Plataforma de gestión de clientes** (este repo) — hub de clientes, portal del cliente, bolsa de horas y un tablero de solicitudes simplificado. En etapa MVP temprana, con auth de demo.
2. **Codia Task** (`RCD CodiaTask/`, repo aparte) — gestor de tareas tipo Jira, mucho más maduro (~270 releases), con roles reales, tablero Kanban con subtareas, tiempos, adjuntos, asistente IA y un endurecimiento de seguridad importante ya hecho.

La decisión de negocio es **no mantener dos sistemas de tareas por separado**: Codia Task se integra dentro de la Plataforma de gestión de clientes como su motor de tareas/tablero, y la Plataforma de clientes se queda como el "shell" de negocio (clientes, bolsa de horas, portal, reportes).

Esta carpeta documenta **por qué**, **cómo** y **en qué orden**.

## Índice

| Documento | Contenido |
| --- | --- |
| [01-arquitectura.md](./01-arquitectura.md) | Estado actual de cada plataforma, arquitectura objetivo, mapeo de modelos de datos |
| [02-roadmap.md](./02-roadmap.md) | Roadmap por fases (fusiona los 111 ítems de "Recomendaciones" + los 32 de "Roadmap" + el trabajo nuevo de integración) |
| [03-decisiones.md](./03-decisiones.md) | Registro de decisiones (ADR corto): qué está confirmado, qué es propuesta del Tech Lead pendiente de validar |
| [04-matriz-permisos.md](./04-matriz-permisos.md) | Matriz de roles y permisos unificada (7 roles de la Plataforma de clientes + 4 roles de Codia Task) |

## Documento para no-técnicos

Existe además un documento único, visual y sin jerga técnica que centraliza el checklist completo (143 ítems) y el roadmap, pensado para compartir con el equipo o dirección. Pide el link al Artifact "Roadmap CodiaTask × Plataforma REVO" a quien lo generó, o pide que se vuelva a publicar — su contenido es el mismo que estos documentos, en formato ejecutivo.

## Origen de la información

Este set de documentos centraliza y organiza el contenido de dos planillas Excel que vivían sueltas en el directorio raíz del workspace:

- `Proyecto Plataforma Interna - Recomendaciones.xlsx` — 111 ítems de checklist técnico, agrupados en 13 áreas (A–M), con prioridad P0/P1/P2.
- `Proyecto Plataforma Interna - Roadmap.xlsx` — 32 ítems con fase sugerida, tipo, y una matriz de permisos por rol.

Todo el contenido de ambos archivos está reflejado en [02-roadmap.md](./02-roadmap.md) y en el documento para no-técnicos; no se perdió ningún ítem en la consolidación.
