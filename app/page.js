import { getProyectos } from "@/app/actions/test";

/** Vista temporal para verificar la conexión con Supabase. */
export default async function Home() {
  const proyectos = await getProyectos();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Proyectos (prueba de conexión Supabase)
        </h1>

        {proyectos.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No se encontraron proyectos (o la tabla &quot;proyectos&quot; aún no existe).
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {proyectos.map((proyecto) => (
              <li
                key={proyecto.id}
                className="rounded border border-black/[.08] p-4 dark:border-white/[.145]"
              >
                <pre className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                  {JSON.stringify(proyecto, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
