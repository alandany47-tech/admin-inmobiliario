import { redirect } from "next/navigation";
import { getPerfilActual, getPerfiles } from "@/app/actions/auth";
import PanelPermisos from "@/components/PanelPermisos";

/** Administración de roles y estatus de usuarios del sistema (solo ADMIN). */
export default async function PermisosPage() {
  const perfilActual = await getPerfilActual();

  if (!perfilActual || perfilActual.rol !== "ADMIN") {
    redirect("/dashboard");
  }

  const perfiles = await getPerfiles();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Roles y Accesos</h1>
        <PanelPermisos perfiles={perfiles} perfilActualId={perfilActual.id} />
      </main>
    </div>
  );
}
