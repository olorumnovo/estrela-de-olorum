import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import LookupForm from "@/components/lookups/LookupForm";
import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarCategoriaFinanceiraPage({
  params,
}: Props) {
  const { id } = await params;
  const user = await requireCurrentUserFromCookies();
  const item = await prisma.financialCategory.findFirst({
    where: {
      id,
      templeId: user.templeId,
      deletedAt: null,
    },
  });

  if (!item) {
    return (
      <main className="space-y-6 p-4 sm:p-6 lg:p-7">
        <h1 className="text-3xl font-bold">
          Categoria não encontrada
        </h1>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div>
        <Link
          href="/dashboard/configuracoes/categorias-financeiras"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold">
          Editar Categoria Financeira
        </h1>
      </div>

      <LookupForm
        id={item.id}
        nome={item.nome}
        ativo={item.ativo}
        title="Editar Categoria Financeira"
        api="/api/finance/categories"
        backUrl="/dashboard/configuracoes/categorias-financeiras"
      />
    </main>
  );
}
