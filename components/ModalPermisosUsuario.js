"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { actualizarPermisoModulo, getPermisosUsuario } from "@/app/actions/auth";

const MODULOS = [
  { clave: "SOLICITUDES", nombre: "Solicitudes de pago" },
  { clave: "TESORERIA", nombre: "Tesorería" },
  { clave: "WBS", nombre: "Presupuesto WBS" },
  { clave: "PROYECTOS", nombre: "Proyectos" },
  { clave: "PROVEEDORES", nombre: "Proveedores" },
  { clave: "UNIDADES", nombre: "Unidades" },
  { clave: "COTIZADOR", nombre: "Cotizador" },
  { clave: "COBRANZA", nombre: "Cobranza" },
  { clave: "CONFIGURACION", nombre: "Configuración" },
];

const NIVELES = [
  { valor: "sin_acceso", etiqueta: "Sin acceso" },
  { valor: "lectura", etiqueta: "Visualización" },
  { valor: "lectura_escritura", etiqueta: "Visualización y escritura" },
];

/** Modal de administración de accesos por módulo de un usuario (solo ADMIN). Filas ausentes en permisos_usuario equivalen a "sin_acceso". */
export default function ModalPermisosUsuario({ usuario, onCerrar }) {
  const [niveles, setNiveles] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoModulo, setGuardandoModulo] = useState(null);
  const [error, setError] = useState("");
  const [usuarioEnCurso, setUsuarioEnCurso] = useState(null);

  // Ajuste de estado durante el render (no en el Effect) al abrir el modal
  // con un usuario distinto al ya procesado — mismo patrón que
  // ModalDesglosePagosWbs.js.
  if (usuario && usuario.id !== usuarioEnCurso) {
    setUsuarioEnCurso(usuario.id);
    setCargando(true);
    setError("");
  }

  useEffect(() => {
    if (!usuario) return;
    let vigente = true;
    getPermisosUsuario(usuario.id).then((filas) => {
      if (!vigente) return;
      const mapa = Object.fromEntries(MODULOS.map((m) => [m.clave, "sin_acceso"]));
      filas.forEach((f) => {
        mapa[f.modulo] = f.nivel;
      });
      setNiveles(mapa);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [usuario]);

  if (!usuario) return null;

  async function cambiarNivel(modulo, nivel) {
    setError("");
    setGuardandoModulo(modulo);
    const resultado = await actualizarPermisoModulo(usuario.id, modulo, nivel);
    setGuardandoModulo(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setNiveles((n) => ({ ...n, [modulo]: nivel }));
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4" onClick={onCerrar}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
            <ShieldCheck size={17} /> Accesos de {usuario.nombre}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Por módulo: sin acceso, solo visualización, o visualización y escritura.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
            {MODULOS.map((m) => (
              <div key={m.clave} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-black dark:text-zinc-50">{m.nombre}</span>
                <select
                  value={niveles[m.clave]}
                  disabled={guardandoModulo === m.clave}
                  onChange={(e) => cambiarNivel(m.clave, e.target.value)}
                  className="rounded-md border border-black/[.08] bg-transparent px-2 py-1 text-xs font-medium outline-none focus:border-zinc-400 disabled:opacity-50 dark:border-white/[.145] dark:focus:border-zinc-600"
                >
                  {NIVELES.map((n) => (
                    <option key={n.valor} value={n.valor}>
                      {n.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
