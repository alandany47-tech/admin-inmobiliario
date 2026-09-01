"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronsDown,
  ChevronsUp,
  FileDown,
  Pencil,
  Save,
  Upload,
  X,
} from "lucide-react";
import { getWbsPresupuesto, actualizarPresupuestoWbs, renombrarPartidaWbs } from "@/app/actions/wbs";
import { construirArbol } from "@/lib/wbs";
import ModalImportarWbs from "@/components/ModalImportarWbs";
import ModalDesglosePagosWbs from "@/components/ModalDesglosePagosWbs";
import ModalConfirmarCambiosWbs from "@/components/ModalConfirmarCambiosWbs";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/** Recolecta recursivamente las hojas (nodos sin hijos) bajo un nodo del árbol. */
function recolectarHojas(nodo) {
  if (nodo.hijos.length === 0) return [nodo];
  return nodo.hijos.flatMap(recolectarHojas);
}

/** Recolecta recursivamente los ids de todos los nodos con hijos (expandibles) del árbol. */
function idsExpandibles(nodos) {
  return nodos.flatMap((n) => (n.hijos.length > 0 ? [n.id, ...idsExpandibles(n.hijos)] : []));
}

function NodoWbs({
  nodo,
  nivel,
  expandidos,
  onAlternarExpandido,
  bloqueado,
  versionCambios,
  renombrandoId,
  onIniciarRenombre,
  onCancelarRenombre,
  onGuardarPresupuesto,
  onGuardarRenombre,
  modoEdicion,
  onVerDesglose,
}) {
  const esHoja = nodo.hijos.length === 0;
  const expandido = expandidos.has(nodo.id);
  const renombrando = renombrandoId === nodo.id;
  const [presupuesto, setPresupuesto] = useState(nodo.presupuesto);
  const [categoria, setCategoria] = useState(nodo.categoria);
  const [partida, setPartida] = useState(nodo.partida);

  const inputMontoClase =
    "w-28 rounded border border-black/[.08] bg-transparent px-2 py-1 text-sm text-right dark:border-white/[.145]";
  const inputTextoClase =
    "rounded border border-black/[.08] bg-transparent px-2 py-1 text-sm dark:border-white/[.145]";

  return (
    <>
      <tr
        onClick={!esHoja ? () => onAlternarExpandido(nodo.id) : undefined}
        className={`border-b border-black/[.08] last:border-b-0 dark:border-white/[.145] ${
          nivel === 0 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
        } ${!esHoja ? "cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06]" : ""}`}
      >
        <td className="py-2 pr-4 pl-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {nodo.codigoJerarquico}
        </td>
        <td className="py-2 pr-4" style={{ paddingLeft: `${nivel * 1.25}rem` }}>
          <div className="flex items-center gap-1.5">
            {renombrando ? (
              <input
                className={inputTextoClase}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              />
            ) : esHoja && modoEdicion ? (
              <button
                type="button"
                onClick={() => onIniciarRenombre(nodo.id)}
                className="text-left hover:underline"
              >
                {nodo.categoria}
              </button>
            ) : (
              <span className="font-medium text-black dark:text-zinc-50">{nodo.categoria}</span>
            )}
          </div>
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
                onClick={() => onGuardarRenombre(nodo.id, categoria, partida)}
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
            nodo.partida
          )}
        </td>
        <td className="px-4 py-2 text-right">
          {esHoja && modoEdicion ? (
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={bloqueado}
              className={inputMontoClase}
              value={presupuesto}
              onChange={(e) => setPresupuesto(e.target.value)}
              onBlur={(e) => onGuardarPresupuesto(nodo.id, e.target.value)}
            />
          ) : (
            formatoMXN(esHoja ? nodo.presupuesto : nodo.presupuestoAgg)
          )}
        </td>
        <td className="px-4 py-2 text-right">
          {nodo.esVirtual ? (
            formatoMXN(nodo.ejercidoAgg)
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onVerDesglose(nodo);
              }}
              className="hover:underline"
            >
              {formatoMXN(esHoja ? nodo.ejercido : nodo.ejercidoAgg)}
            </button>
          )}
        </td>
        <td className="px-4 py-2 text-right font-medium">
          {formatoMXN(esHoja ? nodo.disponible : nodo.disponibleAgg)}
        </td>
        <td className="px-4 py-2">
          {esHoja && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                nodo.activo
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {nodo.activo ? "Activo" : "Inactivo"}
            </span>
          )}
        </td>
      </tr>
      {!esHoja &&
        expandido &&
        nodo.hijos.map((hijo) => (
          <NodoWbs
            key={`${hijo.id}-v${versionCambios}`}
            nodo={hijo}
            nivel={nivel + 1}
            expandidos={expandidos}
            onAlternarExpandido={onAlternarExpandido}
            bloqueado={bloqueado}
            versionCambios={versionCambios}
            renombrandoId={renombrandoId}
            onIniciarRenombre={onIniciarRenombre}
            onCancelarRenombre={onCancelarRenombre}
            onGuardarPresupuesto={onGuardarPresupuesto}
            onGuardarRenombre={onGuardarRenombre}
            modoEdicion={modoEdicion}
            onVerDesglose={onVerDesglose}
          />
        ))}
    </>
  );
}

