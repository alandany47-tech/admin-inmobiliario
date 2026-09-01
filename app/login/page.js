"use client";

import { useState } from "react";
import Image from "next/image";
import { Lock, Mail, ArrowRight, Loader2 } from "lucide-react";
import { iniciarSesion } from "@/app/actions/auth";

/** Pantalla de acceso al sistema. */
export default function LoginPage() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function manejarSubmit(e) {
    e.preventDefault();
    setError("");
    setCargando(true);

    const resultado = await iniciarSesion(new FormData(e.target));

    if (resultado?.error) {
      setError(resultado.error);
      setCargando(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-zinc-900 p-12 lg:flex">
        <Image src="/logo.png" alt="DPZ" width={2600} height={1248} priority className="h-9 w-auto self-start" />

        <div className="flex flex-col gap-3">
          <h1 className="max-w-md text-3xl font-light leading-tight text-zinc-50">
            Control Financiero, Tesorería y Cartera <span className="font-semibold">Inmobiliaria</span>
          </h1>
          <p className="text-sm font-light text-zinc-400">
            Solicitudes de pago, dispersión de fondos, presupuesto WBS y cobranza en un solo lugar.
          </p>
        </div>

        <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-500">
          THE FUTURE OF REAL ESTATE
        </span>
      </div>

      <div className="flex items-center justify-center bg-zinc-50 p-8 dark:bg-black">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-1 lg:hidden">
            <Image src="/logo.png" alt="DPZ" width={2600} height={1248} priority className="mb-4 h-8 w-auto self-start" />
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">Acceso al Sistema</h2>
            <p className="mt-1 text-sm text-zinc-500">Ingresa tus credenciales para continuar.</p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}

          <form onSubmit={manejarSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Correo Electrónico</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="email"
                  name="email"
                  required
                  autoFocus
                  placeholder="usuario@dipz.mx"
                  className="w-full rounded-lg border border-black/[.08] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:focus:border-zinc-600"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="••••••••••••"
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
                  Iniciar Sesión <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
