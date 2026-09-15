"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { actualizarPermisoModulo, getPermisosUsuario, heredarPermisoVista } from "@/app/actions/auth";

/**
 * Módulos con sus vistas del navbar (0045). El nivel del módulo sigue siendo
 * el piso real de acceso a datos vía RLS; las vistas son overrides opcionales
 * y puramente de UI para ocultar una vista puntual sin quitarle el módulo
 * completo a alguien (ej. dar "Autorizaciones" sin dar "Solicitudes").
 */
const MODULOS = [
  {
    clave: "SOLICITUDES",
    nombre: "Solicitudes de pago",
    vistas: [
      { clave: "SOLICITUDES_CREAR", nombre: "Solicitudes (nueva)" },
      { clave: "SOLICITUDES_MIS", nombre: "Mis Solicitudes" },
      { clave: "SOLICITUDES_AUTORIZACIONES", nombre: "Autorizaciones" },
      { clave: "SOLICITUDES_HISTORIAL", nombre: "Historial General" },
    ],
  },
  {
    clave: "TESORERIA",
    nombre: "Tesorería",
    vistas: [
      { clave: "TESORERIA_DISPERSION", nombre: "Tesorería (dispersión)" },
      { clave: "TESORERIA_CONTROL_MAESTRO", nombre: "Control Maestro" },
    ],
  },
  {
    clave: "WBS",
    nombre: "Presupuesto WBS",
    vistas: [
      { clave: "WBS_PRESUPUESTO", nombre: "Presupuesto WBS" },
      { clave: "WBS_ORDENES_CAMBIO", nombre: "Órdenes de Cambio WBS" },
    ],
  },
  { clave: "PROYECTOS", nombre: "Proyectos" },
  { clave: "PROVEEDORES", nombre: "Proveedores" },
  { clave: "UNIDADES", nombre: "Unidades" },
  { clave: "COTIZADOR", nombre: "Cotizador" },
  { clave: "COBRANZA", nombre: "Cobranza" },
  {
    clave: "CONFIGURACION",
    nombre: "Configuración",
    vistas: [
      { clave: "CONFIGURACION_PLANTILLAS", nombre: "Plantillas PDF" },
      { clave: "CONFIGURACION_IMPORTAR", nombre: "Importar Histórico" },
    ],
  },
  {
    // No es una sección del menú: gatea la acción de autorizar dentro de
    // autorizar_solicitud()/autorizar_orden_cambio_wbs() (0046). "Visualización
    // y escritura" = puede autorizar; cualquier otro nivel = solo puede ver las
    // solicitudes/órdenes pendientes (con el módulo SOLICITUDES/WBS) pero no
    // resolverlas.
    clave: "AUTORIZACIONES_GLOBAL",
    nombre: "Autorizador Global (Solicitudes y WBS)",
  },
];

const CLAVES_VISTA = new Set(MODULOS.flatMap((m) => (m.vistas ?? []).map((v) => v.clave)));

const NIVELES = [
  { valor: "sin_acceso", etiqueta: "Sin acceso" },
  { valor: "lectura", etiqueta: "Visualización" },
  { valor: "lectura_escritura", etiqueta: "Visualización y escritura" },
];

// "hereda" no es un nivel real: significa "sin fila propia", así que al
// elegirlo se borra el override en vez de guardar un nivel.
const NIVELES_VISTA = [{ valor: "hereda", etiqueta: "Hereda del módulo" }, ...NIVELES];

/** Modal de administración de accesos por módulo (y vista) de un usuario (solo ADMIN). Filas ausentes en permisos_usuario equivalen a "sin_acceso" en un módulo, o a "hereda del módulo" en una vista. */
export default function ModalPermisosUsuario({ usuario, onCerrar }) {
  const [niveles, setNiveles] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoClave, setGuardandoClave] = useState(null);
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
      CLAVES_VISTA.forEach((clave) => {
        mapa[clave] = "hereda";
      });
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

  async function cambiarNivel(clave, nivel) {
    setError("");
    setGuardandoClave(clave);

    const resultado =
      nivel === "hereda" ? await heredarPermisoVista(usuario.id, clave) : await actualizarPermisoModulo(usuario.id, clave, nivel);

    setGuardandoClave(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setNiveles((n) => ({ ...n, [clave]: nivel }));
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
          Por módulo: sin acceso, solo visualización, o visualización y escritura. Las vistas debajo de un
          módulo heredan su nivel salvo que se les fije una excepción (solo ocultan la vista del menú, no
          restringen los datos). &quot;Autorizador Global&quot; es distinto: con &quot;Visualización y
          escritura&quot; puede resolver solicitudes y órdenes de cambio WBS; sin eso, aunque vea la lista
          (por su acceso a Solicitudes/WBS) no podrá autorizar nada — eso sí lo bloquea el sistema, no solo
          la pantalla.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
            {MODULOS.map((m) => (
              <div key={m.clave} className="flex flex-col gap-2 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-black dark:text-zinc-50">{m.nombre}</span>
                  <select
                    value={niveles[m.clave]}
                    disabled={guardandoClave === m.clave}
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

                {m.vistas && (
                  <div className="flex flex-col gap-2 border-l border-black/[.08] pl-3 dark:border-white/[.145]">
                    {m.vistas.map((v) => (
                      <div key={v.clave} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">{v.nombre}</span>
                        <select
                          value={niveles[v.clave]}
                          disabled={guardandoClave === v.clave}
                          onChange={(e) => cambiarNivel(v.clave, e.target.value)}
                          className="rounded-md border border-black/[.08] bg-transparent px-2 py-1 text-[11px] font-medium outline-none focus:border-zinc-400 disabled:opacity-50 dark:border-white/[.145] dark:focus:border-zinc-600"
                        >
                          {NIVELES_VISTA.map((n) => (
                            <option key={n.valor} value={n.valor}>
                              {n.etiqueta}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
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
