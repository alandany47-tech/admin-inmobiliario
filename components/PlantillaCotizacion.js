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
// acento es el del proyecto (proyectos.color_primario) cuando la cotización
// tiene proyecto asociado; si es cotización libre, cae al color global.
function HojaCotizacion({ cotizacion, config, hojaRef }) {
  const {
    folio,
    clienteNombre,
    proyecto,
    unidadCodigo,
    descripcionLibre,
    montoTotal,
    esquema,
    montoSeparacion,
    montoEnganche,
    porcentajeEnganche,
    plazoMeses,
    montoMensualidad,
    saldoEntrega,
  } = cotizacion;
  const colorPrimario = proyecto?.color_primario || config?.color_primario || "#0f172a";

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white p-10 text-black">
      <div className="flex items-center justify-between border-b-4 pb-4" style={{ borderColor: colorPrimario }}>
        <EncabezadoDualLogo configDipz={config} proyecto={proyecto} />
        <div className="flex flex-col items-end">
          <span className="text-lg font-bold uppercase tracking-wide">Cotización</span>
          <span className="font-mono text-sm">{folio}</span>
          <span className="text-xs text-[#52525c]">{formatoFecha(new Date())}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[rgba(0,0,0,0.2)] py-4 text-xs">
        <Campo label="Cliente" valor={clienteNombre} />
        <Campo label="Esquema" valor={esquema === "INVERSIONISTA" ? "Inversionista" : "Tradicional"} />
        <Campo
          label="Concepto"
          valor={unidadCodigo ? `Unidad ${unidadCodigo}${proyecto?.nombre ? " — " + proyecto.nombre : ""}` : descripcionLibre || "Cotización libre"}
        />
        <Campo label="Monto Total" valor={formatoMXN(montoTotal)} />
      </div>

      <table className="mt-5 w-full border-collapse text-xs">
        <thead>
          <tr style={{ backgroundColor: colorPrimario }} className="text-white">
            <th className="border border-black px-3 py-2 text-left">Concepto</th>
            <th className="border border-black px-3 py-2 text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-3 py-2">Separación</td>
            <td className="border border-black px-3 py-2 text-right">{formatoMXN(montoSeparacion)}</td>
          </tr>
          <tr>
            <td className="border border-black px-3 py-2">
              Enganche ({Number(porcentajeEnganche).toLocaleString("es-MX")}%)
            </td>
            <td className="border border-black px-3 py-2 text-right">{formatoMXN(montoEnganche)}</td>
          </tr>
          <tr>
            <td className="border border-black px-3 py-2">
              {plazoMeses} mensualidades de {formatoMXN(montoMensualidad)}
            </td>
            <td className="border border-black px-3 py-2 text-right">
              {formatoMXN(Number(montoMensualidad) * Number(plazoMeses))}
            </td>
          </tr>
          <tr>
            <td className="border border-black px-3 py-2">Saldo a Entrega</td>
            <td className="border border-black px-3 py-2 text-right">{formatoMXN(saldoEntrega)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6 flex w-72 flex-col self-end border border-black text-xs">
        <div
          className="flex items-center justify-between px-3 py-2 font-bold text-white"
          style={{ backgroundColor: colorPrimario }}
        >
          <span>Monto Total</span>
          <span>{formatoMXN(montoTotal)}</span>
        </div>
      </div>

      {config?.terminos_condiciones && (
        <p className="mt-6 text-[10px] leading-relaxed text-[#71717b]">{config.terminos_condiciones}</p>
      )}

      <p className="mt-8 text-center text-xs text-[#52525c]">
        {config?.pie_pagina || "Cotización sujeta a cambios sin previo aviso."}
      </p>
    </div>
  );
}

/**
 * Renderiza la cotización fuera de pantalla, la convierte a PDF (jsPDF +
 * html2canvas) y dispara la descarga. Consume dinámicamente
 * configuracion_plantillas (clave COTIZACION) para logo/encabezado/color/pie
 * de DIPZ, más el logo/nombre del proyecto (si aplica) vía
 * `EncabezadoDualLogo`.
 */
export async function descargarCotizacionPdf(cotizacion) {
  const [config, { default: jsPDF }, { default: html2canvas }, { createRoot }] = await Promise.all([
    getConfiguracionPlantilla("COTIZACION"),
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
  root.render(<HojaCotizacion cotizacion={cotizacion} config={config} hojaRef={hojaRef} />);

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canvas = await html2canvas(hojaRef.current, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const anchoPagina = pdf.internal.pageSize.getWidth();
  const altoImagen = (canvas.height * anchoPagina) / canvas.width;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, anchoPagina, altoImagen);

  root.unmount();
  document.body.removeChild(contenedor);

  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${cotizacion.folio || "cotizacion"}.pdf`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
