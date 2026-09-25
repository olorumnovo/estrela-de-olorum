export const PDV_ALLOWED_DASHBOARD_PATHS = ["/dashboard/pdv", "/dashboard/estoque"];

function normalizeRole(role: string | null | undefined) {
  return (role || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function isPdvOnlyRoleSet(roles: Array<string | null | undefined>) {
  const normalizedRoles = roles.map(normalizeRole).filter(Boolean);

  if (!normalizedRoles.includes("pdv")) {
    return false;
  }

  return !normalizedRoles.some((role) =>
    ["administrador", "admin"].includes(role)
  );
}

export function isPdvAllowedDashboardPath(pathname: string) {
  return PDV_ALLOWED_DASHBOARD_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}
