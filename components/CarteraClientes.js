"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Home, Pencil, Search, Upload } from "lucide-react";
import { getCarteraClientes } from "@/app/actions/cobranza";
import ModalDesglosePagosCliente from "@/components/ModalDesglosePagosCliente";
import ModalEditarCliente from "@/components/ModalEditarCliente";
import ModalWizardSeparacion from "@/components/ModalWizardSeparacion";
import ModalImportarClientes from "@/components/ModalImportarClientes";

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

/** Directorio de clientes y cartera: venta acumulada, cobrado, saldo pendiente, días de mora y asignación directa de unidades. */
export default function CarteraClientes({ clientes: clientesIniciales, proyectos }) {
  const [proyectoFiltro, setProyectoFiltro] = useState("");
  const [clientes, setClientes] = useState(clientesIniciales);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const [detalle, setDetalle] = useState(null);
  const [editando, setEditando] = useState(null);
  const [asignando, setAsignando] = useState(null);
  const [modalImportar, setModalImportar] = useState(false);

  useEffect(() => {
    if (!proyectoFiltro) return;
    let vigente = true;
    getCarteraClientes(Number(proyectoFiltro)).then((data) => {
      if (vigente) {
        setClientes(data);
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoFiltro]);

  function cambiarProyectoFiltro(valor) {
    setProyectoFiltro(valor);
    if (valor) setCargando(true);
    else setClientes(clientesIniciales);
  }

  async function recargar() {
    setCargando(true);
    const data = await getCarteraClientes(proyectoFiltro ? Number(proyectoFiltro) : undefined);
    setClientes(data);
    setCargando(false);
  }

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(termino) ||
        (c.rfc ?? "").toLowerCase().includes(termino) ||
        (c.email ?? "").toLowerCase().includes(termino)
    );
  }, [clientes, busqueda]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={proyectoFiltro}
            onChange={(e) => cambiarProyectoFiltro(e.target.value)}
            className={inputClase}
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Busca por nombre, RFC o email…"
              className={`${inputClase} w-64 pl-8`}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalImportar(true)}
          className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
        >
          <Upload size={15} /> Importar Excel
        </button>
      </div>

      {cargando ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
      ) : clientesFiltrados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          No hay clientes que coincidan con el filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-black/[.08] bg-black/[.03] text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-400">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Contratos</th>
                <th className="px-4 py-3 text-right">Venta Total</th>
                <th className="px-4 py-3 text-right">Cobrado</th>
                <th className="px-4 py-3 text-right">Saldo Pendiente</th>
                <th className="px-4 py-3 text-right">Días de Mora</th>
                <th className="px-4 py-3">Estatus</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => (
                <tr key={c.id} className="border-b border-black/[.08] last:border-b-0 dark:border-white/[.145]">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-black dark:text-zinc-50">{c.nombre}</span>
                      {c.rfc && <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{c.rfc}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{c.cantidadContratos}</td>
                  <td className="px-4 py-3 text-right">{formatoMXN(c.ventaTotal)}</td>
                  <td className="px-4 py-3 text-right">{formatoMXN(c.cobrado)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatoMXN(c.saldoPendiente)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.diasMora > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                        {c.diasMora} días
                      </span>
                    ) : c.cantidadContratos > 0 ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                        Al día
                      </span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.estadoSeparacion ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.estadoSeparacion.diasRestantes <= 0
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                        }`}
                      >
                        Apartada {c.estadoSeparacion.codigoUnidad}
                        {c.estadoSeparacion.diasRestantes <= 0
                          ? " (vencida)"
                          : ` (${c.estadoSeparacion.diasRestantes}d)`}
                      </span>
                    ) : c.cantidadContratos > 0 ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                        Vendida / Firmado
                      </span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-600">Sin unidad</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditando(c)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        <Pencil size={13} /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setAsignando(c)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        <Home size={13} /> Asignar Unidad
                      </button>
                      {c.cantidadContratos > 0 && (
                        <button
                          type="button"
                          onClick={() => setDetalle(c)}
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                        >
                          <Eye size={13} /> Ver Detalle
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDesglosePagosCliente
        clienteId={detalle?.id ?? null}
        titulo={detalle?.nombre ?? ""}
        open={detalle !== null}
        onClose={() => setDetalle(null)}
      />

      {editando && (
        <ModalEditarCliente
          cliente={editando}
          onGuardado={(clienteActualizado) => {
            setClientes((filas) =>
              filas.map((f) =>
                f.id === clienteActualizado.id
                  ? {
                      ...f,
                      nombre: clienteActualizado.nombre,
                      rfc: clienteActualizado.rfc,
                      telefono: clienteActualizado.telefono,
                      email: clienteActualizado.email,
                      direccion: clienteActualizado.direccion,
                      contactoSecundario: clienteActualizado.contacto_secundario,
                      notas: clienteActualizado.notas,
                    }
                  : f
              )
            );
            setEditando(null);
          }}
          onCerrar={() => setEditando(null)}
        />
      )}

      {asignando && (
        <ModalWizardSeparacion
          proyectos={proyectos}
          clientes={clientes}
          clientePreset={asignando}
          onCompletado={() => {
            setAsignando(null);
            recargar();
          }}
          onCerrar={() => setAsignando(null)}
        />
      )}

      {modalImportar && (
        <ModalImportarClientes
          onImportado={() => {
            setModalImportar(false);
            recargar();
          }}
          onCerrar={() => setModalImportar(false)}
        />
      )}
    </div>
  );
}
