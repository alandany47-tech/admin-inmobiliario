import { getProveedores } from "@/app/actions/proveedores";
import DirectorioProveedores from "@/components/DirectorioProveedores";

/** Directorio de proveedores registrados. */
export default async function ProveedoresPage() {
  const proveedores = await getProveedores();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Directorio de Proveedores
        </h1>
        <DirectorioProveedores proveedores={proveedores} />
      </main>
    </div>
  );
}
