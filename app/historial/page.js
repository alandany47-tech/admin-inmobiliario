import { getProyectos } from "@/app/actions/test";
import { getHistorialSolicitudes } from "@/app/actions/reportes";
import TablaHistorial from "@/components/TablaHistorial";

/** Historial general de solicitudes de pago con filtros y exportación a Excel. */
export default async function HistorialPage() {
  const [solicitudes, proyectos] = await Promise.all([
    getHistorialSolicitudes(),
    getProyectos(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-col gap-6 py-16 px-8">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Historial General de Solicitudes
        </h1>
        <TablaHistorial solicitudes={solicitudes} proyectos={proyectos} />
      </main>
    </div>
  );
}
