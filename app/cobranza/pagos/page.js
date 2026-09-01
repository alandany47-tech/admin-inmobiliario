import { getContratosVenta } from "@/app/actions/cobranza";
import { getCuentasBancarias } from "@/app/actions/tesoreria";
import { getProyectos } from "@/app/actions/test";
import CapturaPagos from "@/components/CapturaPagos";

/** Captura de pagos de cobranza: alertas de vencimiento, selección de contrato, plan de pagos y dispersión a Tesorería. */
export default async function CapturaPagosPage() {
  const [contratos, cuentas, proyectos] = await Promise.all([
    getContratosVenta(),
    getCuentasBancarias(),
    getProyectos(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Captura de Pagos</h1>
        <CapturaPagos contratos={contratos} cuentas={cuentas} proyectos={proyectos} />
      </main>
    </div>
  );
}
