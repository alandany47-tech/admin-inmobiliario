import { getOrdenesCambioPendientes } from "@/app/actions/wbs";
import { getPerfilActual, esAutorizadorGlobal } from "@/app/actions/auth";
import TablaOrdenesCambioWbs from "@/components/TablaOrdenesCambioWbs";

/**
 * Autorización de Órdenes de Cambio de presupuesto WBS: quien las propone no
 * puede autorizarlas, salvo ADMIN (que sí puede autorizar las suyas — regla
 * espejo de la RPC `autorizar_orden_cambio_wbs`, que usa `es_admin()`). Solo
 * quien tiene el permiso de Autorizador Global (0046) puede resolverlas.
 */
export default async function OrdenesCambioWbsPage() {
  const [ordenes, perfil, puedeAutorizar] = await Promise.all([
    getOrdenesCambioPendientes(),
    getPerfilActual(),
    esAutorizadorGlobal(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Órdenes de Cambio de Presupuesto WBS
        </h1>
        <TablaOrdenesCambioWbs
          ordenes={ordenes}
          usuarioActualId={perfil?.id ?? null}
          esAdmin={perfil?.rol === "ADMIN"}
          puedeAutorizar={puedeAutorizar}
        />
      </main>
    </div>
  );
}
