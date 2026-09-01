/**
 * Bloque de encabezado con logo DIPZ (Desarrolladora) + logo del Proyecto,
 * para el lado izquierdo del encabezado de un PDF (el caller sigue armando
 * el bloque del título a la derecha, en el mismo `flex justify-between`).
 * Presentacional puro (sin fetch): `configDipz` viene de
 * `getConfiguracionPlantilla`, `proyecto` de `getContratosVenta`/
 * `getProyectosBranding` (columnas `logo_proyecto_url`/`nombre`). Si
 * `proyecto` no trae logo (cotización libre, o proyecto sin branding
 * cargado) solo se muestra el logo DIPZ. Colores literales, no utilidades de
 * paleta Tailwind: html2canvas no soporta lab()/oklch() (ver nota en
 * SolicitudPagoPDF.js).
 */
export default function EncabezadoDualLogo({ configDipz, proyecto }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col">
        {configDipz?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={configDipz.logo_url} alt="Logo" className="h-10 w-auto object-contain" crossOrigin="anonymous" />
        ) : (
          <span className="text-3xl font-black tracking-tight">{configDipz?.encabezado_linea1 || "DIPZ"}</span>
        )}
        <span className="text-[10px] font-semibold tracking-[0.2em] text-[#52525c]">
          {configDipz?.encabezado_linea2 || "THE FUTURE OF REAL ESTATE"}
        </span>
      </div>

      {proyecto?.logo_proyecto_url && (
        <>
          <div className="h-8 w-px bg-[rgba(0,0,0,0.2)]" />
          <div className="flex flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proyecto.logo_proyecto_url}
              alt={proyecto.nombre || "Proyecto"}
              className="h-10 w-auto object-contain"
              crossOrigin="anonymous"
            />
            {proyecto.nombre && (
              <span className="text-[10px] font-semibold tracking-[0.15em] text-[#52525c]">{proyecto.nombre}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
