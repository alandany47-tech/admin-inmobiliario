import { notFound } from "next/navigation";
import { getSolicitudPorId } from "@/app/actions/solicitudes";
import SolicitudPagoPDF from "@/components/SolicitudPagoPDF";

/** Vista de detalle e impresión de una solicitud de pago en formato DIPZ. */
export default async function SolicitudPdfPage({ params }) {
  const { id } = await params;
  const solicitud = await getSolicitudPorId(id);

  if (!solicitud) notFound();

  return <SolicitudPagoPDF solicitud={solicitud} />;
}
