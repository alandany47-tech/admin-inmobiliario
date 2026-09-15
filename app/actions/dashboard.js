"use server";

import { createClient } from "@/lib/supabase/server";

/** Datos crudos de solicitudes para el cálculo de KPIs ejecutivos. */
export async function getSolicitudesDashboard() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_pago")
    .select("id, total, estado, metodo_pago, wbs_categoria, fecha_pago, proyectos(codigo, nombre)");

  if (error) {
    console.error("Error al consultar datos del dashboard:", error.message);
    return [];
  }

  return data;
}

/**
 * Resumen financiero por proyecto para el dashboard: presupuesto/ejercido de
 * WBS (de `wbs_presupuesto_resumen`, ya trae ejercido calculado incluyendo
 * reparto corporativo) y contratado/cobrado de cartera de clientes (de
 * `vista_cartera_clientes`, un renglón por contrato) — el cruce que hoy no
 * existe en ningún panel: cuánto se ha cobrado a clientes vs. cuánto se ha
 * gastado del presupuesto WBS de ese mismo proyecto. Contratos Cancelados se
 * excluyen del contratado/cobrado (no representan venta real).
 */
export async function getResumenFinancieroPorProyecto() {
  const supabase = await createClient();

  const [
    { data: proyectos, error: errorProyectos },
    { data: wbsFilas, error: errorWbs },
    { data: cartera, error: errorCartera },
    { data: ordenes, error: errorOrdenes },
  ] = await Promise.all([
    supabase.from("proyectos").select("id, codigo, nombre").order("codigo", { ascending: true }),
    supabase.from("wbs_presupuesto_resumen").select("proyecto_id, presupuesto, ejercido"),
    supabase
      .from("vista_cartera_clientes")
      .select("proyecto_id, monto_total_venta, total_pagado, estado_contrato"),
    supabase.from("wbs_ordenes_cambio").select("id, wbs_catalog(proyecto_id)").eq("estado", "Por Autorizar"),
  ]);

  const error = errorProyectos || errorWbs || errorCartera || errorOrdenes;
  if (error) {
    console.error("Error al consultar el resumen financiero por proyecto:", error.message);
    return [];
  }

  const wbsPorProyecto = new Map();
  (wbsFilas ?? []).forEach((f) => {
    const acc = wbsPorProyecto.get(f.proyecto_id) ?? { presupuesto: 0, ejercido: 0 };
    acc.presupuesto += Number(f.presupuesto);
    acc.ejercido += Number(f.ejercido);
    wbsPorProyecto.set(f.proyecto_id, acc);
  });

  const carteraPorProyecto = new Map();
  (cartera ?? [])
    .filter((c) => c.estado_contrato !== "Cancelado")
    .forEach((c) => {
      const acc = carteraPorProyecto.get(c.proyecto_id) ?? { contratado: 0, cobrado: 0 };
      acc.contratado += Number(c.monto_total_venta);
      acc.cobrado += Number(c.total_pagado);
      carteraPorProyecto.set(c.proyecto_id, acc);
    });

  const ordenesPorProyecto = new Map();
  (ordenes ?? []).forEach((o) => {
    const pid = o.wbs_catalog?.proyecto_id;
    if (pid == null) return;
    ordenesPorProyecto.set(pid, (ordenesPorProyecto.get(pid) ?? 0) + 1);
  });

  return (proyectos ?? []).map((p) => {
    const wbs = wbsPorProyecto.get(p.id) ?? { presupuesto: 0, ejercido: 0 };
    const venta = carteraPorProyecto.get(p.id) ?? { contratado: 0, cobrado: 0 };
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      presupuestoWbs: wbs.presupuesto,
      ejercidoWbs: wbs.ejercido,
      disponibleWbs: wbs.presupuesto - wbs.ejercido,
      contratado: venta.contratado,
      cobrado: venta.cobrado,
      porCobrar: venta.contratado - venta.cobrado,
      ordenesPendientes: ordenesPorProyecto.get(p.id) ?? 0,
    };
  });
}
