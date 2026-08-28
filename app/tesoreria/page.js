import {
  getCuentasBancarias,
  getMovimientosTesoreria,
  getSolicitudesAutorizadas,
} from "@/app/actions/tesoreria";
import { getProyectos } from "@/app/actions/test";
import TableroTesoreria from "@/components/TableroTesoreria";

/** Tesorería: saldos por cuenta, bitácora de movimientos y dispersión de pagos. */
export default async function TesoreriaPage() {
  const [cuentas, movimientos, solicitudes, proyectos] = await Promise.all([
    getCuentasBancarias(),
    getMovimientosTesoreria(),
    getSolicitudesAutorizadas(),
    getProyectos(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Tesorería</h1>
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
