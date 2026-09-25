import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function parseRecurrence(description: string) {
  const match = description.trim().match(/^(.*)\s+\((\d+)\/(\d+)\)$/);

  if (!match) {
    return null;
  }

  return {
    baseDescription: match[1].trim(),
    current: Number(match[2]),
    total: Number(match[3]),
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const transaction = await prisma.financialTransaction.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
      select: {
        id: true,
        tipo: true,
        descricao: true,
        centroCusto: true,
        externalSource: true,
        observacoes: true,
      },
    });

    if (!transaction) {
      return ApiResponse.notFound("Lançamento não encontrado.");
    }

    const recurrence = parseRecurrence(transaction.descricao);
    const hasRecurrenceNote = (transaction.observacoes || "")
      .toLowerCase()
      .includes("recorrência");

    if (!recurrence || !hasRecurrenceNote) {
      return ApiResponse.error("Esta conta não faz parte de uma recorrência criada no sistema.");
    }

    const deletedAt = new Date();
    const result = await prisma.financialTransaction.updateMany({
      where: {
        templeId: user.templeId,
        tipo: transaction.tipo,
        deletedAt: null,
        externalSource: null,
        centroCusto: transaction.centroCusto,
        descricao: {
          startsWith: `${recurrence.baseDescription} (`,
        },
        observacoes: {
          contains: "Recorrência",
        },
      },
      data: {
        deletedAt,
      },
    });

    return ApiResponse.success({
      success: true,
      deleted: result.count,
      recurrence,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
