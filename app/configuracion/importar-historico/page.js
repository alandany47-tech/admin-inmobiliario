import { getProyectos } from "@/app/actions/test";
import PanelImportarHistorico from "@/components/PanelImportarHistorico";

/** Importación de datos históricos (WBS, solicitudes pagadas, proveedores) desde Excel, con preview antes de insertar. */
export default async function ImportarHistoricoPage() {
  const proyectos = await getProyectos();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Importar Datos Históricos</h1>
        <PanelImportarHistorico proyectos={proyectos} />
      </main>
    </div>
  );
}
