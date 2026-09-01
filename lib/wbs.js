// Utilidades de formato para el catálogo WBS, compartidas entre Server
// Actions y componentes cliente. Los datos importados por Excel traen el
// código WBS pegado como sufijo del texto de la partida (ej. "Colado de
// Concreto (1.2.1)") en vez de la columna `codigo`, que hoy sigue sin
// backfill. Este parseo es puramente de lectura/visualización: no modifica
// la fila en la base de datos, solo corrige lo que se muestra.
const SUFIJO_CODIGO_RE = /\s*\(([\d]+(?:\.[\d]+)+)\)\s*$/;

/**
 * A partir de una fila { partida, codigo }, regresa el código efectivo
 * (columna `codigo` si ya existe, o el extraído del sufijo de `partida`) y el
 * texto de partida sin el sufijo residual.
 */
export function normalizarPartidaWbs(partida, codigo) {
  const texto = partida ?? "";
  const match = texto.match(SUFIJO_CODIGO_RE);

  if (codigo) {
    return { codigo, partida: match ? texto.replace(SUFIJO_CODIGO_RE, "").trim() : texto };
  }
  if (match) {
    return { codigo: match[1], partida: texto.replace(SUFIJO_CODIGO_RE, "").trim() };
  }
  return { codigo: null, partida: texto };
}

/**
 * Comparador de orden ascendente natural para códigos WBS tipo "1.10.2" vs
 * "1.2.9": usa Intl (`localeCompare` con `numeric: true`) para comparar cada
 * corrida de dígitos como número en vez de como texto, para que 1.2 quede
 * antes de 1.10 (orden lexicográfico ingenuo fallaría ahí). Los códigos
 * ausentes (null) siempre se consideran "mayores" que cualquier código real,
 * sin importar la dirección de orden (asc/desc) que aplique el llamador
 * sobre el resultado.
 */
