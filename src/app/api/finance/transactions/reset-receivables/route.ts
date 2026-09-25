import { TransactionType } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

const CONFIRMATION = "APAGAR_CONTAS_A_RECEBER";

async function resetReceivables(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const confirm =
      req.nextUrl.searchParams.get("confirm") ||
      (req.method === "POST"
        ? String((await req.json().catch(() => ({})))?.confirm || "")
        : "");

    if (confirm !== CONFIRMATION) {
      return ApiResponse.error(
        `Confirmação inválida. Use confirm=${CONFIRMATION}.`
      );
    }

    const before = await prisma.financialTransaction.count({
      where: {
        templeId: user.templeId,
        tipo: TransactionType.INCOME,
      },
    });

    const deleted = await prisma.financialTransaction.deleteMany({
      where: {
        templeId: user.templeId,
        tipo: TransactionType.INCOME,
      },
    });

    const after = await prisma.financialTransaction.count({
      where: {
        templeId: user.templeId,
        tipo: TransactionType.INCOME,
      },
    });

    return ApiResponse.success({
      success: true,
      message: "Contas a receber excluídas com sucesso.",
      before,
      deleted: deleted.count,
      after,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function GET(req: NextRequest) {
  return resetReceivables(req);
}

export async function POST(req: NextRequest) {
  return resetReceivables(req);
}
