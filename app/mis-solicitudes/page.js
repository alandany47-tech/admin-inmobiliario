import { getProyectos } from "@/app/actions/test";
import { getMisSolicitudes } from "@/app/actions/reportes";
import TablaHistorial from "@/components/TablaHistorial";
import ResumenMisSolicitudes from "@/components/ResumenMisSolicitudes";

/** Panel personal: resumen por estado + todas las solicitudes de pago del usuario autenticado, en cualquier estado. */
export default async function MisSolicitudesPage() {
  const [solicitudes, proyectos] = await Promise.all([getMisSolicitudes(), getProyectos()]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Mis Solicitudes</h1>
        <ResumenMisSolicitudes solicitudes={solicitudes} />
        <TablaHistorial solicitudes={solicitudes} proyectos={proyectos} />
      </main>
    </div>
  );
}
