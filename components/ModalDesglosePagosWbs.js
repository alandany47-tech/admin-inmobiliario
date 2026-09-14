"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Receipt, X } from "lucide-react";
import { getDesglosePagosWbs } from "@/app/actions/wbs";
import { obtenerUrlComprobante } from "@/app/actions/comprobantesR2";
import ModalVisorPDF from "@/components/ModalVisorPDF";
import ModalVisorFactura from "@/components/ModalVisorFactura";
import ModalVisorComprobante from "@/components/ModalVisorComprobante";

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

/** Modal de desglose de pagos 'Pagado' ligados a una partida WBS (o a todo su subárbol). */
export default function ModalDesglosePagosWbs({ wbsId, titulo, open, onClose }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pdfSolicitudId, setPdfSolicitudId] = useState(null);
  const [facturaFila, setFacturaFila] = useState(null);
  const [comprobanteSolicitudId, setComprobanteSolicitudId] = useState(null);
  const [wbsEnCurso, setWbsEnCurso] = useState(null);

  // Ajuste de estado durante el render (no en el Effect) al abrir el modal
  // con una partida WBS distinta a la ya procesada.
  if (open && wbsId !== wbsEnCurso) {
    setWbsEnCurso(wbsId);
    setCargando(true);
  }

  useEffect(() => {
    if (!open || !wbsId) return;
    let vigente = true;
    getDesglosePagosWbs(wbsId).then((data) => {
      if (vigente) {
        setFilas(data);
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [open, wbsId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Desglose de Pagos — {titulo}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        {cargando ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
            Sin pagos registrados para esta partida.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                  <th className="px-4 py-3">Folio</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Concepto</th>
                  <th className="px-4 py-3">Fecha de Pago</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={`${f.solicitud_id}-${f.es_reparto ? "reparto" : "directo"}-${f.monto}`}
                    className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]"
                  >
                    <td className="px-4 py-3 font-mono">
                      {f.folio}
                      {f.es_reparto && (
                        <span
                          title="Porción repartida de un gasto corporativo pagado con este folio"
                          className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                        >
                          Reparto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{f.proveedor_razon_social}</td>
                    <td className="px-4 py-3 max-w-xs truncate" title={f.concepto}>
                      {f.concepto}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatoFecha(f.fecha_pago)}
                    </td>
                    <td className="px-4 py-3">{f.metodo_pago}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatoMXN(f.monto)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setPdfSolicitudId(f.solicitud_id)}
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                        >
                          <FileText size={13} /> Ver PDF
                        </button>
                        {f.xml_factura && (
                          <button
                            type="button"
                            onClick={() => setFacturaFila(f)}
                            className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                          >
                            <Receipt size={13} /> Ver Factura
                          </button>
                        )}
                        {(f.comprobante_r2_key || f.comprobante_url) &&
                          (f.comprobante_r2_key ? (
                            <button
                              type="button"
                              onClick={() => setComprobanteSolicitudId(f.solicitud_id)}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              <Download size={13} /> Comprobante
                            </button>
                          ) : (
                            <a
                              href={f.comprobante_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              <Download size={13} /> Comprobante
                            </a>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalVisorPDF
        solicitudId={pdfSolicitudId}
        open={pdfSolicitudId !== null}
        onClose={() => setPdfSolicitudId(null)}
      />

      <ModalVisorFactura
        open={facturaFila !== null}
        onClose={() => setFacturaFila(null)}
        xml={facturaFila?.xml_factura}
        folioSolicitud={facturaFila?.folio}
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
