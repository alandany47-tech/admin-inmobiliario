const ESTADOS = ["Por Autorizar", "Autorizado", "Pospuesto", "Pagado", "Cancelado"];

const ESTILO_ESTADO = {
  "Por Autorizar": "border-zinc-300 dark:border-zinc-700",
  Autorizado: "border-blue-300 dark:border-blue-800",
  Pospuesto: "border-amber-300 dark:border-amber-800",
  Pagado: "border-green-300 dark:border-green-800",
  Cancelado: "border-red-300 dark:border-red-800",
};

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function TarjetaResumen({ etiqueta, cantidad, monto, borde }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border bg-white p-4 dark:bg-zinc-900 ${
        borde ?? "border-black/[.08] dark:border-white/[.145]"
      }`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {etiqueta}
      </span>
      <span className="text-xl font-semibold text-black dark:text-zinc-50">{cantidad}</span>
      {monto !== undefined && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatoMXN(monto)}</span>
      )}
    </div>
  );
}

/** Resumen personal: conteo/monto por estado y disponibilidad de comprobantes de pagos por transferencia. */
export default function ResumenMisSolicitudes({ solicitudes }) {
  const porEstado = ESTADOS.map((estado) => {
    const filas = solicitudes.filter((s) => s.estado === estado);
    return { estado, cantidad: filas.length, monto: filas.reduce((acc, f) => acc + Number(f.total), 0) };
  });

  const pagadasTransferencia = solicitudes.filter(
    (s) => s.estado === "Pagado" && s.metodo_pago === "Transferencia bancaria"
  );
  const conComprobante = pagadasTransferencia.filter((s) => s.comprobante_r2_key || s.comprobante_url);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TarjetaResumen etiqueta="Total" cantidad={solicitudes.length} />
        {porEstado.map((p) => (
          <TarjetaResumen
            key={p.estado}
            etiqueta={p.estado}
            cantidad={p.cantidad}
            monto={p.monto}
            borde={ESTILO_ESTADO[p.estado]}
          />
        ))}
      </div>

      {pagadasTransferencia.length > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {conComprobante.length} de {pagadasTransferencia.length} pagos por transferencia tienen comprobante
          disponible para descargar (ícono junto a cada folio en la tabla).
        </p>
      )}
    </div>
  );
}
