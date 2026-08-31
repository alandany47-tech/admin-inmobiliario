"use client";

import { useState } from "react";

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/**
 * Acordeón de gasto pagado por categoría WBS: al desplegar una categoría
 * muestra sus subpartidas, el monto pagado de cada una y el porcentaje que
 * representa dentro del total pagado de esa categoría.
 */
export default function DesgloseCategoriasWbs({ categorias, totalGeneral }) {
  const [expandidos, setExpandidos] = useState(new Set());

  function alternar(etiqueta) {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(etiqueta)) siguiente.delete(etiqueta);
      else siguiente.add(etiqueta);
      return siguiente;
    });
  }

  if (categorias.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin pagos registrados.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {categorias.map((cat) => {
        const porcentaje = totalGeneral > 0 ? (cat.total / totalGeneral) * 100 : 0;
        const expandido = expandidos.has(cat.etiqueta);
        return (
          <div key={cat.etiqueta} className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => alternar(cat.etiqueta)}
              className="flex flex-col gap-1.5 text-left"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{cat.etiqueta}</span>
                <span className="font-medium text-black dark:text-zinc-50">
                  {formatoMXN(cat.total)} <span className="text-zinc-400">({porcentaje.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${Math.min(porcentaje, 100)}%` }}
                />
              </div>
            </button>

            {expandido && (
              <div className="ml-5 flex flex-col divide-y divide-black/[.06] border-t border-black/[.06] pt-2 dark:divide-white/[.08] dark:border-white/[.08]">
                {cat.subpartidas.map((sub) => (
                  <div key={sub.etiqueta} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">{sub.etiqueta}</span>
                    <span className="shrink-0 text-zinc-700 dark:text-zinc-300">
                      {formatoMXN(sub.total)} ({sub.porcentaje.toFixed(0)}% de la categoría)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
