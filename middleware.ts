import { NextRequest, NextResponse } from "next/server";

const pdvDashboardPaths = ["/dashboard/pdv", "/dashboard/estoque"];

const pdvApiPrefixes = [
  "/api/auth/logout",
  "/api/auth/me",
  "/api/layout-summary",
  "/api/products",
  "/api/sales",
  "/api/finance/pdv-cash",
  "/api/finance/cash-registers",
  "/api/finance/bank-accounts",
  "/api/finance/cash-ledger",
];

function isAllowedPdvDashboard(pathname: string) {
  return pdvDashboardPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function isAllowedPdvApi(pathname: string) {
  return pdvApiPrefixes.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function middleware(req: NextRequest) {
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isApi = req.nextUrl.pathname.startsWith("/api");
  const acceptsHtml = req.headers.get("accept")?.includes("text/html");
  const isPublicApi =
    req.nextUrl.pathname === "/api/auth/login" ||
    req.nextUrl.pathname === "/api/auth/me" ||
    req.nextUrl.pathname ===
      "/api/webhooks/evolution/financeiro" ||
    req.nextUrl.pathname ===
      "/api/public/member-registration";

  if (!isDashboard && (!isApi || isPublicApi)) {
    return NextResponse.next();
  }

  const hasSession =
    req.cookies.has("sessionToken") || req.cookies.has("userId");

  if (isApi && !hasSession) {
    if (acceptsHtml) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("next", req.nextUrl.pathname);

      return NextResponse.redirect(url);
    }

    return NextResponse.json(
      {
        success: false,
        message: "Não autorizado.",
      },
      {
        status: 401,
      }
    );
  }

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", req.nextUrl.pathname);

    return NextResponse.redirect(url);
  }

  const accessMode = req.cookies.get("accessMode")?.value;

  if (accessMode === "pdv") {
    if (isDashboard && !isAllowedPdvDashboard(req.nextUrl.pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard/pdv";
      url.search = "";

      return NextResponse.redirect(url);
    }

    if (isApi && !isAllowedPdvApi(req.nextUrl.pathname)) {
      if (acceptsHtml) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard/pdv";
        url.search = "";

        return NextResponse.redirect(url);
      }

      return NextResponse.json(
        {
          success: false,
          message: "Acesso restrito ao PDV e Estoque.",
        },
        {
          status: 403,
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
