import { getConfiguracionPlantilla } from "@/app/actions/plantillas";
import EncabezadoDualLogo from "@/components/EncabezadoDualLogo";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

function Campo({ label, valor }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold uppercase tracking-wide text-[#71717b]">{label}</span>
      <span className="text-black">{valor}</span>
    </div>
  );
}

// Colores literales (hex/rgba), no utilidades de paleta Tailwind: html2canvas
// no soporta lab()/oklch() (ver nota en SolicitudPagoPDF.js). El color de
// acento es dinámico y por proyecto: usa el color propio del proyecto
// (proyectos.color_primario) si lo tiene, si no cae al color global de
// configuracion_plantillas.
function HojaRecibo({ pago, config, hojaRef }) {
  const proyecto = pago.proyecto;
  const colorPrimario = proyecto?.color_primario || config?.color_primario || "#0f172a";

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white p-10 text-black">
      <div className="flex items-center justify-between border-b-4 pb-4" style={{ borderColor: colorPrimario }}>
        <EncabezadoDualLogo configDipz={config} proyecto={proyecto} />
        <div className="flex flex-col items-end">
          <span className="text-lg font-bold uppercase tracking-wide">Recibo de Pago</span>
          <span className="font-mono text-sm">{pago.folio}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[rgba(0,0,0,0.2)] py-4 text-xs">
        <Campo label="Fecha de Pago" valor={formatoFecha(pago.fecha)} />
        <Campo label="Cliente" valor={pago.clienteNombre} />
        <Campo label="Proyecto" valor={`${pago.proyectoCodigo ?? ""} — ${pago.proyectoNombre ?? ""}`} />
        <Campo label="Unidad" valor={pago.unidadCodigo} />
        <Campo label="Concepto" valor={pago.tipoPago} />
        <Campo label="Método de Pago" valor={pago.metodoPago} />
      </div>

      <div className="mt-6 flex w-72 flex-col self-end border border-black text-xs">
        <div
          className="flex items-center justify-between px-3 py-2 font-bold text-white"
          style={{ backgroundColor: colorPrimario }}
        >
          <span>Monto Pagado</span>
          <span>{formatoMXN(pago.monto)}</span>
        </div>
      </div>

      {config?.terminos_condiciones && (
        <p className="mt-6 text-[10px] leading-relaxed text-[#71717b]">{config.terminos_condiciones}</p>
      )}

      <p className="mt-8 text-center text-xs text-[#52525c]">{config?.pie_pagina || "Gracias por su pago."}</p>
    </div>
  );
}

/**
 * Renderiza el recibo de un abono de cobranza fuera de pantalla, lo convierte
 * a PDF (jsPDF + html2canvas) y regresa un Blob. Consume dinámicamente
 * configuracion_plantillas (clave RECIBO_PAGO) para logo/encabezado/color/pie.
 */
export async function generarReciboPagoBlob(pago) {
  const [config, { default: jsPDF }, { default: html2canvas }, { createRoot }] = await Promise.all([
    getConfiguracionPlantilla("RECIBO_PAGO"),
    import("jspdf"),
    import("html2canvas"),
    import("react-dom/client"),
  ]);

  const contenedor = document.createElement("div");
  contenedor.style.position = "fixed";
  contenedor.style.left = "-10000px";
  contenedor.style.top = "0";
  document.body.appendChild(contenedor);

  const hojaRef = { current: null };
  const root = createRoot(contenedor);
  root.render(<HojaRecibo pago={pago} config={config} hojaRef={hojaRef} />);

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canvas = await html2canvas(hojaRef.current, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const anchoPagina = pdf.internal.pageSize.getWidth();
  const altoImagen = (canvas.height * anchoPagina) / canvas.width;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, anchoPagina, altoImagen);

  root.unmount();
  document.body.removeChild(contenedor);

  return pdf.output("blob");
}

/** Descarga directa del recibo, para el botón "Descargar / Imprimir Recibo de Pago" tras un cobro exitoso. */
export async function descargarReciboPago(pago) {
  const blob = await generarReciboPagoBlob(pago);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${pago.folio}.pdf`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
