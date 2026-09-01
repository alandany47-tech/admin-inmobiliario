import { getConfiguracionPlantilla } from "@/app/actions/plantillas";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

/** Agrupa solicitudes por proyecto y suma el total por autorizar de cada uno. */
function agruparPorProyecto(solicitudes) {
  const grupos = new Map();
  for (const s of solicitudes) {
    const clave = s.proyectos?.codigo ?? "Sin proyecto";
    if (!grupos.has(clave)) {
      grupos.set(clave, { codigo: clave, nombre: s.proyectos?.nombre ?? "", total: 0, cantidad: 0 });
    }
    const grupo = grupos.get(clave);
    grupo.total += Number(s.total ?? 0);
    grupo.cantidad += 1;
  }
  return [...grupos.values()];
}

// Colores literales (hex/rgba), no utilidades de paleta Tailwind: html2canvas
// no soporta lab()/oklch(), que es como Tailwind v4 resuelve zinc-500,
// black/20, etc. — misma nota que HojaSolicitud en SolicitudPagoPDF.js. El
// color de acento sí es dinámico (config.color_primario) porque se inyecta
// como style inline, no como utilidad de Tailwind.
function HojaResumen({ solicitudes, config, hojaRef }) {
  const porProyecto = agruparPorProyecto(solicitudes);
  const totalGeneral = solicitudes.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const colorPrimario = config?.color_primario || "#000000";

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
          <span className="text-lg font-bold uppercase tracking-wide">Resumen de Autorizaciones</span>
          <span className="text-xs text-[#52525c]">{formatoFecha(new Date())}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#52525c]">
          Resumen por Proyecto (monto acumulado por autorizar)
        </span>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr style={{ backgroundColor: colorPrimario }} className="text-white">
              <th className="border border-black px-3 py-2 text-left">Proyecto</th>
              <th className="border border-black px-3 py-2 text-right"># Solicitudes</th>
              <th className="border border-black px-3 py-2 text-right">Monto Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {porProyecto.map((g) => (
              <tr key={g.codigo}>
                <td className="border border-black px-3 py-2">
                  {g.codigo} — {g.nombre}
                </td>
                <td className="border border-black px-3 py-2 text-right">{g.cantidad}</td>
                <td className="border border-black px-3 py-2 text-right">{formatoMXN(g.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#52525c]">
          Detalle de Solicitudes
        </span>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr style={{ backgroundColor: colorPrimario }} className="text-white">
              <th className="border border-black px-2 py-1.5 text-left">Folio</th>
              <th className="border border-black px-2 py-1.5 text-left">Proyecto</th>
              <th className="border border-black px-2 py-1.5 text-left">Proveedor</th>
              <th className="border border-black px-2 py-1.5 text-right">Total</th>
              <th className="border border-black px-2 py-1.5 text-left">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => (
              <tr key={s.id}>
                <td className="border border-black px-2 py-1.5 font-mono">{s.folio}</td>
                <td className="border border-black px-2 py-1.5">{s.proyectos?.codigo ?? ""}</td>
                <td className="border border-black px-2 py-1.5">{s.proveedores?.razon_social ?? ""}</td>
                <td className="border border-black px-2 py-1.5 text-right">{formatoMXN(s.total)}</td>
                <td className="border border-black px-2 py-1.5">{formatoFecha(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex w-64 flex-col self-end border border-black text-xs">
        <div
          className="flex items-center justify-between px-3 py-1.5 font-bold text-white"
          style={{ backgroundColor: colorPrimario }}
        >
          <span>Total General</span>
          <span>{formatoMXN(totalGeneral)}</span>
        </div>
      </div>

      {config?.terminos_condiciones && (
        <p className="mt-6 text-[10px] leading-relaxed text-[#71717b]">{config.terminos_condiciones}</p>
      )}

      <div className="mt-16 grid grid-cols-3 gap-8 text-xs">
        {["Elaboró", "Autorizó", "Vo. Bo."].map((firma) => (
          <div key={firma} className="flex flex-col items-center gap-1">
            <div className="h-10 w-full border-b border-[rgba(0,0,0,0.6)]" />
            <span className="font-semibold uppercase tracking-wide text-[#52525c]">{firma}</span>
          </div>
        ))}
      </div>

      {config?.pie_pagina && <p className="mt-4 text-center text-xs text-[#52525c]">{config.pie_pagina}</p>}
    </div>
  );
}

/**
 * Renderiza fuera de pantalla el resumen corporativo de solicitudes por
 * autorizar (agrupado por proyecto + tabla detalle + firmas), lo convierte a
 * PDF (jsPDF + html2canvas) y dispara la descarga. Mismo patrón que
 * generarPdfBlob en SolicitudPagoPDF.js. Consume dinámicamente
 * configuracion_plantillas (clave SOLICITUD_PAGO) para logo/encabezado/color/
 * pie/términos.
 */
export async function generarPdfResumenAutorizaciones(solicitudes) {
  const [config, { default: jsPDF }, { default: html2canvas }, { createRoot }] = await Promise.all([
    getConfiguracionPlantilla("SOLICITUD_PAGO"),
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
  root.render(<HojaResumen solicitudes={solicitudes} config={config} hojaRef={hojaRef} />);

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canvas = await html2canvas(hojaRef.current, {
    scale: 3,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

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
  enlace.download = `resumen-autorizaciones-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
