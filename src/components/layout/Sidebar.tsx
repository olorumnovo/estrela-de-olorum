"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  BarChart3,
  Boxes,
  CalendarDays,
  MessageCircleMore,
  ChevronRight,
  CircleDollarSign,
  DollarSign,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Settings,
  Shield,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";

import { useLayoutData } from "./context/LayoutDataContext";

const menu = [
  {
    title: "Inicio",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Agenda",
    href: "/dashboard/agenda",
    icon: CalendarDays,
  },
  {
    title: "Atendimentos",
    href: "/dashboard/atendimentos",
    icon: Users,
  },
  {
    title: "Cadastros",
    href: "/dashboard/membros",
    icon: Users,
  },
  {
    title: "Conversas",
    href: "/dashboard/conversas",
    icon: MessageCircleMore,
  },
  {
    title: "Finanças",
    href: "/dashboard/financeiro",
    icon: DollarSign,
  },
  {
    title: "Cobrança Personalizada",
    href: "/dashboard/cobranca-personalizada",
    icon: FileText,
  },
  {
    title: "Vendas",
    href: "/dashboard/pdv",
    icon: ShoppingCart,
  },
  {
    title: "Administração",
    href: "/dashboard/configuracoes",
    icon: Settings,
  },
] as const;

const pdvOnlyMenu = [
  {
    title: "Vendas PDV",
    href: "/dashboard/pdv",
    icon: ShoppingCart,
  },
  {
    title: "Estoque PDV",
    href: "/dashboard/estoque",
    icon: Boxes,
  },
] as const;

const menuPermissions: Record<string, string> = {
  "/dashboard": "dashboard.visualizar",
  "/dashboard/membros": "membros.visualizar",
  "/dashboard/agenda": "agenda.visualizar",
  "/dashboard/atendimentos": "atendimentos.visualizar",
  "/dashboard/conversas": "atendimentos.visualizar",
  "/dashboard/financeiro": "financeiro.visualizar",
  "/dashboard/cobranca-personalizada": "financeiro.visualizar",
  "/dashboard/pdv": "pdv.visualizar",
  "/dashboard/estoque": "estoque.visualizar",
  "/dashboard/notificacoes": "notificacoes.visualizar",
  "/dashboard/relatorios": "relatorios.visualizar",
  "/dashboard/usuarios": "usuarios.administrar",
  "/dashboard/configuracoes": "configuracoes.administrar",
};

const submenuByHref = {
  "/dashboard/financeiro": {
    title: "Finanças",
    defaultHref: "/dashboard/financeiro?tab=caixa",
    items: [
      {
        id: "caixa",
        label: "Caixa",
        href: "/dashboard/financeiro?tab=caixa",
        icon: WalletCards,
      },
      {
        id: "pagar",
        label: "Contas a Pagar",
        href: "/dashboard/financeiro?tab=pagar",
        icon: CircleDollarSign,
      },
      {
        id: "receber",
        label: "Contas a Receber",
        href: "/dashboard/financeiro?tab=receber",
        icon: HandCoins,
      },
      {
        id: "cobrancas-bancarias",
        label: "Cobranças Bancárias",
        href: "",
        icon: FileText,
        disabled: true,
      },
      {
        id: "relatorios",
        label: "Relatórios",
        href: "/dashboard/relatorios",
        icon: BarChart3,
      },
    ],
  },
  "/dashboard/pdv": {
    title: "Vendas",
    defaultHref: "/dashboard/pdv",
    items: [
      {
        id: "pdv",
        label: "PDV",
        href: "/dashboard/pdv",
        icon: ShoppingCart,
      },
      {
        id: "estoque",
        label: "Estoque",
        href: "/dashboard/estoque",
        icon: Boxes,
      },
    ],
  },
  "/dashboard/configuracoes": {
    title: "Administração",
    defaultHref: "/dashboard/configuracoes",
    items: [
      {
        id: "configuracoes",
        label: "Configurações",
        href: "/dashboard/configuracoes",
        icon: Settings,
      },
      {
        id: "usuarios",
        label: "Usuários",
        href: "/dashboard/usuarios",
        icon: Shield,
      },
    ],
  },
} as const;

type MenuHrefWithSubmenu = keyof typeof submenuByHref;

function isPathActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
}

