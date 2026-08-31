import { getProyectosStats } from "@/app/actions/proyectos";
import GestionProyectos from "@/components/GestionProyectos";

/** Módulo administrativo de proyectos: alta, edición y baja de proyectos con estadísticas agregadas. */
export default async function ProyectosPage() {
  const proyectos = await getProyectosStats();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Proyectos</h1>
        <GestionProyectos proyectosIniciales={proyectos} />
      </main>
    </div>
  );
}
