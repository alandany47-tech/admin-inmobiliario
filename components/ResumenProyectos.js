import Link from "next/link";
import { AlertTriangle } from "lucide-react";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function pct(valor, total) {
  return total > 0 ? (valor / total) * 100 : 0;
}

/** Barra simple de "avance sobre un total" (una sola serie): valor/total con % a la derecha. */
function BarraAvance({ etiqueta, valor, total }) {
  const porcentaje = pct(valor, total);
  const excedido = valor > total;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">{etiqueta}</span>
        <span className={`font-medium ${excedido ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"}`}>
          {formatoMXN(valor)} de {formatoMXN(total)} ({porcentaje.toFixed(0)}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
        <div
          className={`h-full rounded-full ${excedido ? "bg-red-500" : "bg-foreground"}`}
          style={{ width: `${Math.min(porcentaje, 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Comparación Cobrado vs Gastado en una sola escala compartida (nunca dos
 * ejes): dos barras, mismo ancho máximo = el mayor de los dos valores, con
 * leyenda de color fija (Cobrado=verde, Gastado=azul) para que la identidad
 * de cada serie no dependa solo del color.
 */
function ComparacionCobradoGastado({ cobrado, gastado }) {
  const escala = Math.max(cobrado, gastado, 1);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Cobrado a clientes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> Gastado (WBS ejercido)
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${(cobrado / escala) * 100}%` }}
            />
          </div>
          <span className="w-28 shrink-0 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {formatoMXN(cobrado)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${(gastado / escala) * 100}%` }}
            />
          </div>
          <span className="w-28 shrink-0 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {formatoMXN(gastado)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Un card por proyecto con el cruce que no existía en ningún panel: cobranza
 * de clientes vs. gasto ejercido del presupuesto WBS de ese mismo proyecto,
 * más el contexto de avance de cada uno por separado (Ejercido/Presupuesto,
 * Cobrado/Contratado).
 */
export default function ResumenProyectos({ proyectos }) {
  if (proyectos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
        Sin proyectos configurados.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {proyectos.map((p) => (
        <div
          key={p.id}
          className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
              {p.codigo} — {p.nombre}
            </h3>
            {p.ordenesPendientes > 0 && (
              <Link
                href="/wbs/ordenes-cambio"
                className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
              >
                <AlertTriangle size={12} />
                {p.ordenesPendientes} orden{p.ordenesPendientes === 1 ? "" : "es"} de cambio pendiente
                {p.ordenesPendientes === 1 ? "" : "s"}
              </Link>
            )}
          </div>

          <ComparacionCobradoGastado cobrado={p.cobrado} gastado={p.ejercidoWbs} />

          <div className="flex flex-col gap-3 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
            <BarraAvance etiqueta="Presupuesto WBS ejercido" valor={p.ejercidoWbs} total={p.presupuestoWbs} />
            <BarraAvance etiqueta="Ventas cobradas" valor={p.cobrado} total={p.contratado} />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-black/[.06] pt-3 text-xs dark:border-white/[.08]">
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Disponible WBS</p>
              <p
                className={`font-medium ${
                  p.disponibleWbs < 0 ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"
                }`}
              >
                {formatoMXN(p.disponibleWbs)}
              </p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Por cobrar</p>
              <p className="font-medium text-black dark:text-zinc-50">{formatoMXN(p.porCobrar)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
