"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { getWbsPresupuesto, actualizarPresupuestoWbs, renombrarPartidaWbs } from "@/app/actions/wbs";
import ModalImportarWbs from "@/components/ModalImportarWbs";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function FilaWbs({
  fila,
  guardando,
  renombrando,
  onIniciarRenombre,
  onCancelarRenombre,
  onGuardarPresupuesto,
  onGuardarRenombre,
}) {
  const [presupuesto, setPresupuesto] = useState(fila.presupuesto);
  const [categoria, setCategoria] = useState(fila.categoria);
  const [partida, setPartida] = useState(fila.partida);

  const inputMontoClase =
    "w-32 rounded border border-black/[.08] bg-transparent px-2 py-1 text-sm text-right dark:border-white/[.145]";
  const inputTextoClase =
    "rounded border border-black/[.08] bg-transparent px-2 py-1 text-sm dark:border-white/[.145]";

  return (
    <tr className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
      <td className="px-4 py-2">
        {renombrando ? (
          <input
            className={inputTextoClase}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          />
        ) : (
          <button type="button" onClick={onIniciarRenombre} className="text-left hover:underline">
            {fila.categoria}
          </button>
        )}
      </td>
      <td className="px-4 py-2">
        {renombrando ? (
          <div className="flex items-center gap-2">
            <input
              className={inputTextoClase}
              value={partida}
              onChange={(e) => setPartida(e.target.value)}
            />
            <button
              type="button"
              onClick={() => onGuardarRenombre(categoria, partida)}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={onCancelarRenombre}
              className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            >
              Cancelar
            </button>
          </div>
        ) : (
          fila.partida
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          min="0"
          step="0.01"
          disabled={guardando}
          className={inputMontoClase}
          value={presupuesto}
          onChange={(e) => setPresupuesto(e.target.value)}
          onBlur={(e) => onGuardarPresupuesto(e.target.value)}
        />
      </td>
      <td className="px-4 py-2 text-right">{formatoMXN(fila.ejercido)}</td>
      <td className="px-4 py-2 text-right font-medium">{formatoMXN(fila.disponible)}</td>
      <td className="px-4 py-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            fila.activo
              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {fila.activo ? "Activo" : "Inactivo"}
        </span>
      </td>
    </tr>
  );
}

/** Panel de presupuesto por partida WBS: edición inline y bulk import desde Excel. */
export default function PanelPresupuestoWbs({ proyectos }) {
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ? String(proyectos[0].id) : "");
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState({});
  const [renombrando, setRenombrando] = useState(null);

  useEffect(() => {
    if (!proyectoId) {
      setFilas([]);
      return;
    }
    let vigente = true;
    setCargando(true);
    getWbsPresupuesto(Number(proyectoId)).then((data) => {
      if (vigente) {
        setFilas(data);
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  async function guardarPresupuesto(id, valor) {
    const monto = parseFloat(valor);
    if (!(monto >= 0)) return;
    setGuardando((g) => ({ ...g, [id]: true }));
    setError("");
    const resultado = await actualizarPresupuestoWbs(id, monto);
    if (resultado.error) {
      setError(resultado.error);
    } else {
      setFilas((fs) =>
        fs.map((f) => (f.id === id ? { ...f, presupuesto: monto, disponible: monto - f.ejercido } : f))
      );
    }
    setGuardando((g) => ({ ...g, [id]: false }));
  }

  async function guardarRenombre(id, categoria, partida) {
    setError("");
    const resultado = await renombrarPartidaWbs(id, categoria, partida);
    if (resultado.error) {
      setError(resultado.error);
    } else {
      setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, categoria, partida } : f)));
      setRenombrando(null);
    }
  }

  function importado() {
    setModalAbierto(false);
    getWbsPresupuesto(Number(proyectoId)).then(setFilas);
  }

  const selectClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={selectClase}>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} — {p.nombre}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          disabled={!proyectoId}
          className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          <Upload size={15} /> Importar WBS desde Excel
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {cargando ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          Este proyecto no tiene partidas WBS con presupuesto. Impórtalas desde Excel.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Partida</th>
                <th className="px-4 py-3 text-right">Presupuesto</th>
                <th className="px-4 py-3 text-right">Ejercido</th>
                <th className="px-4 py-3 text-right">Disponible</th>
                <th className="px-4 py-3">Activo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <FilaWbs
                  key={f.id}
                  fila={f}
                  guardando={!!guardando[f.id]}
                  renombrando={renombrando === f.id}
                  onIniciarRenombre={() => setRenombrando(f.id)}
                  onCancelarRenombre={() => setRenombrando(null)}
                  onGuardarPresupuesto={(valor) => guardarPresupuesto(f.id, valor)}
                  onGuardarRenombre={(categoria, partida) => guardarRenombre(f.id, categoria, partida)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <ModalImportarWbs
          proyectoId={Number(proyectoId)}
          onImportado={importado}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </div>
  );
}
