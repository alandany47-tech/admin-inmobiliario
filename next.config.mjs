/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default de Next.js es 1MB; el Cotizador sube fotos/renders de unidades
      // (bucket "cotizaciones-libres" en Supabase, tope 25MB — ver migración 0030).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
