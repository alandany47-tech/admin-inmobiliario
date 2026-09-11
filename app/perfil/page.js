import { redirect } from "next/navigation";
import { getPerfilActual } from "@/app/actions/auth";
import PanelMiPerfil from "@/components/PanelMiPerfil";

/** Perfil propio del usuario autenticado: sube su firma si tiene zona asignada. */
export default async function MiPerfilPage() {
  const perfil = await getPerfilActual();

  if (!perfil) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Mi Perfil</h1>
        <PanelMiPerfil perfil={perfil} />
      </main>
    </div>
  );
}
