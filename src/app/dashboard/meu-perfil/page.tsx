import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import ProfileForm from "./ProfileForm";
import PasswordSettingsForm from "../configuracoes/senha/PasswordSettingsForm";

async function getCurrentUser() {
  const cookieStore = await cookies();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export default async function MeuPerfilPage() {
  const payload = await getCurrentUser();

  if (!payload?.authenticated || !payload?.user) {
    redirect("/");
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Meu Perfil</h1>
        <p className="mt-2 text-slate-500">
          Atualize seus dados pessoais, foto e senha.
        </p>
      </div>

      <ProfileForm
        initialName={payload.user.nome}
        initialEmail={payload.user.email}
        initialPhoto={payload.user.foto}
      />

      <PasswordSettingsForm />
    </main>
  );
}