export function compararCodigoWbsNatural(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Arma la ruta jerárquica "Categoría > Partida > Subpartida" de un nodo hasta
 * su raíz, siguiendo `parent_id`. `porId` es un Map<id, fila> del catálogo
 * completo (ya normalizado con normalizarPartidaWbs).
 */
export function construirRutaWbs(nodo, porId) {
  const partes = [];
  let actual = nodo;
  const visitados = new Set();

  while (actual && !visitados.has(actual.id)) {
    visitados.add(actual.id);
    partes.unshift(actual.codigo ? `${actual.codigo} - ${actual.partida}` : actual.partida);
    actual = actual.parent_id ? porId.get(actual.parent_id) : null;
  }

  return `${nodo.categoria} > ${partes.join(" > ")}`;
}

/**
 * Código padre implícito de un código con puntos (ej. "1.1.2" -> "1.1",
 * "1" -> null). Se usa solo como respaldo cuando el catálogo no trae
 * `parent_id` explícito en ninguna fila.
 */
function codigoPadreInferido(codigo) {
  if (!codigo) return null;
  const partes = codigo.split(".");
  if (partes.length <= 1) return null;
  return partes.slice(0, -1).join(".");
}

/**
 * Orden de negocio (no alfabético) de las categorías Nivel 1 de un desarrollo
 * inmobiliario típico, confirmado con el usuario: fases cronológicas del
 * proyecto, de la adquisición del terreno al postventa/imprevistos. Se usa
 * solo como respaldo cuando el catálogo no trae `parent_id` ni `codigo` de
 * puntos (caso real de los 500+ renglones importados desde Excel, donde la
 * única jerarquía disponible es el texto repetido de `categoria`). Una
 * categoría que no aparezca en esta lista (ej. de un proyecto futuro con
 * otra taxonomía) simplemente queda al final, ordenada alfabéticamente.
 */
const ORDEN_CATEGORIAS_WBS = [
  "Terreno",
  "Softwares, licencias y equipos",
  "Estudios",
  "Proyecto legal, contable y financiero",
  "Gestorías,trámites, permisos y aportaciones",
  "Diseño e Ingenierías",
  "Marketing",
  "Comercialización",
  "Gerencia de Obra",
  "Gastos post venta",
  "Administración, promoción y desarrollo",
  "Construcción",
  "Costo financiero",
  "Imprevistos",
];

function prioridadCategoriaWbs(categoria) {
  const indice = ORDEN_CATEGORIAS_WBS.indexOf(categoria);
  return indice === -1 ? ORDEN_CATEGORIAS_WBS.length : indice;
}

/**
 * Compara dos nodos/grupos agregados según el criterio de orden activo. Para
 * "codigo" usa el código jerárquico ya asignado por posición (ver
 * `construirArbol`) con orden natural (1.2 antes de 1.10); para
 * presupuesto/ejercido compara los agregados numéricos. `direccion` invierte
 * el resultado.
 */
function compararNodos(a, b, criterio, direccion) {
  if (criterio === "codigo") {
    const cmp = compararCodigoWbsNatural(a.codigoJerarquico, b.codigoJerarquico);
    return direccion === "desc" ? -cmp : cmp;
  }
  const valorA = criterio === "presupuesto" ? a.presupuestoAgg : a.ejercidoAgg;
  const valorB = criterio === "presupuesto" ? b.presupuestoAgg : b.ejercidoAgg;
  const cmp = valorA - valorB;
  return direccion === "desc" ? -cmp : cmp;
}

/**
 * Arma el árbol WBS a partir de la lista plana del catálogo, agrupando de
 * forma estricta en niveles:
 *   - Nivel 1 (partida raíz): numerado con entero secuencial ("1", "2"...).
 *     Ej. una raíz de texto "TERRENO" se muestra como "1. TERRENO".
 *   - Nivel 2 (subpartidas): "1.1", "1.2"...
 *   - Nivel 3+ (hojas de gasto): "1.1.1", "1.1.2"...
 * Soporta tres formas de traer la jerarquía desde la BD, probadas en orden:
 *   1. `parent_id` explícito en alguna fila del catálogo.
 *   2. Sin `parent_id`, pero con `codigo` de puntos (ej. "1.1.1" cuelga de
 *      "1.1", que a su vez cuelga de "1").
 *   3. Catálogo plano (caso real de las 500+ partidas importadas desde
 *      Excel): ninguna fila trae `parent_id` ni `codigo` de puntos, solo el
 *      texto repetido de `categoria` y `partida` en cada renglón (sin una
 *      columna de subpartida propia). Se arman dos niveles virtuales — no
 *      existe una fila propia en `wbs_catalog` para la categoría ni para la
 *      partida madre —: Nivel 1 por `categoria` (ordenado por
 *      `ORDEN_CATEGORIAS_WBS`, no alfabético) y Nivel 2 por `partida`
 *      (agrupa las filas que comparten el mismo texto de partida dentro de
 *      esa categoría, ej. varias filas "Alberca" con distinto monto); las
 *      filas reales del catálogo quedan como hojas de Nivel 3.
 * El número mostrado (`codigoJerarquico`) siempre se recalcula por posición
 * estructural, sin importar el código importado ni el criterio de orden
 * visual elegido por el usuario — así la numeración queda consecutiva y sin
 * huecos.
 *
 * Cada nodo recibe `hijos[]` y los totales agregados
 * (presupuestoAgg/ejercidoAgg/disponibleAgg): en una hoja son sus propios
 * valores, en un nodo con hijos son la suma de los agregados de sus hijos.
 * `orden` ({criterio, direccion}) determina solo el orden de despliegue de
 * hijos y raíces entre sí; no afecta la numeración jerárquica.
 */
export function construirArbol(filas, orden) {
  const porId = new Map(filas.map((f) => [f.id, { ...f, hijos: [] }]));
  const tieneParentIdExplicito = filas.some((f) => f.parent_id);
  const tieneCodigoDePuntos = filas.some((f) => f.codigo && f.codigo.includes("."));

  const raices = [];
  if (tieneParentIdExplicito) {
    porId.forEach((nodo) => {
      if (nodo.parent_id && porId.has(nodo.parent_id)) {
        porId.get(nodo.parent_id).hijos.push(nodo);
      } else {
        raices.push(nodo);
      }
    });
  } else if (tieneCodigoDePuntos) {
    const porCodigo = new Map();
    porId.forEach((nodo) => {
      if (nodo.codigo) porCodigo.set(nodo.codigo, nodo);
    });
    porId.forEach((nodo) => {
      const padre = porCodigo.get(codigoPadreInferido(nodo.codigo));
      if (padre) {
        padre.hijos.push(nodo);
      } else {
        raices.push(nodo);
      }
    });
  } else {
    const raicesPorCategoria = new Map();
    const partidasMadrePorCategoria = new Map();

    porId.forEach((nodo) => {
      const categoria = nodo.categoria || "Sin categoría";
      const partidaMadre = nodo.partida || "Sin partida";

      if (!raicesPorCategoria.has(categoria)) {
        const raizVirtual = {
          id: `cat:${categoria}`,
          esVirtual: true,
          esRaizCategoria: true,
          categoria,
          partida: categoria,
          codigo: null,
          hijos: [],
        };
        raicesPorCategoria.set(categoria, raizVirtual);
        partidasMadrePorCategoria.set(categoria, new Map());
        raices.push(raizVirtual);
      }

      const partidasMadre = partidasMadrePorCategoria.get(categoria);
      if (!partidasMadre.has(partidaMadre)) {
        const nodoPartidaMadre = {
          id: `cat:${categoria}|partida:${partidaMadre}`,
          esVirtual: true,
          esPartidaMadre: true,
          categoria,
          partida: partidaMadre,
          codigo: null,
          hijos: [],
        };
        partidasMadre.set(partidaMadre, nodoPartidaMadre);
        raicesPorCategoria.get(categoria).hijos.push(nodoPartidaMadre);
      }
      partidasMadre.get(partidaMadre).hijos.push(nodo);
    });
  }

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

  // Orden estructural fijo para que la numeración jerárquica quede estable
  // sin importar el criterio de orden visual que el usuario elija después en
  // la tabla:
  //   - Raíces de categoría (Nivel 1 virtual): por ORDEN_CATEGORIAS_WBS.
  //   - Partidas madre (Nivel 2 virtual): alfabético por su propio texto (no
  //     por `categoria`, que es igual para todas las partidas madre de una
  //     misma raíz y no serviría para distinguirlas).
  //   - Filas reales: natural por código original; si no hay código, por
  //     categoría y luego por id.
  function ordenEstructural(a, b) {
    if (a.esRaizCategoria || b.esRaizCategoria) {
      return (
        prioridadCategoriaWbs(a.categoria) - prioridadCategoriaWbs(b.categoria) ||
        a.categoria.localeCompare(b.categoria, "es")
      );
    }
    if (a.esPartidaMadre || b.esPartidaMadre) {
      return (a.partida || "").localeCompare(b.partida || "", "es");
    }
    if (a.codigo || b.codigo) return compararCodigoWbsNatural(a.codigo, b.codigo);
    if (a.categoria !== b.categoria) return (a.categoria || "").localeCompare(b.categoria || "", "es");
    return (typeof a.id === "number" && typeof b.id === "number" ? a.id - b.id : 0);
  }
  function ordenarEstructura(nodo) {
    nodo.hijos.sort(ordenEstructural);
    nodo.hijos.forEach(ordenarEstructura);
  }
  raices.sort(ordenEstructural);
  raices.forEach(ordenarEstructura);

  function numerar(nodo, codigoJerarquico) {
    nodo.codigoJerarquico = codigoJerarquico;
    nodo.hijos.forEach((hijo, i) => numerar(hijo, `${codigoJerarquico}.${i + 1}`));
  }
  raices.forEach((nodo, i) => numerar(nodo, String(i + 1)));

  // Orden visual controlado por el usuario (encabezados de la tabla): se
  // aplica después de fijar la numeración jerárquica, sin modificarla.
  function ordenarVisual(nodo) {
    nodo.hijos.forEach(ordenarVisual);
    nodo.hijos.sort((a, b) => compararNodos(a, b, orden.criterio, orden.direccion));
  }
  raices.forEach(ordenarVisual);
  raices.sort((a, b) => compararNodos(a, b, orden.criterio, orden.direccion));

  const hojas = [...porId.values()].filter((nodo) => nodo.hijos.length === 0);

  return { arbol: raices, hojas };
}
