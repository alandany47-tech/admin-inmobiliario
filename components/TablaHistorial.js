"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Receipt } from "lucide-react";
import { obtenerUrlComprobante } from "@/app/actions/comprobantesR2";
import ModalVisorPDF from "@/components/ModalVisorPDF";
import ModalVisorFactura from "@/components/ModalVisorFactura";
import ModalVisorComprobante from "@/components/ModalVisorComprobante";
import CeldaTruncada from "@/components/CeldaTruncada";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ESTILO_ESTADO = {
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

/** Historial general de solicitudes cerradas (Pagado/Cancelado) con filtros por mes, año y proyecto. */
export default function TablaHistorial({ solicitudes, proyectos }) {
  const hoy = new Date();
  const [proyectoId, setProyectoId] = useState("");
  const [mes, setMes] = useState("");
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [exportando, setExportando] = useState(false);
  const [pdfSolicitudId, setPdfSolicitudId] = useState(null);
  const [facturaSolicitud, setFacturaSolicitud] = useState(null);
  const [comprobanteSolicitudId, setComprobanteSolicitudId] = useState(null);

  const aniosDisponibles = useMemo(() => {
    const anios = new Set([new Date().getFullYear()]);
    solicitudes.forEach((s) => anios.add(new Date(s.created_at).getFullYear()));
    return [...anios].sort((a, b) => b - a);
  }, [solicitudes]);

  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((s) => {
      if (proyectoId && String(s.proyectos?.id) !== proyectoId) return false;
      const fecha = new Date(s.created_at);
      if (mes && fecha.getMonth() + 1 !== Number(mes)) return false;
      if (anio && fecha.getFullYear() !== Number(anio)) return false;
      return true;
    });
  }, [solicitudes, proyectoId, mes, anio]);

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
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
          >
            <option value="">Todos los meses</option>
            {MESES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>

          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
          >
            {aniosDisponibles.map((a) => (
              <option key={a} value={a}>
                {a}
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
          <table className="w-full min-w-[1200px] text-sm">
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
                <th className="px-4 py-3" />
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
                  <td className="px-4 py-3">
                    <CeldaTruncada texto={s.proveedores?.razon_social} titulo="Proveedor" />
                  </td>
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
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setPdfSolicitudId(s.id)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        <FileText size={13} /> Ver PDF
                      </button>
                      {s.xml_factura && (
                        <button
                          type="button"
                          onClick={() => setFacturaSolicitud(s)}
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                        >
                          <Receipt size={13} /> Ver Factura
                        </button>
                      )}
                      {(s.comprobante_r2_key || s.comprobante_url) && (
                        <button
                          type="button"
                          onClick={() =>
                            s.comprobante_r2_key
                              ? setComprobanteSolicitudId(s.id)
                              : window.open(s.comprobante_url, "_blank", "noreferrer")
                          }
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                        >
                          <Download size={13} /> Ver Comprobante
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalVisorPDF
        solicitudId={pdfSolicitudId}
        open={pdfSolicitudId !== null}
        onClose={() => setPdfSolicitudId(null)}
      />

      <ModalVisorFactura
        open={facturaSolicitud !== null}
        onClose={() => setFacturaSolicitud(null)}
        xml={facturaSolicitud?.xml_factura}
        folioSolicitud={facturaSolicitud?.folio}
      />

      <ModalVisorComprobante
        itemId={comprobanteSolicitudId}
        open={comprobanteSolicitudId !== null}
        onClose={() => setComprobanteSolicitudId(null)}
        onObtenerUrl={() => obtenerUrlComprobante(comprobanteSolicitudId)}
      />
    </div>
  );
}
