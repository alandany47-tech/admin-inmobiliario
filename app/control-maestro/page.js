import { getSolicitudesControlMaestro } from "@/app/actions/controlMaestro";
import { getProyectos } from "@/app/actions/test";
import { getProveedores } from "@/app/actions/proveedores";
import { getWbsCatalog } from "@/app/actions/wbs";
import PanelControlMaestro from "@/components/PanelControlMaestro";

/** Panel de administración diaria: filtros, alta rápida, estados y comprobantes. */
export default async function ControlMaestroPage() {
  const [solicitudes, proyectos, proveedores, wbsCatalog] = await Promise.all([
    getSolicitudesControlMaestro(),
    getProyectos(),
    getProveedores(),
    getWbsCatalog(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-col gap-6 py-16 px-8">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Panel Control Maestro
        </h1>
        <PanelControlMaestro
          solicitudes={solicitudes}
          proyectos={proyectos}
          proveedores={proveedores}
          wbsCatalog={wbsCatalog}
        />
      </main>
    </div>
  );
}
