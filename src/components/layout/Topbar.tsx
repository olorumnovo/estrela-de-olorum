"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Moon,
  Sun,
  LogOut,
  Menu,
  UserRound,
  Search,
  X,
} from "lucide-react";

import { useLayoutData } from "./context/LayoutDataContext";
import { useTheme } from "next-themes";

export default function Topbar() {
  const { user, notifications } = useLayoutData();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const themeReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] =
    useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);

  const visibleNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        const allowed = [
          "Contas vencendo hoje",
          "Contas vencidas no mês",
          "Recebimentos vencendo hoje",
          "Recebimentos vencidos no mês",
          "Mensalistas atrasados",
          "Mensalidades recebidas",
          "Novos cadastros de membros",
        ].includes(notification.title);

        return (
          allowed &&
          notification.count > 0 &&
          !dismissedNotifications.includes(notificationKey(notification))
        );
      }),
    [dismissedNotifications, notifications]
  );

  const notificationsBadge = visibleNotifications.filter(
    (notification) => notification.count > 0
  ).length;

  const initials = useMemo(
    () =>
      (user?.nome || "Administrador")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join(""),
    [user?.nome]
  );

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/";
    }
  }

  function notificationKey(notification: {
    id: string;
    count: number;
    description: string;
  }) {
    return `${notification.id}:${notification.count}:${notification.description}`;
  }

  function dismissNotification(notification: {
    id: string;
    count: number;
    description: string;
  }) {
    const key = notificationKey(notification);
    setDismissedNotifications((current) => {
      const next = Array.from(new Set([...current, key]));
      window.localStorage.setItem(
        "estrela.dismissedNotifications",
        JSON.stringify(next)
      );
      return next;
    });
  }

  function openNotification(href: string) {
    setNotificationsOpen(false);
    router.push(href);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("estrela.dismissedNotifications");
        const parsed = saved ? JSON.parse(saved) : [];
        setDismissedNotifications(Array.isArray(parsed) ? parsed : []);
      } catch {
        setDismissedNotifications([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <header className="flex min-h-[82px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F6F7F9] px-4 py-3 sm:px-5 lg:h-[116px] lg:flex-nowrap lg:px-8 lg:py-4">

      {/* Esquerda */}

      <div className="flex min-w-0 items-center gap-4 lg:gap-8">
        <button
          type="button"
          className="hidden h-11 w-11 items-center justify-center rounded-full text-slate-900 lg:flex"
        >
          <Menu size={31} />
        </button>

        <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2 text-[19px] font-semibold leading-tight tracking-[-0.02em] text-slate-950 sm:text-[24px] xl:text-[30px]">

          <span className="truncate">Bem-vindo, {user?.nome ?? "Administrador"}</span>

          <span className="text-[24px] text-[#FF6A3D]">
            ✡
          </span>

        </h1>

        <p className="mt-1 text-[12px] text-slate-500 sm:text-[14px] lg:mt-3 lg:text-[15px]">
          Que a luz de Olorum esteja sempre conosco!
        </p>
        </div>

      </div>

      {/* Direita */}

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-4">

        <div className="relative hidden md:block">

          <Search
            size={18}
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            type="text"
            placeholder="Buscar algo..."
            className="h-12 w-[220px] rounded-full border border-slate-200 bg-white pl-12 pr-5 text-[15px] outline-none transition focus:border-[#0E3A8A] xl:h-[62px] xl:w-[380px] xl:text-[16px]"
          />

        </div>

        <button
          type="button"
          aria-label={themeReady && resolvedTheme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          title={themeReady && resolvedTheme === "dark" ? "Modo claro" : "Modo escuro"}
          aria-pressed={themeReady && resolvedTheme === "dark"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex h-12 w-12 items-center justify-center rounded-full text-slate-800 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 xl:h-[58px] xl:w-[58px]"
        >
          {themeReady && resolvedTheme === "dark" ? <Sun size={25} /> : <Moon size={25} />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setNotificationsOpen(
                !notificationsOpen
              )
            }
            className="relative flex h-12 w-12 items-center justify-center rounded-full transition hover:bg-slate-100 xl:h-[58px] xl:w-[58px]"
          >
            <Bell size={26} />

            {notificationsBadge > 0 && (
            <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#1E63E9] text-xs font-bold text-white">

              {notificationsBadge}

            </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="fixed inset-x-3 top-[76px] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">
                  Notificações
                </p>
                {visibleNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      visibleNotifications.forEach(dismissNotification);
                    }}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#1E63E9] transition hover:bg-[#E7F0FF]"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {visibleNotifications.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-500">
                    Nenhuma notificação no momento.
                  </p>
                ) : (
                  visibleNotifications.map(
                    (notification) => (
                      <div
                        key={notification.id}
                        className="group flex border-b border-slate-100 transition hover:bg-slate-50"
                      >
                        <button
                          type="button"
                          onClick={() => openNotification(notification.href)}
                          className="flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-4 text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {notification.title}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {notification.description}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#E7F0FF] px-2.5 py-1 text-xs font-bold text-[#1E63E9]">
                            {notification.count}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissNotification(notification)}
                          title="Apagar notificação"
                          className="flex w-10 shrink-0 items-center justify-center text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative">

          <button
            onClick={() => setOpen(!open)}
            className="group flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-[3px] border-[#0E3A8A] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-[#1C4FB4] hover:shadow-[0_2px_8px_rgba(15,23,42,0.10)] xl:h-[60px] xl:w-[60px]"
          >
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white">
              {user?.foto ? (
                <img
                  src={user.foto}
                  alt={user.nome}
                  className="h-full w-full object-cover object-center transition duration-200 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-[#EEF3FD] text-sm font-semibold text-slate-700">
                  {initials || <UserRound size={27} className="text-slate-600" />}
                </span>
              )}
            </span>

          </button>

          {open && (

            <div className="fixed inset-x-3 top-[76px] z-50 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-64">
              <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#0E3A8A] bg-white p-[1px] shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
                    {user?.foto ? (
                      <img
                        src={user.foto}
                        alt={user.nome}
                        className="h-full w-full rounded-full object-cover object-center"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#F8FAFC] to-[#E8EEF9] text-sm font-semibold text-slate-700">
                        {initials || <UserRound size={18} className="text-slate-600" />}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{user?.nome ?? "Administrador"}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{user?.email ?? ""}</p>
                  </div>
                </div>
              </div>

              <Link
                href="/dashboard/meu-perfil"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-slate-700 transition hover:bg-slate-50"
              >
                <UserRound size={18} />
                <span>Meu Perfil</span>
              </Link>

              <button
                onClick={logout}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-red-600 transition hover:bg-red-50"
              >

                <LogOut size={18} />

                <span>Sair</span>

              </button>

            </div>

          )}

        </div>

      </div>

    </header>
  );
}
