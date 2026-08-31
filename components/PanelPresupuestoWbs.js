"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, FileDown, Pencil, Upload } from "lucide-react";
import { getWbsPresupuesto, actualizarPresupuestoWbs, renombrarPartidaWbs } from "@/app/actions/wbs";
import { compararCodigoWbsNatural } from "@/lib/wbs";
import ModalImportarWbs from "@/components/ModalImportarWbs";
import ModalDesglosePagosWbs from "@/components/ModalDesglosePagosWbs";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/**
 * Compara dos nodos/grupos agregados según el criterio de orden activo.
 * Para "codigo" usa orden natural (1.2 antes de 1.10) y los códigos ausentes
 * siempre van al final, sin importar la dirección; para presupuesto/ejercido
 * compara los agregados numéricos. `direccion` invierte el resultado salvo en
 * el caso de códigos ausentes (regla ya resuelta por compararCodigoWbsNatural).
 */
function compararNodos(a, b, criterio, direccion) {
  if (criterio === "codigo") {
    const cmp = compararCodigoWbsNatural(a.codigo, b.codigo);
    if (!a.codigo || !b.codigo) return cmp;
    return direccion === "desc" ? -cmp : cmp;
  }
  const valorA = criterio === "presupuesto" ? a.presupuestoAgg : a.ejercidoAgg;
  const valorB = criterio === "presupuesto" ? b.presupuestoAgg : b.ejercidoAgg;
  const cmp = valorA - valorB;
  return direccion === "desc" ? -cmp : cmp;
}

/**
 * Arma el árbol WBS a partir de la lista plana (relación parent_id) y agrupa
 * las raíces por categoría. Cada nodo recibe hijos[] y los totales agregados
 * (presupuestoAgg/ejercidoAgg/disponibleAgg) calculados en el cliente: en un
 * nodo hoja son sus propios valores, en un nodo con hijos son la suma de los
 * agregados de sus hijos. `orden` ({criterio, direccion}) determina el orden
 * jerárquico natural aplicado a hijos, partidas dentro de cada categoría y
 * categorías entre sí.
 */
function construirArbol(filas, orden) {
  const porId = new Map(filas.map((f) => [f.id, { ...f, hijos: [] }]));
  const raices = [];

  porId.forEach((nodo) => {
    if (nodo.parent_id && porId.has(nodo.parent_id)) {
      porId.get(nodo.parent_id).hijos.push(nodo);
    } else {
      raices.push(nodo);
    }
  });

  function agregar(nodo) {
    if (nodo.hijos.length === 0) {
      nodo.presupuestoAgg = Number(nodo.presupuesto);
      nodo.ejercidoAgg = Number(nodo.ejercido);
      nodo.disponibleAgg = Number(nodo.disponible);
      return;
    }
    let presupuestoAgg = 0;
    let ejercidoAgg = 0;
    let disponibleAgg = 0;
    nodo.hijos.forEach((hijo) => {
      agregar(hijo);
      presupuestoAgg += hijo.presupuestoAgg;
      ejercidoAgg += hijo.ejercidoAgg;
      disponibleAgg += hijo.disponibleAgg;
    });
    nodo.presupuestoAgg = presupuestoAgg;
    nodo.ejercidoAgg = ejercidoAgg;
    nodo.disponibleAgg = disponibleAgg;
  }
  raices.forEach(agregar);

  function ordenarHijos(nodo) {
    nodo.hijos.forEach(ordenarHijos);
    nodo.hijos.sort((a, b) => compararNodos(a, b, orden.criterio, orden.direccion));
  }
  raices.forEach(ordenarHijos);

  const grupos = new Map();
  raices.forEach((nodo) => {
    const categoria = nodo.categoria || "Sin categoría";
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria).push(nodo);
  });

  const hojas = [...porId.values()].filter((nodo) => nodo.hijos.length === 0);

  const arbol = [...grupos.entries()].map(([categoria, nodos]) => {
    nodos.sort((a, b) => compararNodos(a, b, orden.criterio, orden.direccion));
    return {
      categoria,
      nodos,
      presupuestoAgg: nodos.reduce((s, n) => s + n.presupuestoAgg, 0),
      ejercidoAgg: nodos.reduce((s, n) => s + n.ejercidoAgg, 0),
      disponibleAgg: nodos.reduce((s, n) => s + n.disponibleAgg, 0),
    };
  });

  arbol.sort((g1, g2) =>
    orden.criterio === "codigo"
      ? compararNodos(g1.nodos[0] ?? {}, g2.nodos[0] ?? {}, orden.criterio, orden.direccion)
      : compararNodos(g1, g2, orden.criterio, orden.direccion)
  );

  return { arbol, hojas };
}

