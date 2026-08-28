"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** Celda de tabla con texto truncado; clic abre un modal ligero con el contenido completo. */
export default function CeldaTruncada({ texto, titulo = "Detalle" }) {
  const [abierto, setAbierto] = useState(false);

  if (!texto) return <span>—</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={texto}
        className="block max-w-xs truncate text-left hover:underline"
      >
        {texto}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">{titulo}</h3>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{texto}</p>
          </div>
        </div>
      )}
    </>
  );
}
