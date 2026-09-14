import { getConfiguracionPlantilla } from "@/app/actions/plantillas";
import { getConfiguracionEmpresa } from "@/app/actions/configuracionEmpresa";
import EncabezadoDualLogo from "@/components/EncabezadoDualLogo";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

function Campo({ label, valor }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8a94]">{label}</span>
      <span className="text-[13px] font-medium text-black">{valor}</span>
    </div>
  );
}

// Colores literales (hex/rgba), no utilidades de paleta Tailwind: html2canvas
// no soporta lab()/oklch() (ver nota en SolicitudPagoPDF.js). El color de
// acento es dinámico y por proyecto: usa el color propio del proyecto
// (proyectos.color_primario) si lo tiene, si no cae al color global de
// configuracion_plantillas. Un único acento en toda la hoja (líneas finas +
// total), no bloques de color distintos.
function HojaRecibo({ pago, config, logoEmpresaUrl, hojaRef }) {
  const proyecto = pago.proyecto;
  const colorPrimario = proyecto?.color_primario || config?.color_primario || "#0f172a";

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white text-black">
      <div className="h-[6px] w-full" style={{ backgroundColor: colorPrimario }} />

      <div className="flex flex-col px-12 pb-12 pt-8">
        <div className="flex items-start justify-between pb-6">
          <EncabezadoDualLogo configDipz={config} proyecto={proyecto} logoEmpresaUrl={logoEmpresaUrl} />
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[22px] font-bold uppercase tracking-wide text-[#18181b]">Recibo de Pago</span>
            <span className="font-mono text-[11px] text-[#52525c]">{pago.folio}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl bg-[#fafafa] p-6 text-xs">
          <Campo label="Fecha de pago" valor={formatoFecha(pago.fecha)} />
          <Campo label="Cliente" valor={pago.clienteNombre} />
          <Campo label="Proyecto" valor={`${pago.proyectoCodigo ?? ""} — ${pago.proyectoNombre ?? ""}`} />
          <Campo label="Unidad" valor={pago.unidadCodigo} />
          <Campo label="Concepto" valor={pago.tipoPago} />
          <Campo label="Método de pago" valor={pago.metodoPago} />
        </div>

        <div className="mt-8 flex justify-end">
          <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#52525c]">Monto Pagado</span>
              <span className="text-[20px] font-bold tabular-nums" style={{ color: colorPrimario }}>
                {formatoMXN(pago.monto)}
              </span>
            </div>
          </div>
        </div>

        {config?.terminos_condiciones && (
          <p className="mt-10 text-[10px] leading-relaxed text-[#8a8a94]">{config.terminos_condiciones}</p>
        )}

        <div className="mt-10 flex items-center justify-center gap-3 border-t border-[rgba(0,0,0,0.06)] pt-5">
          <div className="h-1 w-1 rounded-full" style={{ backgroundColor: colorPrimario }} />
          <p className="text-center text-[10px] text-[#8a8a94]">{config?.pie_pagina || "Gracias por su pago."}</p>
          <div className="h-1 w-1 rounded-full" style={{ backgroundColor: colorPrimario }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Renderiza el recibo de un abono de cobranza fuera de pantalla, lo convierte
 * a PDF (jsPDF + html2canvas) y regresa un Blob. Consume dinámicamente
 * configuracion_plantillas (clave RECIBO_PAGO) para logo/encabezado/color/pie.
 */
export async function generarReciboPagoBlob(pago) {
  const [config, configEmpresa, { default: jsPDF }, { default: html2canvas }, { createRoot }] = await Promise.all([
    getConfiguracionPlantilla("RECIBO_PAGO"),
    getConfiguracionEmpresa(),
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
  root.render(
    <HojaRecibo pago={pago} config={config} logoEmpresaUrl={configEmpresa?.logo_empresa_url} hojaRef={hojaRef} />
  );

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
