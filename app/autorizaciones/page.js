import { getSolicitudesPorAutorizar } from "@/app/actions/autorizaciones";
import TablaAutorizaciones from "@/components/TablaAutorizaciones";

/** Dashboard de autorización de solicitudes de pago. */
export default async function AutorizacionesPage() {
  const solicitudes = await getSolicitudesPorAutorizar();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Autorización de Solicitudes de Pago
        </h1>
        <TablaAutorizaciones solicitudes={solicitudes} />
      </main>
    </div>
  );
}
