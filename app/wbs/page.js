import { getProyectos } from "@/app/actions/test";
import PanelPresupuestoWbs from "@/components/PanelPresupuestoWbs";

// Nota: esta vista aún no está protegida por rol — el proyecto no tiene
// autenticación implementada todavía (RLS abierto, ver CLAUDE.md). Cuando se
// agregue auth, restringir el acceso a los roles con permiso de presupuesto.
/** Presupuesto por partida WBS: edición inline de montos e import estructural vía Excel. */
export default async function WbsPage() {
  const proyectos = await getProyectos();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Presupuesto por Partida WBS
        </h1>
        <PanelPresupuestoWbs proyectos={proyectos} />
      </main>
    </div>
  );
}
