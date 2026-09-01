"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getUnidadesDisponibles } from "@/app/actions/unidades";
import { crearContratoVenta } from "@/app/actions/cobranza";

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** Asigna directamente una unidad 'SIN ASIGNAR' a un cliente ya existente, creando su contrato de venta. */
export default function ModalAsignarUnidad({ cliente, proyectos, onAsignado, onCerrar }) {
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ? String(proyectos[0].id) : "");
  const [unidades, setUnidades] = useState([]);
  const [cargandoUnidades, setCargandoUnidades] = useState(Boolean(proyectoId));
  const [unidadId, setUnidadId] = useState("");
  const [montoTotal, setMontoTotal] = useState("");
  const [fechaContrato, setFechaContrato] = useState(new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!proyectoId) return;
    let vigente = true;
    getUnidadesDisponibles(Number(proyectoId)).then((data) => {
      if (vigente) {
        setUnidades(data);
        setUnidadId(data[0]?.id ?? "");
        setCargandoUnidades(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  function cambiarProyecto(valor) {
    setProyectoId(valor);
    setUnidades([]);
    setUnidadId("");
    if (valor) setCargandoUnidades(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");

    if (!unidadId) {
      setError("Selecciona una unidad disponible.");
      return;
    }
    if (!(Number(montoTotal) > 0)) {
      setError("Captura el monto total de venta.");
      return;
    }

    setGuardando(true);
    const resultado = await crearContratoVenta({
      proyectoId: Number(proyectoId),
      unidadId,
      clienteId: cliente.id,
      montoTotal,
      fechaContrato,
    });
    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    onAsignado();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={guardar}
        className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Asignar Unidad — {cliente.nombre}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Proyecto</label>
          <select
            className={inputClase}
            value={proyectoId}
            onChange={(e) => cambiarProyecto(e.target.value)}
          >
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClase}>Unidad (Sin Asignar)</label>
          {cargandoUnidades ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando unidades…</p>
          ) : unidades.length === 0 ? (
            <p className="rounded border border-dashed border-black/[.08] px-3 py-2.5 text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
              Este proyecto no tiene unidades sin asignar.
            </p>
          ) : (
            <select className={inputClase} value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo_unidad} — {u.tipo_uso} ({Number(u.superficie_m2).toLocaleString("es-MX")} m²)
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Monto Total de Venta</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClase}
              value={montoTotal}
              onChange={(e) => setMontoTotal(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClase}>Fecha de Contrato</label>
            <input
              type="date"
              className={inputClase}
              value={fechaContrato}
              onChange={(e) => setFechaContrato(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || unidades.length === 0}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {guardando ? "Asignando…" : "Asignar Unidad"}
          </button>
        </div>
      </form>
    </div>
  );
}
