"use client";

import { useRef, useState } from "react";
import { Search, CheckCircle2, UserPlus, Loader2, Eye, EyeOff } from "lucide-react";
import { actualizarRolUsuario, actualizarEstatusUsuario, actualizarFirmaZona, crearUsuario } from "@/app/actions/auth";

const NOMBRES_ROL = {
  SOLICITANTE: "Solicitante",
  APROBADOR: "Aprobador (Socios/Jefa)",
  TESORERIA: "Tesorería / Auxiliar",
  ADMIN: "Administrador",
};

/** Panel de administración de roles y estatus de usuarios (solo ADMIN). */
export default function PanelPermisos({ perfiles: perfilesIniciales, perfilActualId }) {
  const [perfiles, setPerfiles] = useState(perfilesIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [guardandoId, setGuardandoId] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const formCrearRef = useRef(null);

  function notificar(msg) {
    setMensaje(msg);
    setTimeout(() => setMensaje(""), 3000);
  }

  async function crear(e) {
    e.preventDefault();
    setErrorCrear("");
    setCreando(true);

    const resultado = await crearUsuario(new FormData(e.target));
    setCreando(false);

    if (resultado.error) {
      setErrorCrear(resultado.error);
      return;
    }

    if (resultado.perfil) {
      setPerfiles((filas) => [...filas, resultado.perfil].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }
    formCrearRef.current?.reset();
    setVerPassword(false);
    notificar("Usuario creado correctamente");
  }

  async function cambiarRol(id, rol) {
    setError("");
    setGuardandoId(id);
    const resultado = await actualizarRolUsuario(id, rol);
    setGuardandoId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setPerfiles((filas) => filas.map((f) => (f.id === id ? { ...f, rol } : f)));
    notificar("Rol actualizado correctamente");
  }

  async function cambiarZonaFirma(id, zona) {
    setError("");
    setGuardandoId(id);
    const resultado = await actualizarFirmaZona(id, zona || null);
    setGuardandoId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setPerfiles((filas) => filas.map((f) => (f.id === id ? { ...f, firma_zona: zona || null } : f)));
    notificar("Zona de firma actualizada correctamente");
  }

  async function alternarEstatus(id, activoActual) {
    setError("");
    setGuardandoId(id);
    const resultado = await actualizarEstatusUsuario(id, !activoActual);
    setGuardandoId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setPerfiles((filas) => filas.map((f) => (f.id === id ? { ...f, activo: !activoActual } : f)));
    notificar("Estatus actualizado correctamente");
  }

  const perfilesFiltrados = perfiles.filter(
    (p) =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.email.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formCrearRef}
        onSubmit={crear}
        className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <UserPlus size={17} /> Nuevo Usuario
        </h3>
        <p className="-mt-2 text-xs text-zinc-500">
          Se creará con esta contraseña temporal; se le pedirá cambiarla en su primer inicio de sesión.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nombre</label>
            <input
              type="text"
              name="nombre"
              placeholder="Nombre completo"
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-600"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Correo Electrónico</label>
            <input
              type="email"
              name="email"
              required
              placeholder="usuario@dipz.mx"
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-600"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Contraseña Temporal</label>
            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                name="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-lg border border-black/[.08] bg-transparent px-3 py-2 pr-9 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-600"
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                {verPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {errorCrear && <p className="text-sm text-red-600 dark:text-red-400">{errorCrear}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creando}
            className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {creando ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            {creando ? "Creando…" : "Crear Usuario"}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-black/[.08] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-600"
          />
        </div>

        {mensaje && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 size={15} /> {mensaje}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/[.08] text-xs font-medium uppercase text-zinc-500 dark:border-white/[.145]">
            <tr>
              <th className="px-6 py-3">Usuario</th>
              <th className="px-6 py-3">Rol</th>
              <th className="px-6 py-3">Zona de firma</th>
              <th className="px-6 py-3">Estatus</th>
              <th className="px-6 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[.06] dark:divide-white/[.08]">
            {perfilesFiltrados.map((p) => {
              const esUnoMismo = p.id === perfilActualId;
              return (
                <tr key={p.id}>
                  <td className="px-6 py-3">
                    <div className="font-medium text-black dark:text-zinc-50">{p.nombre}</div>
                    <div className="text-xs text-zinc-500">{p.email}</div>
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={p.rol}
                      disabled={guardandoId === p.id || esUnoMismo}
                      onChange={(e) => cambiarRol(p.id, e.target.value)}
                      className="rounded-md border border-black/[.08] bg-transparent px-2 py-1 text-xs font-semibold outline-none focus:border-zinc-400 disabled:opacity-50 dark:border-white/[.145] dark:focus:border-zinc-600"
                    >
                      {Object.entries(NOMBRES_ROL).map(([valor, etiqueta]) => (
                        <option key={valor} value={valor}>
                          {etiqueta}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={p.firma_zona ?? ""}
                      disabled={guardandoId === p.id}
                      onChange={(e) => cambiarZonaFirma(p.id, e.target.value)}
                      className="rounded-md border border-black/[.08] bg-transparent px-2 py-1 text-xs font-semibold outline-none focus:border-zinc-400 disabled:opacity-50 dark:border-white/[.145] dark:focus:border-zinc-600"
                    >
                      <option value="">Ninguna</option>
                      <option value="izquierda">Izquierda</option>
                      <option value="derecha">Derecha</option>
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.activo
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p.activo ? "bg-green-500" : "bg-red-500"}`} />
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      type="button"
                      disabled={guardandoId === p.id || esUnoMismo}
                      onClick={() => alternarEstatus(p.id, p.activo)}
                      title={esUnoMismo ? "No puedes desactivar tu propia cuenta" : undefined}
                      className="rounded-md border border-black/[.08] px-3 py-1.5 text-xs font-medium transition hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-white/[.06]"
                    >
                      {p.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
