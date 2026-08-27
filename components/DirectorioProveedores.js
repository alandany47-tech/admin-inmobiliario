"use client";

import { useMemo, useState } from "react";
import { Landmark, Mail, Phone, Search } from "lucide-react";

const ESTILO_ESTATUS = {
  Activo: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  Inactivo: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function datosBancariosTexto(datos) {
  if (!datos?.banco) return null;
  if (datos.banco === "Banregio") {
    return `Banregio · Cuenta ${datos.numero_cuenta ?? "—"}`;
  }
  return `${datos.banco} · CLABE ${datos.clabe ?? "—"}`;
}

/** Directorio de proveedores con búsqueda rápida por razón social o RFC. */
export default function DirectorioProveedores({ proveedores }) {
  const [busqueda, setBusqueda] = useState("");

  const proveedoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return proveedores;
    return proveedores.filter(
      (p) =>
        p.razon_social.toLowerCase().includes(termino) ||
        (p.rfc ?? "").toLowerCase().includes(termino)
    );
  }, [proveedores, busqueda]);

  return (
    <div className="flex flex-col gap-5">
      <div className="relative sm:max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="text"
          placeholder="Buscar por razón social o RFC…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full rounded border border-black/[.08] bg-transparent py-2 pl-9 pr-3 text-sm dark:border-white/[.145]"
        />
      </div>

      {proveedoresFiltrados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          No se encontraron proveedores.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proveedoresFiltrados.map((p) => {
            const cuenta = datosBancariosTexto(p.datos_bancarios);
            return (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-black dark:text-zinc-50">
                    {p.razon_social}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      ESTILO_ESTATUS[p.estatus] ?? ESTILO_ESTATUS.Activo
                    }`}
                  >
                    {p.estatus}
                  </span>
                </div>

                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {p.rfc || "RFC no registrado"}
                </span>

                {(p.contacto_nombre || p.contacto_telefono || p.contacto_email) && (
                  <div className="flex flex-col gap-1 border-t border-black/[.08] pt-3 text-xs text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                    {p.contacto_nombre && <span>{p.contacto_nombre}</span>}
                    {p.contacto_telefono && (
                      <span className="flex items-center gap-1.5">
                        <Phone size={12} /> {p.contacto_telefono}
                      </span>
                    )}
                    {p.contacto_email && (
                      <span className="flex items-center gap-1.5">
                        <Mail size={12} /> {p.contacto_email}
                      </span>
                    )}
                  </div>
                )}

                {cuenta && (
                  <div className="flex items-center gap-1.5 rounded border border-black/[.08] bg-black/[.03] px-2.5 py-2 text-xs text-zinc-600 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                    <Landmark size={13} /> {cuenta}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