function IconoOrden({ activo, direccion }) {
  if (!activo) return <ArrowUpDown size={12} className="opacity-40" />;
  return direccion === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

function TarjetaKpi({ titulo, valor, negativo }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {titulo}
      </span>
      <span
        className={`text-xl font-semibold ${
          negativo ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}

/**
 * Dashboard visual del proyecto: KPIs globales y desglose de avance por
 * partida raíz (Nivel 1). Cada partida es un acordeón: al desplegarla
 * muestra la lista de subpartidas hoja de donde se resta el dinero, con su
 * pagado y el porcentaje de su propio presupuesto ya ejercido.
 */
function DashboardWbs({ arbol, presupuestoTotal, ejercidoTotal, disponibleTotal, avancePct }) {
  const [expandidos, setExpandidos] = useState(new Set());

  function alternar(id) {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaKpi titulo="Presupuesto Total Proyecto" valor={formatoMXN(presupuestoTotal)} />
        <TarjetaKpi titulo="Total Ejercido Real (Banco)" valor={formatoMXN(ejercidoTotal)} />
        <TarjetaKpi
          titulo="Disponible Global"
          valor={formatoMXN(disponibleTotal)}
          negativo={disponibleTotal < 0}
        />
        <TarjetaKpi titulo="% de Avance Financiero" valor={`${avancePct.toFixed(1)}%`} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Avance por Partida (Nivel 1)
        </h2>
        {arbol.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
            Sin categorías con presupuesto.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {arbol.map((grupo) => {
              const pct = grupo.presupuestoAgg > 0 ? (grupo.ejercidoAgg / grupo.presupuestoAgg) * 100 : 0;
              const color = pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500";
              const expandido = expandidos.has(grupo.id);
              const hojas = recolectarHojas(grupo);
              return (
                <div
                  key={grupo.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
                >
                  <button
                    type="button"
                    onClick={() => alternar(grupo.id)}
                    className="flex flex-col gap-1.5 text-left"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-black dark:text-zinc-50">
                        {grupo.codigoJerarquico}. {grupo.categoria}
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {formatoMXN(grupo.ejercidoAgg)} / {formatoMXN(grupo.presupuestoAgg)} ({pct.toFixed(0)}
                        %)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
                      <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </button>

                  {expandido && (
                    <div className="mt-2 flex flex-col divide-y divide-black/[.06] border-t border-black/[.06] pt-2 dark:divide-white/[.08] dark:border-white/[.08]">
                      {hojas.length === 0 ? (
                        <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
                          Sin subpartidas hoja.
                        </p>
                      ) : (
                        hojas.map((hoja) => {
                          const pctHoja =
                            Number(hoja.presupuesto) > 0
                              ? (Number(hoja.ejercido) / Number(hoja.presupuesto)) * 100
                              : 0;
                          return (
                            <div
                              key={hoja.id}
                              className="flex items-center justify-between gap-3 py-2 text-xs"
                            >
                              <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                                <span className="font-mono text-zinc-400 dark:text-zinc-500">
                                  {hoja.codigoJerarquico}
                                </span>
                                {hoja.partida}
                              </span>
                              <span className="shrink-0 text-zinc-700 dark:text-zinc-300">
                                {formatoMXN(hoja.ejercido)} / {formatoMXN(hoja.presupuesto)} (
                                {pctHoja.toFixed(0)}%)
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Panel de presupuesto WBS: árbol jerárquico colapsable, edición inline y dashboard de avance. */
export default function PanelPresupuestoWbs({ proyectos }) {
  const router = useRouter();
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ? String(proyectos[0].id) : "");
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(Boolean(proyectoId));
  const [error, setError] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [renombrando, setRenombrando] = useState(null);
  const [vista, setVista] = useState("arbol");
  const [expandidos, setExpandidos] = useState(new Set());
  const [modoEdicion, setModoEdicion] = useState(false);
  const [desgloseNodo, setDesgloseNodo] = useState(null);
  const [orden, setOrden] = useState({ criterio: "codigo", direccion: "asc" });

  // Cambios de presupuesto/renombre en modo edición: se acumulan aquí sin
  // tocar el servidor hasta que el usuario confirma explícitamente en el
  // modal de "Guardar Cambios" (previamente cada edición disparaba su propia
  // Server Action al perder el foco). Clave = id numérico de wbs_catalog.
  const [cambiosPendientes, setCambiosPendientes] = useState({});
  const [modalConfirmarAbierto, setModalConfirmarAbierto] = useState(false);
  const [guardandoLote, setGuardandoLote] = useState(false);
  const [errorLote, setErrorLote] = useState("");
  // Se incrementa al cancelar o al aplicar cambios para forzar el remount de
  // NodoWbs (su input de presupuesto/categoría/partida solo lee su valor
  // inicial una vez) y así sincronizar el valor mostrado con el real.
  const [versionCambios, setVersionCambios] = useState(0);

  useEffect(() => {
    if (!proyectoId) return;
    let vigente = true;
    getWbsPresupuesto(Number(proyectoId)).then((data) => {
      if (vigente) {
        setFilas(data);
        setExpandidos(new Set());
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  // Superpone los cambios pendientes (aún no confirmados) sobre `filas` para
  // que el árbol y los agregados reflejen la edición en curso sin haber
  // tocado el servidor todavía.
  const filasConCambios = useMemo(() => {
    if (Object.keys(cambiosPendientes).length === 0) return filas;
    return filas.map((f) => {
      const cambio = cambiosPendientes[f.id];
      if (!cambio) return f;
      const presupuesto = cambio.presupuesto ?? f.presupuesto;
      return {
        ...f,
        presupuesto,
        categoria: cambio.categoria ?? f.categoria,
        partida: cambio.partida ?? f.partida,
        disponible: presupuesto - f.ejercido,
      };
    });
  }, [filas, cambiosPendientes]);

  const { arbol, hojas } = useMemo(
    () => construirArbol(filasConCambios, orden),
    [filasConCambios, orden]
  );

  function cambiarOrden(criterio) {
    setOrden((o) =>
      o.criterio === criterio
        ? { criterio, direccion: o.direccion === "asc" ? "desc" : "asc" }
        : { criterio, direccion: criterio === "codigo" ? "asc" : "desc" }
    );
  }

  const presupuestoTotal = useMemo(() => hojas.reduce((s, h) => s + Number(h.presupuesto), 0), [hojas]);
  const ejercidoTotal = useMemo(() => hojas.reduce((s, h) => s + Number(h.ejercido), 0), [hojas]);
  const disponibleTotal = presupuestoTotal - ejercidoTotal;
  const avancePct = presupuestoTotal > 0 ? (ejercidoTotal / presupuestoTotal) * 100 : 0;

  function alternarExpandidoNodo(id) {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function expandirTodo() {
    setExpandidos(new Set(idsExpandibles(arbol)));
  }

  function contraerTodo() {
    setExpandidos(new Set());
  }

  /**
   * Registra/actualiza el cambio pendiente de una fila. Si el resultado
   * coincide con el valor original en todos sus campos, limpia la entrada
   * (evita mostrar en la barra flotante ediciones que el usuario deshizo a
   * mano, ej. escribir y borrar).
   */
  function actualizarCambioPendiente(id, cambio) {
    const original = filas.find((f) => f.id === id);
    if (!original) return;

    setCambiosPendientes((prev) => {
      const previo = prev[id] ?? {
        id: original.id,
        original: {
          presupuesto: original.presupuesto,
          categoria: original.categoria,
          partida: original.partida,
          codigo: original.codigo,
        },
      };
      const siguiente = { ...previo, ...cambio };

      if (siguiente.presupuesto !== undefined && Number(siguiente.presupuesto) === Number(previo.original.presupuesto)) {
        delete siguiente.presupuesto;
      }
      if (siguiente.categoria !== undefined && siguiente.categoria === previo.original.categoria) {
        delete siguiente.categoria;
      }
      if (siguiente.partida !== undefined && siguiente.partida === previo.original.partida) {
        delete siguiente.partida;
      }

      if (siguiente.presupuesto === undefined && siguiente.categoria === undefined && siguiente.partida === undefined) {
        const { [id]: _omitido, ...resto } = prev;
        return resto;
      }
      return { ...prev, [id]: siguiente };
    });
  }

  function marcarPresupuestoPendiente(id, valor) {
    const monto = parseFloat(valor);
    if (!(monto >= 0)) return;
    actualizarCambioPendiente(id, { presupuesto: monto });
  }

  function marcarRenombrePendiente(id, categoria, partida) {
    if (!categoria?.trim() || !partida?.trim()) {
      setError("Captura categoría y partida.");
      return;
    }
    setError("");
    actualizarCambioPendiente(id, { categoria: categoria.trim(), partida: partida.trim() });
    setRenombrando(null);
  }

  function cancelarCambiosPendientes() {
    setCambiosPendientes({});
    setRenombrando(null);
    setError("");
    setVersionCambios((v) => v + 1);
  }

  /** Aplica en lote los cambios confirmados en el modal: Server Actions secuenciales + refresco de filas y de la ruta. */
  async function confirmarCambiosPendientes(comentario) {
    setGuardandoLote(true);
    setErrorLote("");

    for (const cambio of Object.values(cambiosPendientes)) {
      if (cambio.presupuesto !== undefined) {
        const resultado = await actualizarPresupuestoWbs(cambio.id, cambio.presupuesto, comentario);
        if (resultado.error) {
          setErrorLote(resultado.error);
          setGuardandoLote(false);
          return;
        }
      }
      if (cambio.categoria !== undefined || cambio.partida !== undefined) {
        const resultado = await renombrarPartidaWbs(
          cambio.id,
          cambio.categoria ?? cambio.original.categoria,
          cambio.partida ?? cambio.original.partida
        );
        if (resultado.error) {
          setErrorLote(resultado.error);
          setGuardandoLote(false);
          return;
        }
      }
    }

    const datos = await getWbsPresupuesto(Number(proyectoId));
    setFilas(datos);
    setCambiosPendientes({});
    setModalConfirmarAbierto(false);
    setGuardandoLote(false);
    setVersionCambios((v) => v + 1);
    router.refresh();
  }

  function importado() {
    setModalAbierto(false);
    getWbsPresupuesto(Number(proyectoId)).then(setFilas);
  }

  const cantidadCambiosPendientes = Object.keys(cambiosPendientes).length;
  const cambiosParaModal = useMemo(
    () =>
      Object.values(cambiosPendientes).map((c) => ({
        id: c.id,
        codigo: c.original.codigo,
        categoriaAnterior: c.original.categoria,
        partidaAnterior: c.original.partida,
        presupuestoAnterior: c.original.presupuesto,
        presupuestoNuevo: c.presupuesto,
        categoriaNueva: c.categoria,
        partidaNueva: c.partida,
      })),
    [cambiosPendientes]
  );

  async function descargarPlantilla() {
    const XLSX = await import("xlsx");
    const hoja = XLSX.utils.aoa_to_sheet([
      [
        "Instrucciones: completa Categoria, Partida y Presupuesto por cada subpartida hoja (Codigo es opcional, ej. 1.1.01). Elimina esta fila antes de importar.",
      ],
      ["Codigo", "Categoria", "Partida", "Presupuesto"],
      ["1.1.01", "Preliminares", "Trazo y nivelación", 0],
    ]);
    hoja["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    hoja["!cols"] = [{ wch: 12 }, { wch: 24 }, { wch: 32 }, { wch: 14 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Plantilla WBS");
    XLSX.writeFile(libro, "plantilla-wbs.xlsx");
  }

  const selectClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={proyectoId}
            onChange={(e) => {
              const valor = e.target.value;
              setProyectoId(valor);
              if (valor) setCargando(true);
              else setFilas([]);
            }}
            className={selectClase}
          >
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </select>

          <div className="flex gap-1 rounded-full border border-black/[.08] p-1 dark:border-white/[.145]">
            {[
              { id: "arbol", etiqueta: "Árbol WBS" },
              { id: "dashboard", etiqueta: "Dashboard" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setVista(tab.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  vista === tab.id
                    ? "bg-foreground text-background"
                    : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                }`}
              >
                {tab.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModoEdicion((m) => !m)}
            disabled={vista !== "arbol"}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              modoEdicion
                ? "bg-foreground text-background"
                : "border border-black/[.08] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            }`}
          >
            <Pencil size={15} /> {modoEdicion ? "Salir de Modo Edición" : "Editar Presupuesto"}
          </button>
          <button
            type="button"
            onClick={descargarPlantilla}
            className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            <FileDown size={15} /> Descargar Plantilla Excel
          </button>
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            disabled={!proyectoId}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            <Upload size={15} /> Importar WBS desde Excel
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {cargando ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          Este proyecto no tiene partidas WBS con presupuesto. Impórtalas desde Excel.
        </p>
      ) : vista === "dashboard" ? (
        <DashboardWbs
          arbol={arbol}
          presupuestoTotal={presupuestoTotal}
          ejercidoTotal={ejercidoTotal}
          disponibleTotal={disponibleTotal}
          avancePct={avancePct}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={expandirTodo}
              className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              <ChevronsDown size={13} /> Expandir Todo
            </button>
            <button
              type="button"
              onClick={contraerTodo}
              className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              <ChevronsUp size={13} /> Contraer Todo
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                  <th className="py-3 pr-4 pl-4">
                    <button
                      type="button"
                      onClick={() => cambiarOrden("codigo")}
                      className="flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      Índice / Código <IconoOrden activo={orden.criterio === "codigo"} direccion={orden.direccion} />
                    </button>
                  </th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Partida</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => cambiarOrden("presupuesto")}
                      className="ml-auto flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      Presupuesto <IconoOrden activo={orden.criterio === "presupuesto"} direccion={orden.direccion} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => cambiarOrden("ejercido")}
                      className="ml-auto flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      Ejercido <IconoOrden activo={orden.criterio === "ejercido"} direccion={orden.direccion} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Disponible</th>
                  <th className="px-4 py-3">Activo</th>
                </tr>
              </thead>
              <tbody>
                {arbol.map((raiz) => (
                  <NodoWbs
                    key={`${raiz.id}-v${versionCambios}`}
                    nodo={raiz}
                    nivel={0}
                    expandidos={expandidos}
                    onAlternarExpandido={alternarExpandidoNodo}
                    bloqueado={guardandoLote}
                    versionCambios={versionCambios}
                    renombrandoId={renombrando}
                    onIniciarRenombre={setRenombrando}
                    onCancelarRenombre={() => setRenombrando(null)}
                    onGuardarPresupuesto={marcarPresupuestoPendiente}
                    onGuardarRenombre={marcarRenombrePendiente}
                    modoEdicion={modoEdicion}
                    onVerDesglose={setDesgloseNodo}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalAbierto && (
        <ModalImportarWbs
          proyectoId={Number(proyectoId)}
          onImportado={importado}
          onCerrar={() => setModalAbierto(false)}
        />
      )}

      <ModalDesglosePagosWbs
        wbsId={desgloseNodo?.id ?? null}
        titulo={desgloseNodo ? `${desgloseNodo.codigo ? desgloseNodo.codigo + " · " : ""}${desgloseNodo.partida}` : ""}
        open={desgloseNodo !== null}
        onClose={() => setDesgloseNodo(null)}
      />

      {cantidadCambiosPendientes > 0 && !modalConfirmarAbierto && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-full border border-black/[.08] bg-white px-5 py-3 shadow-lg dark:border-white/[.145] dark:bg-zinc-900">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {cantidadCambiosPendientes} partida{cantidadCambiosPendientes === 1 ? "" : "s"} con cambios sin
              guardar
            </span>
            <button
              type="button"
              onClick={cancelarCambiosPendientes}
              className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            >
              <X size={14} /> Cancelar
            </button>
            <button
              type="button"
              onClick={() => setModalConfirmarAbierto(true)}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              <Save size={14} /> Guardar Cambios
            </button>
          </div>
        </div>
      )}

      {modalConfirmarAbierto && (
        <ModalConfirmarCambiosWbs
          cambios={cambiosParaModal}
          procesando={guardandoLote}
          error={errorLote}
          onConfirmar={confirmarCambiosPendientes}
          onCancelar={() => setModalConfirmarAbierto(false)}
        />
      )}
    </div>
  );
}
