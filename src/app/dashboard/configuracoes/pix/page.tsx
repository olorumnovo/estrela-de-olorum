import PixSettingsForm from "./PixSettingsForm";
import SettingsBackButton from "@/components/settings/SettingsBackButton";
import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

export default async function PixSettingsPage() {
  const user = await requireCurrentUserFromCookies();
  const settings = await prisma.setting.findMany({
    where: {
      templeId: user.templeId,
      chave: {
        in: ["pix_key", "pix_name", "pix_bank"],
      },
    },
  });

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div className="space-y-4">
        <SettingsBackButton />
        <h1 className="text-3xl font-bold text-slate-900">
          Configuração PIX
        </h1>
        <p className="mt-2 text-slate-500">
          Dados usados nas mensagens de cobrança dos mensalistas atrasados.
        </p>
      </div>

      <PixSettingsForm
        initialData={{
          pixKey:
            settings.find((item) => item.chave === "pix_key")
              ?.valor || "",
          pixName:
            settings.find((item) => item.chave === "pix_name")
              ?.valor || "",
          pixBank:
            settings.find((item) => item.chave === "pix_bank")
              ?.valor || "",
        }}
      />
    </main>
  );
}
