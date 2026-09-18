"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  ClipboardList,
  Building2,
  Users,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ClipboardCheck,
  History,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { SobrePainel } from "./SobrePainel";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  adminOnly?: boolean;
};

export function Sidebar({
  nome,
  cargo,
  isAdmin,
  counts,
}: {
  nome: string;
  cargo?: string | null;
  isAdmin: boolean;
  counts: { acoes: number; pendentesAprovacao: number; novasAcoesPendentes: number; sobreposicoesPendentes?: number };
}) {
  const pathname = usePathname();
  const [colapsada, setColapsada] = useState(false);

  const itens: NavItem[] = [
    { href: "/", label: "Dashboard Gestão", icon: LayoutGrid },
    { href: "/acoes", label: "Ações", icon: ClipboardList, count: counts.acoes },
    { href: "/novas-acoes", label: "Novas Ações", icon: ClipboardCheck, count: counts.novasAcoesPendentes || undefined },
    { href: "/sobreposicoes", label: "Sobreposições", icon: Layers, count: counts.sobreposicoesPendentes || undefined },
    { href: "/orgaos", label: "Órgãos", icon: Building2 },
    { href: "/historico", label: "Histórico", icon: History },
    { href: "/admin", label: "Equipe", icon: Users, count: counts.pendentesAprovacao || undefined, adminOnly: true },
    { href: "/admin", label: "Administração", icon: ShieldCheck, adminOnly: true },
  ];

  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-black/5 bg-surface transition-all duration-200 ${
        colapsada ? "w-[76px]" : "w-64"
      }`}
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-series-1 text-white">
          <RefreshCw size={18} strokeWidth={2.25} />
        </div>
        {!colapsada && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-primary">Monitoramento</p>
            <p className="truncate text-xs text-ink-muted">de Obras</p>
          </div>
        )}
        <SobrePainel />
      </div>

      {!colapsada && (
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-plane p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-series-1/10 text-xs font-semibold text-series-1">
            {iniciais || "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-primary">{nome}</p>
            <p className="truncate text-xs text-ink-muted">{cargo || "Equipe"}</p>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {!colapsada && (
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Menu principal
          </p>
        )}
        {itens
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const ativo = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  ativo
                    ? "bg-series-1 text-white shadow-card"
                    : "text-ink-secondary hover:bg-plane hover:text-ink-primary"
                }`}
                title={colapsada ? item.label : undefined}
              >
                <Icon size={18} strokeWidth={2} />
                {!colapsada && <span className="truncate">{item.label}</span>}
                {!colapsada && item.count ? (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                      ativo ? "bg-white/20 text-white" : "bg-status-warning-bg text-status-warning"
                    }`}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </nav>

      <button
        onClick={() => setColapsada((v) => !v)}
        className="mx-3 mb-4 flex items-center justify-center gap-2 rounded-lg border border-black/5 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-plane hover:text-ink-primary"
      >
        {colapsada ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        {!colapsada && "Recolher"}
      </button>
    </aside>
  );
}
