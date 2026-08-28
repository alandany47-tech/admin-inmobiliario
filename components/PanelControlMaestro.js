"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, FileText, Paperclip, Plus } from "lucide-react";
import { cambiarEstadoGeneral, subirComprobante } from "@/app/actions/controlMaestro";
import ModalSolicitudRapida from "@/components/ModalSolicitudRapida";
import ModalVisorPDF from "@/components/ModalVisorPDF";

const ESTADOS = ["Por Autorizar", "Autorizado", "Pospuesto", "Pagado", "Cancelado"];
const METODOS_PAGO = ["Efectivo", "Transferencia bancaria"];

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

/** Panel de control maestro: filtros, alta rápida, cambio de estado y comprobantes. */
export default function PanelControlMaestro({
  solicitudes: solicitudesIniciales,
  proyectos,
  proveedores,
  wbsCatalog,
}) {
  const [solicitudes, setSolicitudes] = useState(solicitudesIniciales);
  const [proyectoId, setProyectoId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [estado, setEstado] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pdfSolicitudId, setPdfSolicitudId] = useState(null);
  const [actualizando, setActualizando] = useState({});
  const [subiendo, setSubiendo] = useState({});
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);
  const [isPending, startTransition] = useTransition();

  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((s) => {
      if (proyectoId && String(s.proyectos?.id) !== proyectoId) return false;
      if (proveedorId && String(s.proveedores?.id) !== proveedorId) return false;
      if (metodoPago && s.metodo_pago !== metodoPago) return false;
      if (estado && s.estado !== estado) return false;
      return true;
    });
  }, [solicitudes, proyectoId, proveedorId, metodoPago, estado]);

  function cambiarEstado(id, nuevoEstado) {
    setActualizando((a) => ({ ...a, [id]: true }));
    setError("");
    startTransition(async () => {
      const resultado = await cambiarEstadoGeneral(id, nuevoEstado);
      if (resultado.error) {
        setError(resultado.error);
      } else {
        setSolicitudes((filas) =>
          filas.map((f) =>
            f.id === id
              ? {
                  ...f,
                  estado: nuevoEstado,
                  fecha_pago: nuevoEstado === "Pagado" ? hoyISO() : f.fecha_pago,
                }
              : f
          )
        );
      }
      setActualizando((a) => ({ ...a, [id]: false }));
    });
  }

  async function subirArchivo(id, archivo) {
    if (!archivo) return;
    setSubiendo((s) => ({ ...s, [id]: true }));
    setError("");

    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirComprobante(id, formData);

    if (resultado.error) {
      setError(resultado.error);
    } else {
      setSolicitudes((filas) =>
        filas.map((f) => (f.id === id ? { ...f, comprobante_url: resultado.url } : f))
      );
    }
    setSubiendo((s) => ({ ...s, [id]: false }));
  }

  function solicitudCreada() {
    setModalAbierto(false);
    setError("");
    window.location.reload();
  }

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
    XLSX.writeFile(libro, `control-maestro-${hoyISO()}.xlsx`);
    setExportando(false);
  }

  async function exportarPDF() {
    setExportando(true);
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const columnas = [
      { titulo: "Folio", ancho: 30 },
      { titulo: "Proyecto", ancho: 30 },
      { titulo: "Proveedor", ancho: 65 },
      { titulo: "Método", ancho: 45 },
      { titulo: "Total", ancho: 35 },
      { titulo: "Estado", ancho: 30 },
    ];
    let y = 15;

    doc.setFontSize(14);
    doc.text("Control Maestro de Solicitudes", 15, y);
    y += 9;
    doc.setFontSize(9);

    function encabezado() {
      let x = 15;
      doc.setFont(undefined, "bold");
      columnas.forEach((c) => {
        doc.text(c.titulo, x, y);
        x += c.ancho;
      });
      doc.setFont(undefined, "normal");
      y += 5;
      doc.line(15, y - 3, 275, y - 3);
    }

    encabezado();

    solicitudesFiltradas.forEach((s) => {
      if (y > 190) {
        doc.addPage();
        y = 15;
        encabezado();
      }
      let x = 15;
      const fila = [
        s.folio,
        s.proyectos?.codigo ?? "",
        s.proveedores?.razon_social ?? "",
        s.metodo_pago,
        formatoMXN(s.total),
        s.estado,
      ];
      fila.forEach((valor, i) => {
        doc.text(String(valor ?? ""), x, y);
        x += columnas[i].ancho;
      });
      y += 6;
    });

    doc.save(`control-maestro-${hoyISO()}.pdf`);
    setExportando(false);
  }

  const selectClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
            className={selectClase}
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </select>

          <select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className={selectClase}
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razon_social}
              </option>
            ))}
          </select>

          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            className={selectClase}
          >
            <option value="">Todos los métodos de pago</option>
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectClase}>
            <option value="">Todos los estatus</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            <Plus size={15} /> Solicitud Rápida
          </button>
          <button
            type="button"
            onClick={exportarExcel}
            disabled={exportando || solicitudesFiltradas.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            <Download size={15} /> Excel
          </button>
          <button
            type="button"
            onClick={exportarPDF}
            disabled={exportando || solicitudesFiltradas.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            <Download size={15} /> PDF
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

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
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Método de Pago</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {solicitudesFiltradas.map((s) => {
                const deshabilitado = isPending && actualizando[s.id];
                return (
                  <tr
                    key={s.id}
                    className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]"
                  >
                    <td className="px-4 py-3 font-mono">{s.folio}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatoFecha(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {s.proyectos?.codigo} — {s.proyectos?.nombre}
                    </td>
                    <td className="px-4 py-3">{s.proveedores?.razon_social}</td>
                    <td className="px-4 py-3">{s.metodo_pago}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatoMXN(s.total)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={s.estado}
                        disabled={deshabilitado}
                        onChange={(e) => cambiarEstado(s.id, e.target.value)}
                        className={`rounded-full border-none px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${ESTILO_ESTADO[s.estado] ?? ""}`}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
                          <Paperclip size={12} />
                          {subiendo[s.id] ? "Subiendo…" : s.comprobante_url ? "Reemplazar" : "Adjuntar"}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => subirArchivo(s.id, e.target.files?.[0])}
                          />
                        </label>
                        {s.comprobante_url && (
                          <a
                            href={s.comprobante_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                          >
                            Ver
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setPdfSolicitudId(s.id)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        <FileText size={13} /> Ver PDF
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <ModalSolicitudRapida
          proyectos={proyectos}
          proveedores={proveedores.filter((p) => p.estatus === "Activo")}
          wbsCatalog={wbsCatalog}
          onCreada={solicitudCreada}
          onCerrar={() => setModalAbierto(false)}
        />
      )}

      <ModalVisorPDF
        solicitudId={pdfSolicitudId}
        open={pdfSolicitudId !== null}
        onClose={() => setPdfSolicitudId(null)}
      />
    </div>
  );
}
