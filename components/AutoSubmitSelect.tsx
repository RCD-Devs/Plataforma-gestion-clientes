"use client";

import type { ComponentProps } from "react";

// <select> de un formulario GET que se envía solo al cambiar (filtros).
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return (
    <span className="relative inline-block">
      <select
        {...props}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="appearance-none rounded-lg border border-[#e4e8ec] bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-[#081826] outline-none hover:border-[#c3ccd4] focus:border-[#0bdbcf]"
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#5d6b77]">
        ▼
      </span>
    </span>
  );
}
