/**
 * Genera y descarga una plantilla .xlsx con las cabeceras exactas que espera
 * el parser del modal de importación correspondiente (una sola fila de
 * encabezados, sin datos de ejemplo, para no confundir con un registro real).
 */
export async function descargarPlantillaExcel(nombreArchivo, columnas) {
  const XLSX = await import("xlsx");
  const hoja = XLSX.utils.aoa_to_sheet([columnas]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Plantilla");
  XLSX.writeFile(libro, nombreArchivo);
}
