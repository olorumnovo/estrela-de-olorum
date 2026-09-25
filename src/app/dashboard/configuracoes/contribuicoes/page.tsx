import ContributionsSettingsForm from "./ContributionsSettingsForm";
import SettingsBackButton from "@/components/settings/SettingsBackButton";
import {
  contributionDefaults,
  contributionKeys,
  contributionSettingKey,
} from "@/lib/contributions";
import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

export default async function ContributionsSettingsPage() {
  const user = await requireCurrentUserFromCookies();
  const settings = await prisma.setting.findMany({
    where: {
      templeId: user.templeId,
      chave: {
        in: contributionKeys.map(contributionSettingKey),
      },
    },
  });
  const initialData = Object.fromEntries(
    contributionKeys.map((key) => [
      key,
      settings.find((item) => item.chave === contributionSettingKey(key))?.valor ||
        contributionDefaults[key as keyof typeof contributionDefaults],
    ])
  ) as typeof contributionDefaults;

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div className="space-y-4">
        <SettingsBackButton />
        <h1 className="text-3xl font-bold text-slate-900">
          Contribuições
        </h1>
        <p className="mt-2 text-slate-500">
          Valores, descontos, combos e vencimento usados nas mensalidades.
        </p>
      </div>

      <ContributionsSettingsForm initialData={initialData} />
    </main>
  );
}
