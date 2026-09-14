/**
 * Bloque de encabezado con logo de empresa + logo del Proyecto, para el lado
 * izquierdo del encabezado de un PDF (el caller sigue armando el bloque del
 * título a la derecha, en el mismo `flex justify-between`). Presentacional
 * puro (sin fetch): `logoEmpresaUrl` viene de `getConfiguracionEmpresa`
 * (columna `logo_empresa_url`, global a toda la empresa) y es el logo
 * principal — si no hay logo de empresa cargado, cae al texto de
 * `configDipz.encabezado_linea1`/`encabezado_linea2` (de
 * `getConfiguracionPlantilla`, solo se muestran como fallback de texto
 * cuando no hay logo de empresa cargado — un logo real ya trae su propia
 * marca, no se le pega una leyenda de texto debajo). `proyecto` viene de
 * `getContratosVenta`/`getProyectosBranding` (columna `logo_proyecto_url`,
 * `nombre` solo para el `alt`); si `proyecto` no trae logo (cotización
 * libre, o proyecto sin branding cargado) solo se muestra el bloque de
 * empresa. No se le pega el nombre del proyecto como leyenda debajo: el
 * logo ya lo dice, sería redundante. Ambos logos comparten la misma caja
 * de tamaño fijo (`LogoCaja`, exportado para que el logo compacto de
 * PlantillaCotizacion.js/PlantillaEstadoCuenta.js use la misma medida):
 * antes solo se limitaba el ancho máximo del `<img>` con `w-auto`, lo que
 * dejaba que un logo muy ancho (proporción panorámica) redujera también su
 * propia altura para respetarlo, viéndose chico/apretado junto al otro
 * logo. Con una caja de tamaño fijo (alto y ancho) y `object-contain`
 * adentro, cualquier logo ocupa el mismo espacio visual sin importar su
 * proporción original. Colores literales, no utilidades de paleta
 * Tailwind: html2canvas no soporta lab()/oklch() (ver nota en
 * SolicitudPagoPDF.js).
 */
export function LogoCaja({ src, alt }) {
  return (
    <div className="flex h-10 w-[120px] items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" crossOrigin="anonymous" />
    </div>
  );
}

export default function EncabezadoDualLogo({ configDipz, proyecto, logoEmpresaUrl }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col">
        {logoEmpresaUrl ? (
          <LogoCaja src={logoEmpresaUrl} alt="Logo" />
        ) : (
          <>
            <span className="text-3xl font-black tracking-tight">{configDipz?.encabezado_linea1 || "DIPZ"}</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-[#52525c]">
              {configDipz?.encabezado_linea2 || "THE FUTURE OF REAL ESTATE"}
            </span>
          </>
        )}
      </div>

      {proyecto?.logo_proyecto_url && (
        <>
          <div className="h-8 w-px bg-[rgba(0,0,0,0.2)]" />
          <LogoCaja src={proyecto.logo_proyecto_url} alt={proyecto.nombre || "Proyecto"} />
        </>
      )}
    </div>
  );
}
