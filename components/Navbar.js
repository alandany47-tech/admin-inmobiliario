"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Landmark, ShieldCheck } from "lucide-react";

const ENLACES = [
  { href: "/solicitud", label: "Solicitudes", icon: FileText },
  { href: "/autorizaciones", label: "Autorizaciones", icon: ShieldCheck },
  { href: "/tesoreria", label: "Tesorería", icon: Landmark, deshabilitado: true },
];

/** Navegación lateral global del sistema DIPZ. */
export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-8 border-r border-black/[.08] bg-white px-5 py-6 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="flex flex-col gap-0.5 px-1">
        <span className="text-xl font-black tracking-tight text-black dark:text-zinc-50">
          DIPZ
        </span>
        <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          REAL ESTATE
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {ENLACES.map(({ href, label, icon: Icon, deshabilitado }) => {
          if (deshabilitado) {
            return (
              <li key={href}>
                <span className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 dark:text-zinc-600">
                  <Icon size={17} />
                  {label}
                  <span className="ml-auto rounded-full bg-black/[.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:bg-white/[.06] dark:text-zinc-600">
                    Próximamente
                  </span>
                </span>
              </li>
            );
          }

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
    </nav>
  );
}
