"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  subirMiFirma,
  eliminarMiFirma,
  subirMiFoto,
  eliminarMiFoto,
  actualizarMiPerfilExtendido,
} from "@/app/actions/auth";
import UploaderImagenConEliminar from "@/components/UploaderImagenConEliminar";

const NOMBRES_ZONA = { izquierda: "Izquierda", derecha: "Derecha" };

/** Campo de texto "Puesto" con su propio guardado, independiente del upload de foto. */
function CampoPuesto({ puesto: puestoInicial, onGuardado }) {
  const [puesto, setPuesto] = useState(puestoInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    setGuardando(true);
    setError("");
    setGuardado(false);

    const resultado = await actualizarMiPerfilExtendido({ puesto });

    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setGuardado(true);
    onGuardado(puesto.trim() || null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Puesto</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
          value={puesto}
          onChange={(e) => {
            setPuesto(e.target.value);
            setGuardado(false);
          }}
          placeholder="Ej. Gerente de Ventas"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {guardado && <CheckCircle2 size={15} className="text-green-600 dark:text-green-400" />}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** Perfil propio: nombre/correo/rol de solo lectura, foto y puesto editables, y uploader de firma (solo si tiene firma_zona asignada por un ADMIN). */
export default function PanelMiPerfil({ perfil: perfilInicial }) {
  const [perfil, setPerfil] = useState(perfilInicial);

  async function subirFoto(archivo) {
    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirMiFoto(formData);
    if (!resultado.error) setPerfil((p) => ({ ...p, foto_url: resultado.url }));
    return resultado;
  }

  async function borrarFoto() {
    const resultado = await eliminarMiFoto();
    if (!resultado.error) setPerfil((p) => ({ ...p, foto_url: null }));
    return resultado;
  }

  async function subirFirma(archivo) {
    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirMiFirma(formData);
    if (!resultado.error) setPerfil((p) => ({ ...p, firma_imagen_url: resultado.url }));
    return resultado;
  }

  async function borrarFirma() {
    const resultado = await eliminarMiFirma();
    if (!resultado.error) setPerfil((p) => ({ ...p, firma_imagen_url: null }));
    return resultado;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nombre</span>
          <span className="text-sm text-black dark:text-zinc-50">{perfil.nombre}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Correo</span>
          <span className="text-sm text-black dark:text-zinc-50">{perfil.email}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Foto de perfil</span>
          <UploaderImagenConEliminar
            url={perfil.foto_url}
            accept="image/png,image/jpeg,image/webp"
            onSubir={subirFoto}
            onEliminar={borrarFoto}
            confirmarEliminar="¿Eliminar tu foto de perfil?"
            imgClassName="h-14 w-14 rounded-full border border-black/[.08] object-cover dark:border-white/[.145]"
          />
        </div>

        <CampoPuesto puesto={perfil.puesto} onGuardado={(puesto) => setPerfil((p) => ({ ...p, puesto }))} />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <div>
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">Firma de autorización</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Sello de imagen que se muestra en el PDF de las solicitudes que autorices. No tiene validez legal, no
            es una firma digital.
          </p>
        </div>

        {!perfil.firma_zona ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Esta función es solo para usuarios con zona de firma configurada. Pide a un administrador que te
            asigne una en Configuración → Roles y Accesos.
          </p>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Zona asignada: <span className="font-semibold">{NOMBRES_ZONA[perfil.firma_zona]}</span>
            </p>

            <UploaderImagenConEliminar
              url={perfil.firma_imagen_url}
              onSubir={subirFirma}
              onEliminar={borrarFirma}
              confirmarEliminar="¿Eliminar tu firma?"
              imgClassName="h-14 w-auto rounded border border-black/[.08] bg-white object-contain p-1 dark:border-white/[.145]"
            />
          </>
        )}
      </div>
    </div>
  );
}
