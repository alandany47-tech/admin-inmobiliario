import { getConfiguracionPlantillas } from "@/app/actions/plantillas";
import { getProyectosBranding } from "@/app/actions/proyectos";
import { getConfiguracionEmpresa } from "@/app/actions/configuracionEmpresa";
import PanelConfiguracionPlantillas from "@/components/PanelConfiguracionPlantillas";

/** Configuración visual de las plantillas PDF (Recibo de Pago, Estado de Cuenta, Solicitud de Pago, Cotización), por categoría y por proyecto. */
export default async function ConfiguracionPlantillasPage() {
  const [plantillas, proyectos, configuracionEmpresa] = await Promise.all([
    getConfiguracionPlantillas(),
    getProyectosBranding(),
    getConfiguracionEmpresa(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Configuración de Plantillas PDF</h1>
        <PanelConfiguracionPlantillas
          plantillas={plantillas}
          proyectos={proyectos}
          configuracionEmpresa={configuracionEmpresa}
        />
      </main>
    </div>
  );
}
