"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Plus, Upload, X } from "lucide-react";
import {
  getUnidades,
  crearUnidad,
  actualizarUnidad,
  liberarUnidadVencida,
  subirImagenUnidad,
} from "@/app/actions/unidades";
import { getClientes } from "@/app/actions/clientes";
import ModalImportarUnidades from "@/components/ModalImportarUnidades";
import ModalWizardSeparacion from "@/components/ModalWizardSeparacion";

const TIPOS_USO = ["DEPARTAMENTO", "OFICINA", "LOCAL", "BODEGA", "OTRO"];
const ESQUEMAS = ["TRADICIONAL", "INVERSIONISTA"];

const FORM_VACIO = {
  codigoUnidad: "",
  superficieM2: "",
  tipoUso: "DEPARTAMENTO",
  precioM2: "",
  montoLista: "",
  esquemaUnidad: "TRADICIONAL",
};

const ESTILO_ESTATUS = {
  "SIN ASIGNAR":
    "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
  APARTADA:
    "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  VENDIDA:
    "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40",
};

const BADGE_ESTATUS = {
  "SIN ASIGNAR": "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  APARTADA: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  VENDIDA: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};

function formatoMXN(valor) {
  return Number(valor ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function redondear(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

const inputClase =
  "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";
const labelClase = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** Panel de unidades: grid por estatus, alta/edición de specs, importación masiva y flujo de venta. */
export default function PanelUnidades({ proyectos }) {
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ? String(proyectos[0].id) : "");
  const [unidades, setUnidades] = useState([]);
  const [cargando, setCargando] = useState(Boolean(proyectoId));
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState("");

  const [modalForm, setModalForm] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardandoForm, setGuardandoForm] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);

  const [detalle, setDetalle] = useState(null);
  const [procesandoEstatusId, setProcesandoEstatusId] = useState(null);
  const [subiendoImagenId, setSubiendoImagenId] = useState(null);

  const [venta, setVenta] = useState(null);

  useEffect(() => {
    getClientes().then(setClientes);
  }, []);

  useEffect(() => {
    if (!proyectoId) return;
    let vigente = true;
    getUnidades(Number(proyectoId)).then((data) => {
      if (vigente) {
        setUnidades(data);
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  function abrirNuevaUnidad() {
    setModalForm("nuevo");
    setForm(FORM_VACIO);
    setError("");
  }

  function abrirEdicionUnidad(u) {
    setModalForm(u);
    setForm({
      codigoUnidad: u.codigo_unidad,
      superficieM2: String(u.superficie_m2),
      tipoUso: u.tipo_uso,
      precioM2: String(u.precio_m2),
      montoLista: String(u.monto_lista),
      esquemaUnidad: u.esquema_unidad,
    });
    setDetalle(null);
    setError("");
  }

  function actualizarSuperficie(valor) {
    setForm((f) => {
      const superficie = parseFloat(valor) || 0;
      const precio = parseFloat(f.precioM2) || 0;
      return { ...f, superficieM2: valor, montoLista: String(redondear(superficie * precio)) };
    });
  }

  function actualizarPrecioM2(valor) {
    setForm((f) => {
      const precio = parseFloat(valor) || 0;
      const superficie = parseFloat(f.superficieM2) || 0;
      return { ...f, precioM2: valor, montoLista: String(redondear(superficie * precio)) };
    });
  }

  function actualizarMontoLista(valor) {
    setForm((f) => {
      const monto = parseFloat(valor) || 0;
      const superficie = parseFloat(f.superficieM2) || 0;
      return {
        ...f,
        montoLista: valor,
        precioM2: superficie > 0 ? String(redondear(monto / superficie)) : f.precioM2,
      };
    });
  }

  async function guardarUnidad(e) {
    e.preventDefault();
    setError("");
    if (!form.codigoUnidad.trim()) {
      setError("Captura el código de unidad.");
      return;
    }

    setGuardandoForm(true);
    const esNuevo = modalForm === "nuevo";
    const resultado = esNuevo
      ? await crearUnidad({ proyectoId: Number(proyectoId), ...form })
      : await actualizarUnidad(modalForm.id, form);
    setGuardandoForm(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setUnidades((filas) =>
      esNuevo
        ? [...filas, resultado.unidad].sort((a, b) => a.codigo_unidad.localeCompare(b.codigo_unidad, "es"))
        : filas.map((f) => (f.id === resultado.unidad.id ? resultado.unidad : f))
    );
    setModalForm(null);
  }

  async function recargarUnidades() {
    if (!proyectoId) return;
    const data = await getUnidades(Number(proyectoId));
    setUnidades(data);
  }

  function abrirVenta(unidad) {
    setVenta(unidad);
    setDetalle(null);
  }

  async function subirImagen(unidad, archivo) {
    if (!archivo) return;
    setSubiendoImagenId(unidad.id);
    setError("");
    const formData = new FormData();
    formData.append("archivo", archivo);
    const resultado = await subirImagenUnidad(unidad.id, unidad.proyecto_id, formData);
    setSubiendoImagenId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setUnidades((filas) => filas.map((f) => (f.id === unidad.id ? { ...f, imagen_url: resultado.url } : f)));
    setDetalle((d) => (d && d.id === unidad.id ? { ...d, imagen_url: resultado.url } : d));
  }

  async function liberarVencida(unidad) {
    setProcesandoEstatusId(unidad.id);
    setError("");
    const resultado = await liberarUnidadVencida(unidad.id);
    setProcesandoEstatusId(null);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    await recargarUnidades();
    setDetalle(null);
  }

  function diasRestantesSeparacion(unidad) {
    const contrato = unidad.contrato_activo;
    if (!contrato || contrato.contrato_firmado) return null;
    return Math.ceil((new Date(contrato.fecha_limite_apartado) - new Date()) / 86400000);
  }

  const selectClase =
    "rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={proyectoId}
          onChange={(e) => {
            const valor = e.target.value;
            setProyectoId(valor);
            if (valor) setCargando(true);
            else setUnidades([]);
          }}
          className={selectClase}
        >
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} — {p.nombre}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalImportar(true)}
            disabled={!proyectoId}
            className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
          >
            <Upload size={15} /> Importar Excel
          </button>
          <button
            type="button"
            onClick={abrirNuevaUnidad}
            disabled={!proyectoId}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            <Plus size={15} /> Nueva Unidad
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {cargando ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
      ) : unidades.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          Este proyecto no tiene unidades registradas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {unidades.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setDetalle(u)}
              className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:brightness-95 dark:hover:brightness-110 ${ESTILO_ESTATUS[u.estatus] ?? ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-black dark:text-zinc-50">{u.codigo_unidad}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_ESTATUS[u.estatus] ?? ""}`}>
                  {u.estatus}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{u.tipo_uso}</span>
                {u.esquema_unidad === "INVERSIONISTA" && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                    Inversionista
                  </span>
                )}
              </div>
              {u.estatus === "APARTADA" && diasRestantesSeparacion(u) != null && (
                <span
                  className={`text-[11px] font-medium ${
                    diasRestantesSeparacion(u) <= 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {diasRestantesSeparacion(u) <= 0
                    ? "Separación vencida"
                    : `${diasRestantesSeparacion(u)} días restantes de separación`}
                </span>
              )}
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span>{Number(u.superficie_m2).toLocaleString("es-MX")} m²</span>
                <span className="font-medium text-black dark:text-zinc-50">{formatoMXN(u.monto_lista)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal crear/editar specs de unidad */}
      {modalForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={guardarUnidad}
            className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                {modalForm === "nuevo" ? "Nueva Unidad" : "Editar Unidad"}
              </h3>
              <button
                type="button"
                onClick={() => setModalForm(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Código de Unidad</label>
              <input
                type="text"
                className={inputClase}
                value={form.codigoUnidad}
                onChange={(e) => setForm((f) => ({ ...f, codigoUnidad: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Superficie (m²)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={form.superficieM2}
                  onChange={(e) => actualizarSuperficie(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Tipo de Uso</label>
                <select
                  className={inputClase}
                  value={form.tipoUso}
                  onChange={(e) => setForm((f) => ({ ...f, tipoUso: e.target.value }))}
                >
                  {TIPOS_USO.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Precio por m²</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={form.precioM2}
                  onChange={(e) => actualizarPrecioM2(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClase}>Monto de Lista</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClase}
                  value={form.montoLista}
                  onChange={(e) => actualizarMontoLista(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Monto de Lista = Superficie × Precio por m². Editar cualquiera de los tres recalcula los
              otros dos automáticamente.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className={labelClase}>Esquema</label>
              <select
                className={inputClase}
                value={form.esquemaUnidad}
                onChange={(e) => setForm((f) => ({ ...f, esquemaUnidad: e.target.value }))}
              >
                {ESQUEMAS.map((es) => (
                  <option key={es} value={es}>
                    {es.charAt(0) + es.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalForm(null)}
                disabled={guardandoForm}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoForm}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {guardandoForm ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de detalle/acciones de la unidad */}
      {detalle && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">{detalle.codigo_unidad}</h3>
              <button
                type="button"
                onClick={() => setDetalle(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {detalle.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detalle.imagen_url} alt={detalle.codigo_unidad} className="h-16 w-24 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-black/[.16] text-[10px] text-zinc-400 dark:border-white/[.2]">
                  Sin imagen
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]">
                <ImagePlus size={14} />
                {subiendoImagenId === detalle.id ? "Subiendo…" : detalle.imagen_url ? "Cambiar foto/render" : "Subir foto/render"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={subiendoImagenId === detalle.id}
                  onChange={(e) => subirImagen(detalle, e.target.files?.[0])}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Estatus</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_ESTATUS[detalle.estatus] ?? ""}`}>
                  {detalle.estatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Tipo de Uso</span>
                <span>{detalle.tipo_uso}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Superficie</span>
                <span>{Number(detalle.superficie_m2).toLocaleString("es-MX")} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Precio por m²</span>
                <span>{formatoMXN(detalle.precio_m2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Monto de Lista</span>
                <span className="font-medium">{formatoMXN(detalle.monto_lista)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Esquema</span>
                <span>{detalle.esquema_unidad === "INVERSIONISTA" ? "Inversionista" : "Tradicional"}</span>
              </div>
              {detalle.estatus === "APARTADA" && diasRestantesSeparacion(detalle) != null && (
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Separación</span>
                  <span className={diasRestantesSeparacion(detalle) <= 0 ? "text-red-600 dark:text-red-400" : ""}>
                    {diasRestantesSeparacion(detalle) <= 0
                      ? "Vencida"
                      : `${diasRestantesSeparacion(detalle)} días restantes`}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => abrirEdicionUnidad(detalle)}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                Editar Specs
              </button>

              {detalle.estatus === "APARTADA" && diasRestantesSeparacion(detalle) != null && diasRestantesSeparacion(detalle) <= 0 && (
                <button
                  type="button"
                  disabled={procesandoEstatusId === detalle.id}
                  onClick={() => liberarVencida(detalle)}
                  className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Liberar Unidad (Separación Vencida)
                </button>
              )}

              {detalle.estatus === "SIN ASIGNAR" && (
                <button
                  type="button"
                  onClick={() => abrirVenta(detalle)}
                  className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                >
                  Apartar / Asignar Cliente
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {venta && (
        <ModalWizardSeparacion
          proyectos={proyectos}
          clientes={clientes}
          unidadPreset={venta}
          onClienteCreado={(c) => setClientes((prev) => [...prev, c])}
          onCompletado={() => {
            setVenta(null);
            recargarUnidades();
          }}
          onCerrar={() => setVenta(null)}
        />
      )}

      {modalImportar && (
        <ModalImportarUnidades
          proyectoId={Number(proyectoId)}
          onImportado={() => {
            setModalImportar(false);
            recargarUnidades();
          }}
          onCerrar={() => setModalImportar(false)}
        />
      )}
    </div>
  );
}
