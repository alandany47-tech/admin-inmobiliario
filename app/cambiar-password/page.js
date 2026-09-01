"use client";

import { useState } from "react";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { cambiarPassword } from "@/app/actions/auth";

/** Cambio obligatorio de contraseña (cuentas creadas por un ADMIN con contraseña temporal). */
export default function CambiarPasswordPage() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function manejarSubmit(e) {
    e.preventDefault();
    setError("");
    setCargando(true);

    const resultado = await cambiarPassword(new FormData(e.target));

    if (resultado?.error) {
      setError(resultado.error);
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md mx-auto flex-col gap-6 py-16 px-4">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Cambia tu Contraseña</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tu contraseña es temporal. Define una nueva antes de continuar.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        <form onSubmit={manejarSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nueva Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="password"
                name="password"
                required
                minLength={8}
                autoFocus
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-lg border border-black/[.08] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:focus:border-zinc-600"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Confirmar Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="password"
                name="confirmar"
                required
                minLength={8}
                placeholder="Repite la contraseña"
                className="w-full rounded-lg border border-black/[.08] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:focus:border-zinc-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {cargando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Guardar y Continuar <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
