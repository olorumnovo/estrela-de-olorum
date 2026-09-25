import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentBasicUserFromTokens } from "./auth";

export async function requireCurrentUserFromCookies() {
  const cookieStore = await cookies();
  const user = await getCurrentBasicUserFromTokens(
    cookieStore.get("sessionToken")?.value,
    cookieStore.get("userId")?.value
  );

  if (!user) {
    redirect("/");
  }

  return user;
}