function NodoWbs({
  nodo,
  nivel,
  expandidos,
  onAlternarExpandido,
  guardandoMap,
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
  const guardando = !!guardandoMap[nodo.id];
  const [presupuesto, setPresupuesto] = useState(nodo.presupuesto);
  const [categoria, setCategoria] = useState(nodo.categoria);
  const [partida, setPartida] = useState(nodo.partida);

  const inputMontoClase =
    "w-28 rounded border border-black/[.08] bg-transparent px-2 py-1 text-sm text-right dark:border-white/[.145]";
  const inputTextoClase =
    "rounded border border-black/[.08] bg-transparent px-2 py-1 text-sm dark:border-white/[.145]";

  return (
    <>
      <tr className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
        <td className="py-2 pr-4 pl-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {nodo.codigo || "—"}
        </td>
        <td className="py-2 pr-4" style={{ paddingLeft: `${nivel * 1.25}rem` }}>
          <div className="flex items-center gap-1.5">
            {!esHoja && (
              <button
                type="button"
                onClick={() => onAlternarExpandido(nodo.id)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
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
              disabled={guardando}
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
          <button
            type="button"
            onClick={() => onVerDesglose(nodo)}
            className="hover:underline"
          >
            {formatoMXN(esHoja ? nodo.ejercido : nodo.ejercidoAgg)}
          </button>
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
            key={hijo.id}
            nodo={hijo}
            nivel={nivel + 1}
            expandidos={expandidos}
            onAlternarExpandido={onAlternarExpandido}
            guardandoMap={guardandoMap}
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

/** Dashboard visual del proyecto: KPIs globales y barras de avance por categoría. */
function DashboardWbs({ arbol, presupuestoTotal, ejercidoTotal, disponibleTotal, avancePct }) {
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
          Avance por Categoría
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
              return (
                <div
                  key={grupo.categoria}
                  className="flex flex-col gap-1.5 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-black dark:text-zinc-50">{grupo.categoria}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {formatoMXN(grupo.ejercidoAgg)} / {formatoMXN(grupo.presupuestoAgg)} ({pct.toFixed(0)}
                      %)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
                    <div
                      className={`h-full ${color}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
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
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ? String(proyectos[0].id) : "");
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState({});
  const [renombrando, setRenombrando] = useState(null);
  const [vista, setVista] = useState("arbol");
  const [expandidos, setExpandidos] = useState(new Set());
  const [modoEdicion, setModoEdicion] = useState(false);
  const [desgloseNodo, setDesgloseNodo] = useState(null);
  const [orden, setOrden] = useState({ criterio: "codigo", direccion: "asc" });

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
        setExpandidos(new Set());
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  const { arbol, hojas } = useMemo(() => construirArbol(filas, orden), [filas, orden]);

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

  function alternarExpandidoCategoria(categoria) {
    const clave = `cat:${categoria}`;
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  function alternarExpandidoNodo(id) {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

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
          <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={selectClase}>
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
              {arbol.map((grupo) => {
                const claveGrupo = `cat:${grupo.categoria}`;
                const expandidoGrupo = expandidos.has(claveGrupo);
                return (
                  <Fragment key={claveGrupo}>
                    <tr className="border-b border-black/[.08] bg-black/[.02] dark:border-white/[.145] dark:bg-white/[.03]">
                      <td className="px-4 py-2.5" />
                      <td colSpan={2} className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => alternarExpandidoCategoria(grupo.categoria)}
                          className="flex items-center gap-1.5 font-medium text-black dark:text-zinc-50"
                        >
                          {expandidoGrupo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {grupo.categoria}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {formatoMXN(grupo.presupuestoAgg)}
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatoMXN(grupo.ejercidoAgg)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {formatoMXN(grupo.disponibleAgg)}
                      </td>
                      <td className="px-4 py-2.5" />
                    </tr>
                    {expandidoGrupo &&
                      grupo.nodos.map((nodo) => (
                        <NodoWbs
                          key={nodo.id}
                          nodo={nodo}
                          nivel={1}
                          expandidos={expandidos}
                          onAlternarExpandido={alternarExpandidoNodo}
                          guardandoMap={guardando}
                          renombrandoId={renombrando}
                          onIniciarRenombre={setRenombrando}
                          onCancelarRenombre={() => setRenombrando(null)}
                          onGuardarPresupuesto={guardarPresupuesto}
                          onGuardarRenombre={guardarRenombre}
                          modoEdicion={modoEdicion}
                          onVerDesglose={setDesgloseNodo}
                        />
                      ))}
                  </Fragment>
                );
              })}
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

      <ModalDesglosePagosWbs
        wbsId={desgloseNodo?.id ?? null}
        titulo={desgloseNodo ? `${desgloseNodo.codigo ? desgloseNodo.codigo + " · " : ""}${desgloseNodo.partida}` : ""}
        open={desgloseNodo !== null}
        onClose={() => setDesgloseNodo(null)}
      />
    </div>
  );
}
