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
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8a94]">{label}</span>
      <span className="text-[13px] font-medium text-black">{valor}</span>
    </div>
  );
}

function Fila({ concepto, detalle, monto, ultima }) {
  return (
    <div
      className="flex items-center justify-between px-1 py-3"
      style={ultima ? undefined : { borderBottom: "1px solid rgba(0,0,0,0.08)" }}
    >
      <div className="flex flex-col">
        <span className="text-[12px] font-medium text-[#27272a]">{concepto}</span>
        {detalle && <span className="text-[10px] text-[#8a8a94]">{detalle}</span>}
      </div>
      <span className="text-[13px] font-semibold tabular-nums text-black">{monto}</span>
    </div>
  );
}

// Colores literales (hex/rgba), no utilidades de paleta Tailwind: html2canvas
// no soporta lab()/oklch() (ver nota en SolicitudPagoPDF.js). El color de
// acento es el del proyecto (proyectos.color_primario) cuando la cotización
// tiene proyecto asociado; si es cotización libre, cae al color global. Se
// usa un único acento en toda la hoja (líneas finas y el total), no bloques
// de color distintos por fila, para un aspecto más limpio/"real estate".
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
    imagenUrl,
  } = cotizacion;
  const colorPrimario = proyecto?.color_primario || config?.color_primario || "#0f172a";

  const separacion = Number(montoSeparacion) || 0;
  const enganche = Number(montoEnganche) || 0;
  const restoEnganche = Math.max(enganche - separacion, 0);
  const plazo = Number(plazoMeses) || 0;
  const mensualidad = Number(montoMensualidad) || 0;
  const entrega = Number(saldoEntrega) || 0;

  const filas = [
    separacion > 0 && {
      concepto: "Separación",
      detalle: "Anticipo, se descuenta del enganche",
      monto: formatoMXN(separacion),
    },
    enganche > 0 && {
      concepto: separacion > 0 ? "Resto de enganche" : "Enganche",
      detalle: `${Number(porcentajeEnganche).toLocaleString("es-MX")}% del total`,
      monto: formatoMXN(restoEnganche),
    },
    plazo > 0 && {
      concepto: "Mensualidades",
      // El importe de la fila es el remanente exacto (Total − Enganche − Entrega), no
      // mensualidad×plazo: ese producto puede quedar unos centavos desfasado por el
      // redondeo de la mensualidad individual, y esta fila debe cuadrar con el Total.
      detalle: `${plazo} pagos de ${formatoMXN(mensualidad)}`,
      monto: formatoMXN(Math.max(Number(montoTotal) - enganche - entrega, 0)),
    },
    entrega > 0 && {
      concepto: "Saldo a entrega",
      detalle: null,
      monto: formatoMXN(entrega),
    },
  ].filter(Boolean);

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white text-black">
      <div className="h-[6px] w-full" style={{ backgroundColor: colorPrimario }} />

      <div className="flex flex-col px-12 pb-12 pt-8">
        <div className="flex items-start justify-between pb-6">
          <EncabezadoDualLogo configDipz={config} proyecto={proyecto} />
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[22px] font-bold uppercase tracking-wide text-[#18181b]">Cotización</span>
            <span className="font-mono text-[11px] text-[#52525c]">{folio}</span>
            <span className="text-[10px] text-[#8a8a94]">{formatoFecha(new Date())}</span>
          </div>
        </div>

        {imagenUrl && (
          <div className="mb-6 h-64 w-full overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagenUrl} alt="" className="h-full w-full object-cover" crossOrigin="anonymous" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl bg-[#fafafa] p-6 text-xs">
          <Campo label="Cliente" valor={clienteNombre} />
          <Campo label="Esquema" valor={esquema === "INVERSIONISTA" ? "Inversionista" : "Tradicional"} />
          <Campo
            label="Concepto"
            valor={unidadCodigo ? `Unidad ${unidadCodigo}${proyecto?.nombre ? " — " + proyecto.nombre : ""}` : descripcionLibre || "Cotización libre"}
          />
          <Campo label="Monto total" valor={formatoMXN(montoTotal)} />
        </div>

        {filas.length > 0 && (
          <div className="mt-8 flex flex-col">
            <div
              className="flex items-center justify-between px-1 pb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8a94]"
              style={{ borderBottom: `2px solid ${colorPrimario}` }}
            >
              <span>Concepto</span>
              <span>Monto</span>
            </div>
            {filas.map((f, i) => (
              <Fila key={f.concepto} {...f} ultima={i === filas.length - 1} />
            ))}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#52525c]">Monto Total</span>
              <span className="text-[20px] font-bold tabular-nums" style={{ color: colorPrimario }}>
                {formatoMXN(montoTotal)}
              </span>
            </div>
          </div>
        </div>

        {config?.terminos_condiciones && (
          <p className="mt-10 text-[10px] leading-relaxed text-[#8a8a94]">{config.terminos_condiciones}</p>
        )}

        <div className="mt-10 flex items-center justify-center gap-3 border-t border-[rgba(0,0,0,0.06)] pt-5">
          <div className="h-1 w-1 rounded-full" style={{ backgroundColor: colorPrimario }} />
          <p className="text-center text-[10px] text-[#8a8a94]">
            {config?.pie_pagina || "Cotización sujeta a cambios sin previo aviso."}
          </p>
          <div className="h-1 w-1 rounded-full" style={{ backgroundColor: colorPrimario }} />
        </div>
      </div>
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
