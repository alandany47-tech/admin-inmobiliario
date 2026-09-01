import { getProyectosBranding } from "@/app/actions/proyectos";
import { getCotizaciones } from "@/app/actions/cotizaciones";
import Cotizador from "@/components/Cotizador";

/** Cotizador: sobre unidades del inventario o cotización libre, con simulador de pagos e historial. */
export default async function CotizacionesPage() {
  const [proyectos, historial] = await Promise.all([getProyectosBranding(), getCotizaciones()]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Cotizador</h1>
        <Cotizador proyectos={proyectos} historial={historial} />
      </main>
    </div>
  );
}
