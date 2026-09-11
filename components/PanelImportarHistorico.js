"use client";

import { useState } from "react";
import { Table, Users, FileText } from "lucide-react";
import ModalImportarWbs from "@/components/ModalImportarWbs";
import ModalImportarProveedores from "@/components/ModalImportarProveedores";
import ModalImportarSolicitudesHistoricas from "@/components/ModalImportarSolicitudesHistoricas";

const ENTIDADES = [
  { id: "wbs", nombre: "WBS histórico", icon: Table },
  { id: "solicitudes", nombre: "Solicitudes pagadas históricas", icon: FileText },
  { id: "proveedores", nombre: "Proveedores", icon: Users },
];

/** Selector de entidad + flujo de importación histórica por Excel, reusando los modales de import ya existentes. */
export default function PanelImportarHistorico({ proyectos }) {
  const [entidad, setEntidad] = useState("wbs");
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ?? "");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mensaje, setMensaje] = useState("");

  function cerrarConMensaje(texto) {
    setModalAbierto(false);
    if (texto) {
      setMensaje(texto);
      setTimeout(() => setMensaje(""), 4000);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {ENTIDADES.map((e) => {
          const Icon = e.icon;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setEntidad(e.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                entidad === e.id
                  ? "bg-foreground text-background"
                  : "border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              }`}
            >
              <Icon size={14} /> {e.nombre}
            </button>
          );
        })}
      </div>

      {mensaje && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          {mensaje}
        </p>
      )}

      {entidad === "wbs" && (
        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Carga o actualiza el catálogo WBS de un proyecto desde un Excel (columnas: categoría, partida,
            presupuesto). Se previsualiza el diff antes de aplicar cualquier cambio.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
            >
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!proyectoId}
              onClick={() => setModalAbierto(true)}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              Importar Excel
            </button>
          </div>
        </div>
      )}

      {entidad === "solicitudes" && (
        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Carga solicitudes ya pagadas fuera de este sistema (ej. de años anteriores). Se insertan
            directo como Pagado, sin mover saldo de cuentas bancarias ni generar movimientos de tesorería
            (esa carga ya está conciliada). Se previsualiza el diff antes de aplicar.
          </p>
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="w-fit rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background dark:hover:bg-[#ccc]"
          >
            Importar Excel
          </button>
        </div>
      )}

      {entidad === "proveedores" && (
        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Carga masiva de proveedores desde Excel/CSV (columnas: Razón Social, RFC, Banco, Cuenta / CLABE,
            Contacto Nombre, Teléfono, Email). Se previsualiza el diff antes de aplicar.
          </p>
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="w-fit rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background dark:hover:bg-[#ccc]"
          >
            Importar Excel
          </button>
        </div>
      )}

      {modalAbierto && entidad === "wbs" && (
        <ModalImportarWbs
          proyectoId={Number(proyectoId)}
          onCerrar={() => setModalAbierto(false)}
          onImportado={() => cerrarConMensaje("Catálogo WBS actualizado correctamente.")}
        />
      )}

      {modalAbierto && entidad === "solicitudes" && (
        <ModalImportarSolicitudesHistoricas
          onCerrar={() => setModalAbierto(false)}
          onImportado={() => cerrarConMensaje("Solicitudes históricas importadas correctamente.")}
        />
      )}

      {modalAbierto && entidad === "proveedores" && (
        <ModalImportarProveedores
          onCerrar={() => setModalAbierto(false)}
          onImportado={() => cerrarConMensaje("Proveedores importados correctamente.")}
        />
      )}
    </div>
  );
}
