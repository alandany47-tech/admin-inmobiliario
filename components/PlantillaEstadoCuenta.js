import { getConfiguracionPlantilla } from "@/app/actions/plantillas";
import EncabezadoDualLogo from "@/components/EncabezadoDualLogo";

/** Proyecto único si todos los contratos del cliente pertenecen al mismo proyecto; si hay más de uno, no se puede mostrar un solo logo de proyecto. */
function proyectoUnico(contratos) {
  const proyectos = contratos.map((c) => c.proyectos).filter(Boolean);
  if (proyectos.length === 0) return null;
  const idUnico = proyectos[0].id;
  return proyectos.every((p) => p.id === idUnico) ? proyectos[0] : null;
}

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

function Campo({ label, valor }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8a94]">{label}</span>
      <span className="text-[13px] font-medium text-black">{valor}</span>
    </div>
  );
}

const ESTILO_ESTATUS = {
  PAGADO: { bg: "rgba(22,163,74,0.1)", fg: "#15803d" },
  PENDIENTE: { bg: "rgba(217,119,6,0.12)", fg: "#b45309" },
  VENCIDO: { bg: "rgba(220,38,38,0.1)", fg: "#b91c1c" },
};

function Etiqueta({ estatus }) {
  const estilo = ESTILO_ESTATUS[estatus] || { bg: "rgba(0,0,0,0.06)", fg: "#52525c" };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: estilo.bg, color: estilo.fg }}
    >
      {estatus}
    </span>
  );
}

// Colores literales (hex/rgba), no utilidades de paleta Tailwind: html2canvas
// no soporta lab()/oklch() (ver nota en SolicitudPagoPDF.js). El color de
// acento es por proyecto (proyectos.color_primario) cuando todos los
// contratos son del mismo proyecto; si abarca varios, cae al color global.
// Un único acento en toda la hoja (líneas finas + total), no bloques de
// color distintos por fila.
function HojaEstadoCuenta({ cliente, contratos, config, hojaRef }) {
  const proyecto = proyectoUnico(contratos);
  const colorPrimario = proyecto?.color_primario || config?.color_primario || "#0f172a";
  const ventaTotal = contratos.reduce((s, c) => s + Number(c.monto_total_venta), 0);
  const filas = contratos.flatMap((c) => c.planes_pago_cobranza ?? []);
  const cobrado = filas.reduce((s, p) => s + Number(p.monto_pagado), 0);

  return (
    <div ref={hojaRef} className="flex w-[816px] flex-col bg-white text-black">
      <div className="h-[6px] w-full" style={{ backgroundColor: colorPrimario }} />

      <div className="flex flex-col px-12 pb-12 pt-8">
        <div className="flex items-start justify-between pb-6">
          <EncabezadoDualLogo configDipz={config} proyecto={proyecto} />
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[20px] font-bold uppercase tracking-wide text-[#18181b]">Estado de Cuenta</span>
            <span className="text-[10px] text-[#8a8a94]">{formatoFecha(new Date().toISOString().slice(0, 10))}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl bg-[#fafafa] p-6 text-xs">
          <Campo label="Cliente" valor={cliente.nombre} />
          {cliente.rfc && <Campo label="RFC" valor={cliente.rfc} />}
        </div>

        {contratos.map((c) => (
          <div key={c.id} className="mt-8 flex flex-col">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[12px] font-semibold text-[#18181b]">Unidad {c.unidades?.codigo_unidad}</span>
              <span className="text-[10px] text-[#8a8a94]">
                Contrato {formatoFecha(c.fecha_contrato)} · {formatoMXN(c.monto_total_venta)}
              </span>
            </div>

            <div
              className="grid grid-cols-[2fr_1.2fr_1fr_1fr_0.8fr] gap-2 px-1 pb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8a8a94]"
              style={{ borderBottom: `2px solid ${colorPrimario}` }}
            >
              <span>Concepto</span>
              <span>Fecha programada</span>
              <span className="text-right">Programado</span>
              <span className="text-right">Pagado</span>
              <span className="text-right">Estatus</span>
            </div>
            {(c.planes_pago_cobranza ?? []).map((p, i, arr) => (
              <div
                key={p.id}
                className="grid grid-cols-[2fr_1.2fr_1fr_1fr_0.8fr] items-center gap-2 px-1 py-2.5 text-[11px]"
                style={i === arr.length - 1 ? undefined : { borderBottom: "1px solid rgba(0,0,0,0.06)" }}
              >
                <span className="font-medium text-[#27272a]">{p.tipo_pago}</span>
                <span className="text-[#52525c]">{formatoFecha(p.fecha_programada)}</span>
                <span className="text-right tabular-nums text-[#52525c]">{formatoMXN(p.monto_programado)}</span>
                <span className="text-right tabular-nums font-semibold">{formatoMXN(p.monto_pagado)}</span>
                <span className="flex justify-end">
                  <Etiqueta estatus={p.estatus} />
                </span>
              </div>
            ))}
          </div>
        ))}

        <div className="mt-8 flex justify-end">
          <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between px-5 py-2.5 text-[12px]">
              <span className="text-[#52525c]">Venta total</span>
              <span className="font-medium tabular-nums">{formatoMXN(ventaTotal)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-2.5 text-[12px]">
              <span className="text-[#52525c]">Cobrado</span>
              <span className="font-medium tabular-nums">{formatoMXN(cobrado)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#52525c]">Saldo pendiente</span>
              <span className="text-[18px] font-bold tabular-nums" style={{ color: colorPrimario }}>
                {formatoMXN(ventaTotal - cobrado)}
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
            {config?.pie_pagina || "Documento informativo, no válido como comprobante fiscal."}
          </p>
          <div className="h-1 w-1 rounded-full" style={{ backgroundColor: colorPrimario }} />
        </div>
      </div>
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
