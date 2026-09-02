"use client";

import { useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

// Asistente IA (fusión Codia Task, fase A — solo lectura, Gemini
// gratis). Widget flotante, disponible para todo el equipo interno
// (excluidos los clientes, que ya no llegan a este layout).
export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/asistente/chat" }),
  });

  const pending = status === "submitted" || status === "streaming";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#0bdbcf] text-xl shadow-lg hover:bg-[#09c4ba]"
        aria-label="Asistente"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-xl border border-[#e4e8ec] bg-white shadow-2xl">
          <div className="border-b border-[#e4e8ec] bg-[#081826] px-4 py-3">
            <div className="text-sm font-semibold text-white">Asistente RGC</div>
            <div className="text-[11px] text-[#9aa5ad]">
              Busca tareas y navega — no crea ni edita nada todavía
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="text-xs text-[#7f7f7f]">
                Prueba algo como "qué tengo asignado" o "tareas en revisión de
                ACHS".
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <p
                        key={i}
                        className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${
                          m.role === "user"
                            ? "bg-[#0bdbcf]/15 text-[#065f5a]"
                            : "bg-[#f3f4f6] text-[#1a1a1a]"
                        }`}
                      >
                        {part.text}
                      </p>
                    );
                  }
                  if (part.type.startsWith("tool-") && "state" in part && part.state === "output-available") {
                    const output = part.output as { url?: string; etiqueta?: string } | null;
                    if (output?.url && output?.etiqueta) {
                      return (
                        <div key={i} className="mt-1">
                          <Link
                            href={output.url}
                            className="inline-block rounded-md border border-[#0bdbcf] bg-[#e0fbf9] px-2.5 py-1 text-xs font-semibold text-[#065f5a] hover:bg-[#c9f5f1]"
                          >
                            {output.etiqueta} →
                          </Link>
                        </div>
                      );
                    }
                  }
                  return null;
                })}
              </div>
            ))}
            {pending && (
              <div className="text-xs text-[#7f7f7f]">Pensando…</div>
            )}
            {error && (
              <div className="rounded-lg border border-[#fda565] bg-[#fdf1e3] px-3 py-2 text-xs text-[#9a5a25]">
                {error.message || "Algo falló. Intenta de nuevo."}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-[#e4e8ec] p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
              className="flex-1 rounded-md border border-[#e4e8ec] px-2.5 py-1.5 text-sm outline-none focus:border-[#0bdbcf]"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="rounded-md bg-[#0bdbcf] px-3 py-1.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba] disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
