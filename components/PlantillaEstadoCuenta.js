import { getConfiguracionPlantilla } from "@/app/actions/plantillas";

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

// Colores literales (hex/rgba), no utilidades de paleta Tailwind: html2canvas
// no soporta lab()/oklch() (ver nota en SolicitudPagoPDF.js).
function HojaEstadoCuenta({ cliente, contratos, config, hojaRef }) {
  const colorPrimario = config?.color_primario || "#0f172a";
  const ventaTotal = contratos.reduce((s, c) => s + Number(c.monto_total_venta), 0);
  const filas = contratos.flatMap((c) => c.planes_pago_cobranza ?? []);
  const cobrado = filas.reduce((s, p) => s + Number(p.monto_pagado), 0);

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white p-10 text-black">
      <div className="flex items-center justify-between border-b-4 pb-4" style={{ borderColor: colorPrimario }}>
        <div className="flex flex-col">
          {config?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.logo_url} alt="Logo" className="h-10 w-auto object-contain" crossOrigin="anonymous" />
          ) : (
            <span className="text-3xl font-black tracking-tight">{config?.encabezado_linea1 || "DIPZ"}</span>
          )}
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#52525c]">
            {config?.encabezado_linea2 || "THE FUTURE OF REAL ESTATE"}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-lg font-bold uppercase tracking-wide">Estado de Cuenta Consolidado</span>
          <span className="text-xs text-[#52525c]">{formatoFecha(new Date().toISOString().slice(0, 10))}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-[#52525c]">Cliente</span>
        <span className="text-right">{cliente.nombre}</span>
        {cliente.rfc && (
          <>
            <span className="font-semibold uppercase tracking-wide text-[#52525c]">RFC</span>
            <span className="text-right">{cliente.rfc}</span>
          </>
        )}
      </div>

      {contratos.map((c) => (
        <div key={c.id} className="mt-5 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#52525c]">
            Unidad {c.unidades?.codigo_unidad} — Contrato {formatoFecha(c.fecha_contrato)} —{" "}
            {formatoMXN(c.monto_total_venta)}
          </span>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ backgroundColor: colorPrimario }} className="text-white">
                <th className="border border-black px-2 py-1.5 text-left">Concepto</th>
                <th className="border border-black px-2 py-1.5 text-left">Fecha Programada</th>
                <th className="border border-black px-2 py-1.5 text-right">Programado</th>
                <th className="border border-black px-2 py-1.5 text-right">Pagado</th>
                <th className="border border-black px-2 py-1.5 text-left">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {(c.planes_pago_cobranza ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="border border-black px-2 py-1.5">{p.tipo_pago}</td>
                  <td className="border border-black px-2 py-1.5">{formatoFecha(p.fecha_programada)}</td>
                  <td className="border border-black px-2 py-1.5 text-right">
                    {formatoMXN(p.monto_programado)}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right">{formatoMXN(p.monto_pagado)}</td>
                  <td className="border border-black px-2 py-1.5">{p.estatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="mt-6 flex w-72 flex-col self-end border border-black text-xs">
        <div className="flex items-center justify-between border-b border-black px-3 py-1.5">
          <span>Venta Total</span>
          <span>{formatoMXN(ventaTotal)}</span>
        </div>
        <div className="flex items-center justify-between border-b border-black px-3 py-1.5">
          <span>Cobrado</span>
          <span>{formatoMXN(cobrado)}</span>
        </div>
        <div
          className="flex items-center justify-between px-3 py-1.5 font-bold text-white"
          style={{ backgroundColor: colorPrimario }}
        >
          <span>Saldo Pendiente</span>
          <span>{formatoMXN(ventaTotal - cobrado)}</span>
        </div>
      </div>

      {config?.terminos_condiciones && (
        <p className="mt-6 text-[10px] leading-relaxed text-[#71717b]">{config.terminos_condiciones}</p>
      )}

      <p className="mt-8 text-center text-xs text-[#52525c]">
        {config?.pie_pagina || "Documento informativo, no válido como comprobante fiscal."}
      </p>
    </div>
  );
}

/**
 * Renderiza el estado de cuenta consolidado de un cliente (todos sus
 * contratos y su plan de pagos) fuera de pantalla, lo convierte a PDF y
 * dispara la descarga. Consume dinámicamente configuracion_plantillas
 * (clave ESTADO_CUENTA).
 */
export async function descargarEstadoCuenta(cliente, contratos) {
  const [config, { default: jsPDF }, { default: html2canvas }, { createRoot }] = await Promise.all([
    getConfiguracionPlantilla("ESTADO_CUENTA"),
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
  root.render(<HojaEstadoCuenta cliente={cliente} contratos={contratos} config={config} hojaRef={hojaRef} />);

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
  enlace.download = `estado-cuenta-${cliente.nombre.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
