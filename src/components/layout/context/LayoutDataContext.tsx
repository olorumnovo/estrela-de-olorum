"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type LayoutUser = {
  id: string;
  nome: string;
  email: string;
  foto?: string | null;
  cargo?: string | null;
  roles?: string[];
};

export type LayoutNotification = {
  id: string;
  title: string;
  description: string;
  count: number;
  href: string;
};

type LayoutData = {
  user: LayoutUser | null;
  permissions: string[] | null;
  overdueMembers: number;
  notifications: LayoutNotification[];
  reload: () => Promise<void>;
};

const LayoutDataContext = createContext<LayoutData>({
  user: null,
  permissions: null,
  overdueMembers: 0,
  notifications: [],
  reload: async () => {},
});

export function LayoutDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LayoutData>({
    user: null,
    permissions: null,
    overdueMembers: 0,
    notifications: [],
    reload: async () => {},
  });

  async function load(active = true) {
    try {
      const response = await fetch("/api/layout-summary", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Não autenticado.");
      }

      const payload = await response.json();

      if (!active) {
        return;
      }

      setData({
        user: payload.user
          ? {
              id: payload.user.id,
              nome: payload.user.nome,
              email: payload.user.email,
              foto: payload.user.foto ?? null,
              cargo: payload.user.cargo ?? null,
              roles: Array.isArray(payload.user.roles) ? payload.user.roles : [],
            }
          : null,
        permissions: Array.isArray(payload.user?.permissions)
          ? payload.user.permissions
          : [],
        overdueMembers: Number(payload.counts?.overdueMembers || 0),
        notifications: Array.isArray(payload.notifications)
          ? payload.notifications
          : [],
        reload: async () => {
          await load(true);
        },
      });
    } catch {
      if (active) {
        setData({
          user: null,
          permissions: [],
          overdueMembers: 0,
          notifications: [],
          reload: async () => {
            await load(true);
          },
        });
      }
    }
  }

  useEffect(() => {
    let active = true;

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <LayoutDataContext.Provider value={data}>
      {children}
    </LayoutDataContext.Provider>
  );
}

export function useLayoutData() {
  return useContext(LayoutDataContext);
}
