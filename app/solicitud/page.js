import { getProyectos } from "@/app/actions/test";
import { getProveedores } from "@/app/actions/proveedores";
import { getWbsCatalog } from "@/app/actions/wbs";
import SolicitudPagoForm from "@/components/SolicitudPagoForm";

/** Pantalla de captura de solicitudes de pago. */
export default async function SolicitudPage() {
  const [proyectos, proveedores, wbsCatalog] = await Promise.all([
    getProyectos(),
    getProveedores(),
    getWbsCatalog(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Nueva Solicitud de Pago
        </h1>
        <SolicitudPagoForm
          proyectos={proyectos}
          proveedores={proveedores.filter((p) => p.estatus === "Activo")}
          wbsCatalog={wbsCatalog}
        />
      </main>
    </div>
  );
}
