import { getProyectos } from "@/app/actions/test";
import PanelUnidades from "@/components/PanelUnidades";

/** Panel de unidades: grid por estatus, alta/edición de specs y flujo de venta. */
export default async function UnidadesPage() {
  const proyectos = await getProyectos();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Panel de Unidades</h1>
        <PanelUnidades proyectos={proyectos} />
      </main>
    </div>
  );
}
