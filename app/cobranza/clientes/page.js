import { getCarteraClientes } from "@/app/actions/cobranza";
import CarteraClientes from "@/components/CarteraClientes";

/** Directorio de clientes y cartera de cobranza. */
export default async function CarteraClientesPage() {
  const clientes = await getCarteraClientes();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-7xl mx-auto flex-col gap-6 py-16 px-4">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Directorio de Clientes y Cartera</h1>
        <CarteraClientes clientes={clientes} />
      </main>
    </div>
  );
}
