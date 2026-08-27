import { getCuentasBancarias, getSolicitudesAutorizadas } from "@/app/actions/tesoreria";
import TableroTesoreria from "@/components/TableroTesoreria";

/** Tesorería: saldos por cuenta y dispersión de pagos de solicitudes autorizadas. */
export default async function TesoreriaPage() {
  const [cuentas, solicitudes] = await Promise.all([
    getCuentasBancarias(),
    getSolicitudesAutorizadas(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-col gap-6 py-16 px-8">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Tesorería</h1>
        <TableroTesoreria cuentas={cuentas} solicitudes={solicitudes} />
      </main>
    </div>
  );
}
