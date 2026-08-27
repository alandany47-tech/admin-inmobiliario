"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

const ESTADOS = ["Por Autorizar", "Autorizado", "Pospuesto", "Pagado", "Cancelado"];

const ESTILO_ESTADO = {
  "Por Autorizar": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Autorizado: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  Pospuesto: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  Pagado: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  Cancelado: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Historial general de solicitudes con filtros por proyecto/estado y exportación a Excel. */
export default function TablaHistorial({ solicitudes, proyectos }) {
  const [proyectoId, setProyectoId] = useState("");
  const [estado, setEstado] = useState("");
  const [exportando, setExportando] = useState(false);

  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((s) => {
      if (proyectoId && String(s.proyectos?.id) !== proyectoId) return false;
      if (estado && s.estado !== estado) return false;
      return true;
    });
  }, [solicitudes, proyectoId, estado]);

  async function exportarExcel() {
    setExportando(true);

    const XLSX = await import("xlsx");

    const filas = solicitudesFiltradas.map((s) => ({
      Folio: s.folio,
      Proyecto: `${s.proyectos?.codigo ?? ""} — ${s.proyectos?.nombre ?? ""}`,
      Proveedor: s.proveedores?.razon_social ?? "",
      "Método de Pago": s.metodo_pago,
      Solicitante: s.solicitante,
      Subtotal: s.subtotal,
      IVA: s.iva,
      Total: s.total,
      Estado: s.estado,
      "Fecha Programada": s.fecha_programada,
      "Fecha Pago": s.fecha_pago ?? "",
    }));

    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Solicitudes");
    XLSX.writeFile(libro, `historial-solicitudes-${hoyISO()}.xlsx`);

    setExportando(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
            className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </select>

          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={exportarExcel}
          disabled={exportando || solicitudesFiltradas.length === 0}
          className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          <Download size={15} /> {exportando ? "Exportando…" : "Exportar a Excel"}
        </button>
      </div>

      {solicitudesFiltradas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          No hay solicitudes que coincidan con los filtros.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Método de Pago</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha Programada</th>
                <th className="px-4 py-3">Fecha Pago</th>
              </tr>
            </thead>
            <tbody>
              {solicitudesFiltradas.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]"
                >
                  <td className="px-4 py-3 font-mono">{s.folio}</td>
                  <td className="px-4 py-3">
                    {s.proyectos?.codigo} — {s.proyectos?.nombre}
                  </td>
                  <td className="px-4 py-3">{s.proveedores?.razon_social}</td>
                  <td className="px-4 py-3">{s.metodo_pago}</td>
                  <td className="px-4 py-3">{s.solicitante}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatoMXN(s.total)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTILO_ESTADO[s.estado] ?? ""}`}
                    >
                      {s.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatoFecha(s.fecha_programada)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatoFecha(s.fecha_pago)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
