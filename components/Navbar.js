"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Building2,
  FileText,
  HandCoins,
  Home,
  Landmark,
  LayoutDashboard,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Table,
  TrendingUp,
  Users,
  Users2,
  Wallet,
} from "lucide-react";

const ENLACES = [
  { href: "/dashboard", label: "Dashboard", icon: TrendingUp },
  { href: "/proyectos", label: "Proyectos", icon: Building2 },
  { href: "/unidades", label: "Unidades", icon: Home },
  { href: "/solicitud", label: "Solicitudes", icon: FileText },
  { href: "/autorizaciones", label: "Autorizaciones", icon: ShieldCheck },
  { href: "/tesoreria", label: "Tesorería", icon: Landmark },
  { href: "/cobranza/clientes", label: "Cartera de Clientes", icon: Users2 },
  { href: "/cobranza/pagos", label: "Captura de Pagos", icon: HandCoins },
  { href: "/proveedores", label: "Proveedores", icon: Users },
  { href: "/control-maestro", label: "Control Maestro", icon: LayoutDashboard },
  { href: "/wbs", label: "Presupuesto WBS", icon: Wallet },
  { href: "/historial", label: "Historial", icon: Table },
  { href: "/configuracion/plantillas", label: "Plantillas PDF", icon: Settings },
];

/** Navegación lateral global del sistema DIPZ. */
export default function Navbar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  // Excepción necesaria: solo así se evita el desfase de hidratación entre
  // el render del servidor (sin tema resuelto) y el del cliente.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMontado(true), []);

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-8 border-r border-black/[.08] bg-white px-5 py-6 dark:border-white/[.145] dark:bg-zinc-900">
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

      <ul className="flex flex-col gap-1">
        {ENLACES.map(({ href, label, icon: Icon }) => {
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

      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
      >
        {montado && resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        {montado ? (resolvedTheme === "dark" ? "Modo Claro" : "Modo Oscuro") : "Tema"}
      </button>
    </nav>
  );
}
