import { getConfiguracionPlantillas } from "@/app/actions/plantillas";
import PanelConfiguracionPlantillas from "@/components/PanelConfiguracionPlantillas";

/** Configuración visual de las plantillas PDF (Recibo de Pago, Estado de Cuenta, Solicitud de Pago). */
export default async function ConfiguracionPlantillasPage() {
  const plantillas = await getConfiguracionPlantillas();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Configuración de Plantillas PDF</h1>
        <PanelConfiguracionPlantillas plantillas={plantillas} />
      </main>
    </div>
  );
}