const mobilePrimaryHrefs = [
  "/dashboard",
  "/dashboard/agenda",
  "/dashboard/membros",
  "/dashboard/conversas",
] as const;

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { permissions, user } = useLayoutData();
  const [open, setOpen] = useState(false);
  const [expandedMenuHref, setExpandedMenuHref] = useState<MenuHrefWithSubmenu | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const activeFinanceTab =
    searchParams.get("tab") === "contas-bancarias"
      ? "caixa"
      : searchParams.get("tab") || "receber";
  function isItemActive(href: string) {
    if (href === "/dashboard/membros") {
      return pathname === "/dashboard/membros";
    }

    if (href === "/dashboard/conversas") {
      return pathname === "/dashboard/conversas";
    }

    if (href === "/dashboard/financeiro") {
      return (
        pathname === "/dashboard/financeiro" &&
        searchParams.get("tab") !== "fornecedores"
      ) || pathname === "/dashboard/relatorios";
    }

    if (href === "/dashboard/pdv") {
      return ["/dashboard/pdv", "/dashboard/estoque"].includes(pathname);
    }

    if (href === "/dashboard/configuracoes") {
      return ["/dashboard/configuracoes", "/dashboard/usuarios"].some((base) =>
        pathname === base || pathname.startsWith(base + "/")
      );
    }

    return isPathActive(pathname, href);
  }

  const userInitials = (user?.nome ?? "Administrador")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  const userRoleLabel =
    user?.cargo?.trim() ||
    (user?.roles?.some((role) => ["Administrador", "Admin"].includes(role))
      ? "Administrador"
      : "Funcionário");
  const isPdvOnlyUser = user?.email?.toLowerCase() === "pdv@startsystem.com.br";

  const activeSubmenu = expandedMenuHref
    ? isPdvOnlyUser
      ? null
      : submenuByHref[expandedMenuHref]
    : null;

  useEffect(() => {
    if (isPdvOnlyUser && expandedMenuHref) {
      setExpandedMenuHref(null);
    }
  }, [expandedMenuHref, isPdvOnlyUser]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!sidebarRef.current || !expandedMenuHref) {
        return;
      }

      if (!sidebarRef.current.contains(event.target as Node)) {
        setExpandedMenuHref(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [expandedMenuHref]);

  const menuSource = isPdvOnlyUser ? pdvOnlyMenu : menu;

  const visibleMenu = menuSource.filter((item) => {
    if (!permissions) {
      return true;
    }

    const requiredPermission = menuPermissions[item.href];

    return (
      !requiredPermission ||
      permissions.includes(requiredPermission) ||
      permissions.includes("administrador.total") ||
      permissions.includes("usuarios.administrar")
    );
  });

  const primaryMenu = visibleMenu;

  const utilityMenu: typeof visibleMenu = [];

  const sidebarWidthClass = activeSubmenu ? "w-[558px]" : "w-[270px]";
  const mobilePrimaryMenu = visibleMenu.filter((item) =>
    mobilePrimaryHrefs.includes(item.href as (typeof mobilePrimaryHrefs)[number])
  );
  const mobileMoreMenu = visibleMenu.filter(
    (item) => !mobilePrimaryHrefs.includes(item.href as (typeof mobilePrimaryHrefs)[number])
  );
  const mobileMoreActive = mobileMoreMenu.some((item) => isItemActive(item.href));

  function isSubItemActive(
    menuHref: MenuHrefWithSubmenu,
    subItem: (typeof submenuByHref)[MenuHrefWithSubmenu]["items"][number]
  ) {
    if (menuHref === "/dashboard/financeiro") {
      if (subItem.id === "relatorios") {
        return pathname === "/dashboard/relatorios";
      }

      return pathname === "/dashboard/financeiro" && activeFinanceTab === subItem.id;
    }

    if (menuHref === "/dashboard/pdv") {
      return subItem.id === "estoque"
        ? pathname === "/dashboard/estoque"
        : pathname === "/dashboard/pdv";
    }

    if (menuHref === "/dashboard/configuracoes") {
      return subItem.href === pathname || pathname.startsWith(subItem.href + "/");
    }

    return false;
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
        />
      )}

      <aside
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-50 hidden ${sidebarWidthClass} max-w-[96vw] p-2.5 text-white transition-all duration-300 lg:flex lg:translate-x-0`}
      >
        <div className="flex w-full overflow-hidden rounded-[24px] border border-white/10 bg-[#1B1C1E] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
          <>
              <div className="flex min-w-0 flex-1 flex-col bg-[#1B1C1E]">
                <div className="border-b border-white/8 px-5 pb-5 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#111216] shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                        <Image
                          src="/logo.png"
                          alt="STAR SYSTEM"
                          width={30}
                          height={30}
                          className="h-7 w-7 object-contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[18px] font-semibold leading-none tracking-[-0.02em] text-white">
                          STAR
                        </p>
                        <p className="mt-1 truncate text-[11px] uppercase tracking-[0.26em] text-white/60">
                          SYSTEM
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
                  <div className="space-y-1.5">
                    {primaryMenu.map((item) => {
                      const Icon = item.icon;
                      const active = isItemActive(item.href);
                      const hasSubmenu = !isPdvOnlyUser && item.href in submenuByHref;
                      const submenuOpen = expandedMenuHref === item.href;

                      return (
                        <div key={item.href} className="space-y-1.5">
                          <Link
                            href={item.href}
                            onClick={(event) => {
                              if (hasSubmenu) {
                                event.preventDefault();

                                if (active && submenuOpen) {
                                  setExpandedMenuHref(null);
                                  setOpen(false);
                                  return;
                                }

                                setExpandedMenuHref(item.href as MenuHrefWithSubmenu);

                                if (!active || !submenuOpen) {
                                  router.push(
                                    submenuByHref[item.href as MenuHrefWithSubmenu]
                                      .defaultHref
                                  );
                                }

                                setOpen(false);
                                return;
                              }

                              setExpandedMenuHref(null);
                              setOpen(false);
                            }}
                            className={`group flex items-center justify-between rounded-xl px-3.5 py-3 text-[15px] transition-all duration-200 ${
                              active
                                ? "bg-[#062A63] text-white shadow-[inset_0_0_0_1px_rgba(77,140,255,0.22)]"
                                : "text-white/62 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                                <Icon
                                  size={18}
                                  className={
                                    active
                                      ? "text-[#7FB3FF]"
                                      : "text-white/45 transition-colors group-hover:text-white"
                                  }
                                />
                              </span>
                              <span className="font-medium tracking-[-0.01em]">
                                {item.title}
                              </span>
                            </div>

                            {hasSubmenu && (
                              <ChevronRight
                                size={16}
                                className={
                                  submenuOpen
                                    ? "rotate-90 text-[#7FB3FF]"
                                    : "text-white/30"
                                }
                              />
                            )}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </nav>

                <div className="border-t border-white/8 px-3 py-4">
                  <div className="space-y-1.5">
                    {utilityMenu.map((item) => {
                      const Icon = item.icon;
                      const active = isItemActive(item.href);

                      return (
                        <Link
                          key={`utility-panel-${item.href}`}
                          href={item.href}
                          onClick={() => {
                            setExpandedMenuHref(null);
                            setOpen(false);
                          }}
                          className={`group flex items-center justify-between rounded-xl px-3.5 py-3 text-[15px] transition-all duration-200 ${
                            active
                              ? "bg-[#062A63] text-white"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                              <Icon
                                size={18}
                                className={
                                  active
                                    ? "text-[#7FB3FF]"
                                    : "text-white/45 transition-colors group-hover:text-white"
                                }
                              />
                            </span>
                            <span className="font-medium">{item.title}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-[#222428] px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-[#0E3A8A] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.18)]">
                        {user?.foto ? (
                          <img
                            src={user.foto}
                            alt={user?.nome ?? "Administrador"}
                            className="h-full w-full object-cover object-center"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-[#EEF3FD] text-sm font-semibold text-[#0E3A8A]">
                            {userInitials}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {user?.nome ?? "Administrador"}
                        </p>
                        <p className="truncate text-xs text-white/45">
                          {userRoleLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#062A63] text-[#7FB3FF]">
                      <LogOut size={16} />
                    </div>
                  </div>
                </div>
              </div>

              {activeSubmenu && (
                <div className="hidden w-[288px] shrink-0 border-l border-white/8 bg-[#18191B] lg:flex lg:flex-col">
                  <div className="border-b border-white/8 px-5 py-5">
                    <p className="text-[28px] font-semibold tracking-[-0.03em] text-white">
                      {activeSubmenu.title}
                    </p>
                  </div>

                  <nav className="sidebar-scroll flex-1 overflow-y-auto px-4 py-4">
                    <div className="space-y-1.5">
                      {activeSubmenu.items.map((subItem) => {
                        const Icon = subItem.icon;
                        if ("disabled" in subItem && subItem.disabled) {
                          return (
                            <div key={subItem.id} aria-disabled="true" className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] text-white/45">
                              <Icon size={18} className="shrink-0" />
                              <span className="min-w-0 flex-1 font-medium">{subItem.label}</span>
                              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300">Em breve</span>
                            </div>
                          );
                        }
                        const subActive =
                          expandedMenuHref === "/dashboard/financeiro"
                            ? subItem.id === "relatorios"
                              ? pathname === "/dashboard/relatorios"
                              : activeFinanceTab === subItem.id
                            : expandedMenuHref === "/dashboard/pdv"
                                    ? subItem.id === "estoque"
                                      ? pathname === "/dashboard/estoque"
                                      : pathname === "/dashboard/pdv"
                                    : expandedMenuHref === "/dashboard/configuracoes"
                                      ? subItem.href === pathname ||
                                        pathname.startsWith(subItem.href + "/")
                              : false;

                        return (
                          <Link
                            key={subItem.id}
                            href={subItem.href}
                            onClick={() => {
                              setExpandedMenuHref(null);
                              setOpen(false);
                            }}
                            className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] transition-all duration-200 ${
                              subActive
                                ? "bg-[#062A63] text-white shadow-[inset_0_0_0_1px_rgba(77,140,255,0.22)]"
                                : "text-white/62 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                              <Icon
                                size={18}
                                className={
                                  subActive
                                    ? "text-[#7FB3FF]"
                                    : "text-white/45 transition-colors group-hover:text-white"
                                }
                              />
                            </span>
                            <span className="font-medium tracking-[-0.01em]">
                              {subItem.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </nav>
                </div>
              )}
          </>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 shadow-[0_-14px_34px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {mobilePrimaryMenu.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item.href);

            return (
              <Link
                key={`mobile-${item.href}`}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition ${
                  active
                    ? "bg-[#EAF1FF] text-[#0E3A8A]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon
                  size={21}
                  strokeWidth={active ? 2.6 : 2.2}
                  className={active ? "text-[#1E63E9]" : "text-slate-500"}
                />
                <span className="max-w-full truncate">{item.title}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition ${
              open || mobileMoreActive
                ? "bg-[#EAF1FF] text-[#0E3A8A]"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <MoreHorizontal
              size={22}
              strokeWidth={open || mobileMoreActive ? 2.6 : 2.2}
              className={open || mobileMoreActive ? "text-[#1E63E9]" : "text-slate-500"}
            />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-x-0 bottom-[82px] z-50 px-3 lg:hidden">
          <div className="mx-auto max-h-[70vh] max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-base font-semibold text-slate-950">Menu</p>
                <p className="text-xs text-slate-500">Acesse módulos e sublinks</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[calc(70vh-73px)] overflow-y-auto p-3">
              <div className="space-y-2">
                {mobileMoreMenu.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.href);
                  const hasSubmenu = !isPdvOnlyUser && item.href in submenuByHref;
                  const submenu = hasSubmenu
                    ? submenuByHref[item.href as MenuHrefWithSubmenu]
                    : null;

                  return (
                    <div
                      key={`mobile-more-${item.href}`}
                      className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70"
                    >
                      <Link
                        href={
                          submenu
                            ? submenu.defaultHref
                            : item.href
                        }
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold transition ${
                          active
                            ? "bg-[#EAF1FF] text-[#0E3A8A]"
                            : "text-slate-700 hover:bg-white"
                        }`}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#1E63E9] shadow-sm">
                          <Icon size={19} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {hasSubmenu ? <ChevronRight size={16} className="text-slate-400" /> : null}
                      </Link>

                      {submenu ? (
                        <div className="grid gap-1 border-t border-slate-100 bg-white p-2">
                          {submenu.items.map((subItem) => {
                            const SubIcon = subItem.icon;
                            if ("disabled" in subItem && subItem.disabled) {
                              return (
                                <div key={`mobile-sub-${subItem.id}`} aria-disabled="true" className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400">
                                  <SubIcon size={17} className="shrink-0" />
                                  <span className="min-w-0 flex-1">{subItem.label}</span>
                                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Em breve</span>
                                </div>
                              );
                            }
                            const subActive = isSubItemActive(
                              item.href as MenuHrefWithSubmenu,
                              subItem
                            );

                            return (
                              <Link
                                key={`mobile-sub-${subItem.id}`}
                                href={subItem.href}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                                  subActive
                                    ? "bg-[#F5E8C8] font-semibold text-[#7A4E00]"
                                    : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <SubIcon size={17} />
                                <span className="truncate">{subItem.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
