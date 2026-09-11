import {
  getCuentasBancarias,
  getMovimientosTesoreria,
  getSolicitudesAutorizadas,
} from "@/app/actions/tesoreria";
import { getProyectos } from "@/app/actions/test";
import { getPerfilActual } from "@/app/actions/auth";
import { getSolicitudesPendientesReparto } from "@/app/actions/reparto";
import { getWbsCatalog } from "@/app/actions/wbs";
import TableroTesoreria from "@/components/TableroTesoreria";
import PanelRepartoCorporativo from "@/components/PanelRepartoCorporativo";

/** Tesorería: saldos por cuenta, bitácora de movimientos y dispersión de pagos. */
export default async function TesoreriaPage() {
  const [cuentas, movimientos, solicitudes, proyectos, perfil] = await Promise.all([
    getCuentasBancarias(),
    getMovimientosTesoreria(),
    getSolicitudesAutorizadas(),
    getProyectos(),
    getPerfilActual(),
  ]);

  const puedeRepartir = perfil && ["TESORERIA", "ADMIN"].includes(perfil.rol);
  const [pendientesReparto, wbsCatalog] = puedeRepartir
    ? await Promise.all([getSolicitudesPendientesReparto(), getWbsCatalog()])
    : [[], []];

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Tesorería</h1>

        {puedeRepartir && (
          <PanelRepartoCorporativo pendientes={pendientesReparto} wbsCatalog={wbsCatalog} proyectos={proyectos} />
        )}

        <TableroTesoreria
          cuentas={cuentas}
          movimientos={movimientos}
          solicitudes={solicitudes}
          proyectos={proyectos}
        />
      </main>
    </div>
  );
}
