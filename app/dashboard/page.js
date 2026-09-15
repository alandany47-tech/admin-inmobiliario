import { ArrowRightLeft, CalendarDays, Clock, Wallet } from "lucide-react";
import { getSolicitudesDashboard, getResumenFinancieroPorProyecto } from "@/app/actions/dashboard";
import DesgloseCategoriasWbs from "@/components/DesgloseCategoriasWbs";
import ResumenProyectos from "@/components/ResumenProyectos";

function formatoMXN(valor) {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function KpiCard({ icono: Icono, etiqueta, children }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-900">
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
        <Icono size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{etiqueta}</span>
      </div>
      {children}
    </div>
  );
}

function BarraProgreso({ etiqueta, monto, porcentaje }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-700 dark:text-zinc-300">{etiqueta}</span>
        <span className="font-medium text-black dark:text-zinc-50">
          {formatoMXN(monto)} <span className="text-zinc-400">({porcentaje.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
        <div
          className="h-full rounded-full bg-foreground"
          style={{ width: `${Math.min(porcentaje, 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Dashboard ejecutivo de KPIs financieros de las solicitudes de pago. */
export default async function DashboardPage() {
  const [solicitudes, resumenProyectos] = await Promise.all([
    getSolicitudesDashboard(),
    getResumenFinancieroPorProyecto(),
  ]);

  const hoy = new Date();
  const solicitudesPagadas = solicitudes.filter((s) => s.estado === "Pagado");

  const pagadasMesActual = solicitudesPagadas.filter((s) => {
    if (!s.fecha_pago) return false;
    const fecha = new Date(s.fecha_pago);
    return fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear();
  });

  const gastoTotalMes = pagadasMesActual.reduce((acc, s) => acc + Number(s.total), 0);
  const semanaDelMes = Math.max(1, Math.ceil(hoy.getDate() / 7));
  const promedioSemanal = gastoTotalMes / semanaDelMes;

  const montoPendiente = solicitudes
    .filter((s) => s.estado === "Por Autorizar")
    .reduce((acc, s) => acc + Number(s.total), 0);

  const pagadoEfectivo = solicitudesPagadas
    .filter((s) => s.metodo_pago === "Efectivo")
    .reduce((acc, s) => acc + Number(s.total), 0);
  const pagadoTransferencia = solicitudesPagadas
    .filter((s) => s.metodo_pago === "Transferencia bancaria")
    .reduce((acc, s) => acc + Number(s.total), 0);

  const totalPagadoGeneral = solicitudesPagadas.reduce((acc, s) => acc + Number(s.total), 0);

  const porProyecto = Object.values(
    solicitudesPagadas.reduce((acc, s) => {
      const clave = s.proyectos?.codigo ?? "Sin proyecto";
      if (!acc[clave]) acc[clave] = { etiqueta: `${clave} — ${s.proyectos?.nombre ?? ""}`, total: 0 };
      acc[clave].total += Number(s.total);
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const porCategoria = Object.values(
    solicitudesPagadas.reduce((acc, s) => {
      const clave = s.wbs_categoria || "Sin clasificar";
      if (!acc[clave]) acc[clave] = { etiqueta: clave, total: 0, subpartidas: {} };
      acc[clave].total += Number(s.total);
      const claveSub = s.wbs_partida || "Sin subpartida";
      acc[clave].subpartidas[claveSub] = (acc[clave].subpartidas[claveSub] ?? 0) + Number(s.total);
      return acc;
    }, {})
  )
    .map((cat) => ({
      ...cat,
      subpartidas: Object.entries(cat.subpartidas)
        .map(([etiqueta, total]) => ({
          etiqueta,
          total,
          porcentaje: cat.total > 0 ? (total / cat.total) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-8 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Dashboard Ejecutivo
        </h1>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icono={Wallet} etiqueta="Gasto Total Mes Actual">
            <span className="text-xl font-semibold text-black dark:text-zinc-50">
              {formatoMXN(gastoTotalMes)}
            </span>
          </KpiCard>

          <KpiCard icono={CalendarDays} etiqueta="Promedio Semanal">
            <span className="text-xl font-semibold text-black dark:text-zinc-50">
              {formatoMXN(promedioSemanal)}
            </span>
          </KpiCard>

          <KpiCard icono={Clock} etiqueta="Monto Pendiente de Autorizar">
            <span className="text-xl font-semibold text-black dark:text-zinc-50">
              {formatoMXN(montoPendiente)}
            </span>
          </KpiCard>

          <KpiCard icono={ArrowRightLeft} etiqueta="Pagado: Efectivo vs Transferencia">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-black dark:text-zinc-50">
                {formatoMXN(pagadoEfectivo)}
              </span>
              <span className="text-zinc-400">vs</span>
              <span className="font-semibold text-black dark:text-zinc-50">
                {formatoMXN(pagadoTransferencia)}
              </span>
            </div>
          </KpiCard>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Cobranza vs. Presupuesto por Proyecto
          </h2>
          <ResumenProyectos proyectos={resumenProyectos} />
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Desglose Porcentual por Proyecto
          </h2>
          {porProyecto.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin pagos registrados.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {porProyecto.map((item) => (
                <BarraProgreso
                  key={item.etiqueta}
                  etiqueta={item.etiqueta}
                  monto={item.total}
                  porcentaje={totalPagadoGeneral > 0 ? (item.total / totalPagadoGeneral) * 100 : 0}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Resumen de Gastos por Categoría WBS
          </h2>
          <DesgloseCategoriasWbs categorias={porCategoria} totalGeneral={totalPagadoGeneral} />
        </section>
      </main>
    </div>
  );
}
