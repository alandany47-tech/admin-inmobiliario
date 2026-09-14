"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Building2,
  Calculator,
  ChevronRight,
  FileText,
  HandCoins,
  Home,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Table,
  TrendingUp,
  Upload,
  Users,
  Users2,
  Wallet,
} from "lucide-react";
import { cerrarSesion } from "@/app/actions/auth";

/**
 * Menú agrupado por secciones (cada sección se oculta sola si ninguno de sus
 * ítems queda visible). Un ítem puede declarar `roles: [...]` para limitarse
 * a esos roles (hoy solo "Roles y Accesos", exclusivo ADMIN) o `modulo: "..."`
 * para requerir al menos nivel `lectura` en ese módulo vía `permisos_usuario`
 * (ver migración 0038) — ADMIN siempre ve todo. Los ítems sin `roles` ni
 * `modulo` (Dashboard, Historial) quedan visibles a cualquier rol
 * autenticado: son vistas agregadas cuyo contenido ya se acota solo por RLS.
 */
const SECCIONES = [
  {
    id: "principal",
    nombre: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: TrendingUp },
      { href: "/historial", label: "Historial", icon: Table },
    ],
  },
  {
    id: "proyectos",
    nombre: "Proyectos y Ventas",
    items: [
      { href: "/proyectos", label: "Proyectos", icon: Building2, modulo: "PROYECTOS" },
      { href: "/unidades", label: "Unidades", icon: Home, modulo: "UNIDADES" },
      { href: "/cotizaciones", label: "Cotizador", icon: Calculator, modulo: "COTIZADOR" },
    ],
  },
  {
    id: "cobranza",
    nombre: "Cobranza",
    items: [
      { href: "/cobranza/clientes", label: "Cartera de Clientes", icon: Users2, modulo: "COBRANZA" },
      { href: "/cobranza/pagos", label: "Captura de Pagos", icon: HandCoins, modulo: "COBRANZA" },
    ],
  },
  {
    id: "tesoreria",
    nombre: "Tesorería",
    items: [
      { href: "/solicitud", label: "Solicitudes", icon: FileText, modulo: "SOLICITUDES" },
      { href: "/autorizaciones", label: "Autorizaciones", icon: ShieldCheck, modulo: "SOLICITUDES" },
      { href: "/tesoreria", label: "Tesorería", icon: Landmark, modulo: "TESORERIA" },
      { href: "/control-maestro", label: "Control Maestro", icon: LayoutDashboard, modulo: "TESORERIA" },
      { href: "/wbs", label: "Presupuesto WBS", icon: Wallet, modulo: "WBS" },
      { href: "/proveedores", label: "Proveedores", icon: Users, modulo: "PROVEEDORES" },
    ],
  },
  {
    id: "configuracion",
    nombre: "Configuración",
    items: [
      { href: "/configuracion/plantillas", label: "Plantillas PDF", icon: Settings, modulo: "CONFIGURACION" },
      { href: "/configuracion/importar-historico", label: "Importar Histórico", icon: Upload, modulo: "CONFIGURACION" },
      { href: "/configuracion/permisos", label: "Roles y Accesos", icon: KeyRound, roles: ["ADMIN"] },
    ],
  },
];

const NOMBRES_ROL = {
  SOLICITANTE: "Solicitante",
  APROBADOR: "Aprobador",
  TESORERIA: "Tesorería",
  ADMIN: "Administrador",
};

function iniciales(nombre) {
  const partes = (nombre || "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Navegación lateral global del sistema DIPZ, agrupada por secciones. */
export default function Navbar({ perfil, permisos = [] }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  const esAdmin = perfil?.rol === "ADMIN";
  const modulosConAcceso = new Set(
    permisos.filter((p) => p.nivel !== "sin_acceso").map((p) => p.modulo)
  );

  function visible(item) {
    if (item.roles) return item.roles.includes(perfil?.rol);
    if (!item.modulo) return true;
    return esAdmin || modulosConAcceso.has(item.modulo);
  }

  const secciones = SECCIONES.map((s) => ({
    ...s,
    items: s.items.filter(visible),
  })).filter((s) => s.items.length > 0);

  // Excepción necesaria: solo así se evita el desfase de hidratación entre
  // el render del servidor (sin tema resuelto) y el del cliente.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMontado(true), []);

  return (
    <nav className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-black/[.08] bg-white px-5 py-6 dark:border-white/[.145] dark:bg-zinc-900">
      <div className="flex flex-col gap-1.5 rounded-lg bg-zinc-900 px-3 py-3">
        <Image
          src="/logo.png"
          alt="DPZ"
          width={2600}
          height={1248}
          priority
          className="h-8 w-auto self-start"
        />
        <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-400">
          THE FUTURE OF REAL ESTATE
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {secciones.map((seccion) => (
          <div key={seccion.id} className="flex flex-col gap-1">
            <span className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
              {seccion.nombre}
            </span>
            <ul className="flex flex-col gap-1">
              {seccion.items.map(({ href, label, icon: Icon }) => {
                const activo = pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        activo
                          ? "bg-foreground text-background"
                          : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                      }`}
                    >
                      <Icon size={17} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
        >
          {montado && resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          {montado ? (resolvedTheme === "dark" ? "Modo Claro" : "Modo Oscuro") : "Tema"}
        </button>

        {perfil && (
          <div className="flex items-center gap-1.5 border-t border-black/[.08] pt-3 dark:border-white/[.145]">
            <Link
              href="/perfil"
              className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              {perfil.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={perfil.foto_url}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-black/[.08] dark:ring-white/[.145]"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {iniciales(perfil.nombre)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{perfil.nombre}</p>
                <p className="truncate text-xs text-zinc-500">
                  {NOMBRES_ROL[perfil.rol] ?? perfil.rol}
                  {perfil.puesto ? ` · ${perfil.puesto}` : ""}
                </p>
              </div>
              <ChevronRight
                size={15}
                className="shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
            <button
              type="button"
              onClick={() => cerrarSesion()}
              title="Cerrar sesión"
              className="shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-zinc-800 dark:hover:bg-white/[.06] dark:hover:text-zinc-200"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
