"use client";

import { useRef, useState } from "react";
import { addComment } from "@/app/actions";
import { mentionQuery } from "@/lib/mentions";

type MentionUser = { id: string; name: string };

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Comentario con menciones: al escribir @ + letras sugiere personas del
// equipo cuyo nombre (o apellido) empieza así, sin distinguir mayúsculas
// ni tildes. Los elegidos viajan como ids en "mentions"; el servidor solo
// avisa a los que siguen escritos como @Nombre en el texto.
export function CommentForm({ requestId, users }: { requestId: string; users: MentionUser[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [mentioned, setMentioned] = useState<MentionUser[]>([]);
  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const matches = menu
    ? users
        .filter((u) => fold(u.name).split(/\s+/).some((w) => w.startsWith(fold(menu.query))))
        .slice(0, 6)
    : [];
  const open = matches.length > 0;

  function refreshMenu(value: string, caret: number) {
    setMenu(mentionQuery(value, caret));
    setActive(0);
  }

  function pick(u: MentionUser) {
    if (!menu) return;
    const caret = inputRef.current?.selectionStart ?? text.length;
    const insert = `@${u.name} `;
    const next = text.slice(0, menu.start) + insert + text.slice(caret);
    setText(next);
    setMentioned((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]));
    setMenu(null);
    const pos = menu.start + insert.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <form
      action={async (fd) => {
        await addComment(fd);
        setText("");
        setMentioned([]);
      }}
      className="mt-3 flex gap-2"
    >
      <input type="hidden" name="requestId" value={requestId} />
      {mentioned
        .filter((u) => text.includes(`@${u.name}`))
        .map((u) => (
          <input key={u.id} type="hidden" name="mentions" value={u.id} />
        ))}
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          name="body"
          value={text}
          required
          autoComplete="off"
          placeholder="Comentario para el cliente… (@ para mencionar al equipo)"
          className="w-full rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]"
          role="combobox"
          aria-expanded={open}
          aria-controls="mention-list"
          aria-autocomplete="list"
          onChange={(e) => {
            setText(e.target.value);
            refreshMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onClick={(e) => refreshMenu(text, e.currentTarget.selectionStart ?? text.length)}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const d = e.key === "ArrowDown" ? 1 : -1;
              setActive((a) => (a + d + matches.length) % matches.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[active]);
            } else if (e.key === "Escape") {
              setMenu(null);
            }
          }}
        />
        {open && (
          <ul
            id="mention-list"
            role="listbox"
            className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-[#e6e8eb] bg-white py-1 text-sm shadow-lg"
          >
            {matches.map((u, i) => (
              <li
                key={u.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-[#e0fbf9] text-[#065f5a]" : ""}`}
              >
                {u.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="shrink-0 rounded-lg bg-[#0bdbcf] px-4 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
        Comentar
      </button>
    </form>
  );
}

// Resalta las @menciones de personas conocidas dentro del texto.
export function CommentBody({ body, names }: { body: string; names: string[] }) {
  const known = names.filter((n) => body.includes(`@${n}`)).sort((a, b) => b.length - a.length);
  if (known.length === 0) return <>{body}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`(${known.map((n) => `@${esc(n)}`).join("|")})`, "g"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-[#e0fbf9] px-1 font-medium text-[#065f5a]">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
