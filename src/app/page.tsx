import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import LoginPage from "@/components/auth/LoginPage";
import { isPdvOnlyRoleSet } from "@/lib/access";
import { getCurrentUserFromTokens } from "@/lib/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  const user = await getCurrentUserFromTokens(
    cookieStore.get("sessionToken")?.value,
    cookieStore.get("userId")?.value
  );

  if (user) {
    const roleNames = user.userRoles.map((item) => item.role.nome);

    if (
      cookieStore.get("accessMode")?.value === "pdv" ||
      isPdvOnlyRoleSet(roleNames)
    ) {
      redirect("/dashboard/pdv");
    }

    redirect("/dashboard");
  }

  return <LoginPage />;
}
