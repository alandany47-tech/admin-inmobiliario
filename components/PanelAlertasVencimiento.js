"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getAlertasVencimiento } from "@/app/actions/cobranza";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const BUCKETS = [
  { clave: "7", titulo: "Próximos 7 días", limite: 7 },
  { clave: "15", titulo: "8 a 15 días", limite: 15 },
  { clave: "30", titulo: "16 a 30 días", limite: 30 },
];

/** Panel de alertas de vencimiento: pagos próximos a vencer en 7/15/30 días, filtrable por proyecto. */
export default function PanelAlertasVencimiento({ proyectos }) {
  const [proyectoId, setProyectoId] = useState("");
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    getAlertasVencimiento(proyectoId ? Number(proyectoId) : undefined).then((data) => {
      if (vigente) {
        setAlertas(data);
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  function cambiarProyecto(valor) {
    setProyectoId(valor);
    setCargando(true);
  }

  const buckets = useMemo(() => {
    const vencidas = alertas.filter((a) => a.diasRestantes < 0);
    const conBucket = BUCKETS.reduce(
      (acc, b) => {
        const filas = alertas.filter(
          (a) => a.diasRestantes >= 0 && a.diasRestantes <= b.limite && a.diasRestantes > acc.anterior
        );
        return { anterior: b.limite, resultado: [...acc.resultado, { ...b, filas }] };
      },
      { anterior: -1, resultado: [] }
    ).resultado;
    return vencidas.length > 0
      ? [...conBucket, { clave: "vencidas", titulo: "Ya vencidas", filas: vencidas }]
      : conBucket;
  }, [alertas]);

  const inputClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-black dark:text-zinc-50">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
          Alertas de Vencimiento
        </h2>
        <select value={proyectoId} onChange={(e) => cambiarProyecto(e.target.value)} className={inputClase}>
          <option value="">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} — {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {cargando ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
      ) : alertas.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay pagos próximos a vencer en los siguientes 30 días.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {buckets
            .filter((b) => b.filas.length > 0)
            .map((b) => (
              <div
                key={b.clave}
                className={`flex flex-col gap-2 rounded-lg border p-3 ${
                  b.clave === "vencidas"
                    ? "border-red-300 dark:border-red-900"
                    : b.clave === "7"
                      ? "border-amber-300 dark:border-amber-900"
                      : "border-black/[.08] dark:border-white/[.145]"
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {b.titulo} ({b.filas.length})
                </span>
                <div className="flex flex-col gap-1.5 text-xs">
                  {b.filas.slice(0, 6).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-700 dark:text-zinc-300">
                        {a.unidadCodigo} — {a.clienteNombre}
                        {a.tipo === "APARTADO" && (
                          <span className="ml-1 text-amber-600 dark:text-amber-400">(vence separación)</span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium text-black dark:text-zinc-50">
                        {a.tipo === "APARTADO" ? "—" : formatoMXN(a.saldo)}
                      </span>
                    </div>
                  ))}
                  {b.filas.length > 6 && (
                    <span className="text-zinc-400 dark:text-zinc-600">+{b.filas.length - 6} más…</span>
                  )}
                  {b.filas[0] && (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                      Próxima: {formatoFecha(b.filas[0].fechaProgramada)}
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
