import LookupTable from "@/components/lookups/LookupTable";
import SettingsBackButton from "@/components/settings/SettingsBackButton";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export default async function CategoriasFinanceirasPage() {
  const user = await requireCurrentUserFromCookies();
  const items = await prisma.financialCategory.findMany({
    where: {
      templeId: user.templeId,
      deletedAt: null,
    },
    orderBy: {
      nome: "asc",
    },
  });

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div className="space-y-4">
        <SettingsBackButton />
        <h1 className="text-3xl font-bold text-slate-900">
          Categorias Financeiras
        </h1>

        <p className="mt-2 text-slate-500">
          Categorias usadas em receitas e despesas.
        </p>
      </div>

      <LookupTable
        title="Categorias Financeiras"
        description="Categorias disponíveis no cadastro financeiro."
        baseUrl="/dashboard/configuracoes/categorias-financeiras"
        api="/api/finance/categories"
        buttonLabel="Nova Categoria"
        items={items}
      />
    </main>
  );
}
