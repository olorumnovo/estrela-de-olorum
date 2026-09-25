import TransactionCreateView from "@/components/finance/TransactionCreateView";
import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

export default async function NovaContaAPagarPage() {
  const user = await requireCurrentUserFromCookies();
  const categories = await prisma.financialCategory.findMany({
    where: {
      templeId: user.templeId,
      ativo: true,
      deletedAt: null,
    },
    orderBy: {
      nome: "asc",
    },
    select: {
      id: true,
      nome: true,
    },
  });

  return <TransactionCreateView type="EXPENSE" categories={categories} />;
}
