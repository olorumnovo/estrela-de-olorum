"use client";

import { ReactNode, Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isPdvAllowedDashboardPath, isPdvOnlyRoleSet } from "@/lib/access";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { LayoutDataProvider, useLayoutData } from "./context/LayoutDataContext";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({
  children,
}: AppLayoutProps) {
  return (
    <LayoutDataProvider>
      <PdvRouteGuard>
        <div className="dashboard-theme min-h-screen overflow-x-hidden bg-[#F4F6F8]">

          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>

          <div className="pb-[92px] lg:ml-[270px] lg:pb-0">

            <Topbar />

            <main>
              {children}
            </main>

          </div>

        </div>
      </PdvRouteGuard>
    </LayoutDataProvider>
  );
}

function PdvRouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, permissions } = useLayoutData();
  const isLoadingLayoutData = permissions === null;
  const isPdvOnlyUser = isPdvOnlyRoleSet(user?.roles || []);
  const isBlockedPath =
    isPdvOnlyUser && pathname.startsWith("/dashboard") && !isPdvAllowedDashboardPath(pathname);

  useEffect(() => {
    if (isBlockedPath) {
      router.replace("/dashboard/pdv");
    }
  }, [isBlockedPath, router]);

  if (isLoadingLayoutData || isBlockedPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6F8] text-sm font-semibold text-slate-500">
        Carregando...
      </div>
    );
  }

  return children;
}
