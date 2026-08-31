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
    partes.unshift(actual.partida);
    actual = actual.parent_id ? porId.get(actual.parent_id) : null;
  }

  return `${nodo.categoria} > ${partes.join(" > ")}`;
}
