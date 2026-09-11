"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Search, Split, X } from "lucide-react";
import { confirmarRepartoCorporativo } from "@/app/actions/reparto";
import { compararCodigoWbsNatural, construirRutaWbs } from "@/lib/wbs";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  if (!fecha) return "—";
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const inputClase = "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

/** Modal para repartir una solicitud corporativa pagada entre 2-4 partidas WBS destino. */
function ModalRepartirGasto({ solicitud, wbsCatalog, proyectosPorId, onCerrar, onRepartido }) {
  const wbsPorId = useMemo(() => new Map(wbsCatalog.map((w) => [w.id, w])), [wbsCatalog]);
  const wbsConHijos = useMemo(
    () => new Set(wbsCatalog.filter((w) => w.parent_id).map((w) => w.parent_id)),
    [wbsCatalog]
  );
  const wbsHojas = useMemo(
    () =>
      wbsCatalog
        .filter((w) => w.activo !== false && !wbsConHijos.has(w.id))
        .map((w) => ({ ...w, ruta: construirRutaWbs(w, wbsPorId) }))
        .sort((a, b) => compararCodigoWbsNatural(a.codigo, b.codigo)),
    [wbsCatalog, wbsConHijos, wbsPorId]
  );

  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const disponibles = wbsHojas.filter((w) => !seleccionados.some((s) => s.id === w.id));
    if (!termino) return disponibles.slice(0, 30);
    return disponibles.filter((w) => `${w.codigo ?? ""} ${w.ruta}`.toLowerCase().includes(termino));
  }, [wbsHojas, busqueda, seleccionados]);

  const n = seleccionados.length;
  const montoBase = n > 0 ? Math.round((solicitud.total / n) * 100) / 100 : 0;

  function agregar(w) {
    if (seleccionados.length >= 4) return;
    setSeleccionados((s) => [...s, w]);
    setBusqueda("");
  }

  function quitar(id) {
    setSeleccionados((s) => s.filter((w) => w.id !== id));
  }

  async function confirmar() {
    if (n < 2 || n > 4) {
      setError("Selecciona entre 2 y 4 partidas WBS destino.");
      return;
    }
    setEnviando(true);
    setError("");

    const resultado = await confirmarRepartoCorporativo(
      solicitud.id,
      seleccionados.map((w) => w.id)
    );

    setEnviando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    onRepartido(solicitud.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">Repartir gasto corporativo</h3>
          <button type="button" onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>

        <div className="rounded border border-black/[.08] bg-black/[.02] px-3 py-2.5 text-sm dark:border-white/[.145] dark:bg-white/[.04]">
          <p className="font-mono text-xs text-zinc-500">{solicitud.folio}</p>
          <p className="text-zinc-700 dark:text-zinc-300">{solicitud.proveedores?.razon_social}</p>
          <p className="text-base font-semibold text-black dark:text-zinc-50">{formatoMXN(solicitud.total)}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Partidas WBS destino ({n}/4, mínimo 2)
          </label>

          {seleccionados.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {seleccionados.map((w, i) => {
                const monto = i === n - 1 ? solicitud.total - montoBase * (n - 1) : montoBase;
                return (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-2 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs text-zinc-500">
                        {proyectosPorId.get(w.proyecto_id)?.codigo ?? w.proyecto_id}
                      </p>
                      <p className="truncate text-black dark:text-zinc-50">{w.ruta}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium tabular-nums">{formatoMXN(monto)}</span>
                      <button type="button" onClick={() => quitar(w.id)} className="text-zinc-400 hover:text-red-600">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {n < 4 && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Busca por código, categoría o partida…"
                className={`${inputClase} w-full pl-8`}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {busqueda && (
                <div className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
                  {filtrados.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">Sin resultados.</p>
                  ) : (
                    filtrados.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => agregar(w)}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                      >
                        <span className="text-xs text-zinc-500">{w.codigo ? `[${w.codigo}]` : ""}</span>
                        <span className="text-black dark:text-zinc-50">{w.ruta}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando || n < 2 || n > 4}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {enviando ? "Confirmando…" : "Confirmar reparto"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Badge/lista de gastos corporativos pagados pendientes de repartir entre partidas WBS (visible solo para TESORERIA/ADMIN). */
export default function PanelRepartoCorporativo({ pendientes: pendientesIniciales, wbsCatalog, proyectos }) {
  const [pendientes, setPendientes] = useState(pendientesIniciales);
  const [solicitudActiva, setSolicitudActiva] = useState(null);
  const proyectosPorId = useMemo(() => new Map(proyectos.map((p) => [p.id, p])), [proyectos]);

  if (pendientes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-center gap-2">
        <Split size={16} className="text-amber-700 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-300">
          {pendientes.length} gasto{pendientes.length === 1 ? "" : "s"} corporativo{pendientes.length === 1 ? "" : "s"}{" "}
          pendiente{pendientes.length === 1 ? "" : "s"} de reparto
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {pendientes.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-900 dark:bg-zinc-900"
          >
            <div className="min-w-0">
              <p className="font-mono text-xs text-zinc-500">{s.folio}</p>
              <p className="truncate text-black dark:text-zinc-50">
                {s.proveedores?.razon_social} — {formatoMXN(s.total)}
              </p>
              <p className="text-xs text-zinc-500">Pagado {formatoFecha(s.fecha_pago)}</p>
            </div>
            <button
              type="button"
              onClick={() => setSolicitudActiva(s)}
              className="shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background dark:hover:bg-[#ccc]"
            >
              Repartir
            </button>
          </div>
        ))}
      </div>

      {solicitudActiva && (
        <ModalRepartirGasto
          solicitud={solicitudActiva}
          wbsCatalog={wbsCatalog}
          proyectosPorId={proyectosPorId}
          onCerrar={() => setSolicitudActiva(null)}
          onRepartido={(id) => {
            setPendientes((filas) => filas.filter((f) => f.id !== id));
            setSolicitudActiva(null);
          }}
        />
      )}
    </div>
  );
}
