import { notFound } from "next/navigation";

import TransactionDetailView from "@/components/finance/TransactionDetailView";
import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

function serializeTransaction<T extends Record<string, unknown>>(record: T) {
  return JSON.parse(
    JSON.stringify(record, (_key, value) => {
      if (
        value &&
        typeof value === "object" &&
        "toNumber" in value &&
        typeof value.toNumber === "function"
      ) {
        return value.toNumber();
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      return value;
    })
  );
}

export default async function TransactionDetailPage({ params }: Props) {
  const user = await requireCurrentUserFromCookies();
  const { id } = await params;

  const transaction = await prisma.financialTransaction.findFirst({
    where: {
      id,
      templeId: user.templeId,
      deletedAt: null,
    },
    include: {
      category: {
        select: {
          nome: true,
        },
      },
    },
  });

  if (!transaction) {
    notFound();
  }

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

  return (
    <TransactionDetailView
      transaction={serializeTransaction(transaction)}
      categories={categories}
    />
  );
}
