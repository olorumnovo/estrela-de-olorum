import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDecimal } from "@/modules/shared";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const action = body.action as string | undefined;

    const existing = await prisma.cashRegister.findFirst({
      where: { id, templeId: user.templeId, deletedAt: null },
      include: {
        sessions: {
          where: {
            closedAt: null,
          },
          take: 1,
          orderBy: {
            openedAt: "desc",
          },
        },
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Caixa não encontrado.");
    }

    if (action === "open") {
      if (existing.sessions.length > 0) {
        return ApiResponse.success(serialize(existing.sessions[0]));
      }

      const session = await prisma.cashSession.create({
        data: {
          templeId: user.templeId,
          cashRegisterId: existing.id,
          openedAt: new Date(),
          openingBalance: toDecimal(body.openingBalance || 0),
          openingNotes: body.openingNotes || null,
        },
      });

      return ApiResponse.success(serialize(session));
    }

    if (action === "close") {
      const currentSession = existing.sessions[0];

      if (!currentSession) {
        return ApiResponse.error("Este caixa não está aberto.");
      }

      let closingBalance = body.closingBalance;

      if (closingBalance === undefined || closingBalance === null || closingBalance === "") {
        const movements = await prisma.cashLedgerEntry.groupBy({
          by: ["movementType"],
          where: {
            templeId: user.templeId,
            accountName: existing.nome,
            entryDate: { gte: currentSession.openedAt },
            movementType: { in: ["C", "D"] },
            deletedAt: null,
          },
          _sum: { amount: true },
        });
        const credits = movements.find((item) => item.movementType === "C")?._sum.amount;
        const debits = movements.find((item) => item.movementType === "D")?._sum.amount;

        closingBalance =
          Number(currentSession.openingBalance || 0) +
          Number(credits || 0) -
          Number(debits || 0);
      }

      const session = await prisma.cashSession.update({
        where: { id: currentSession.id },
        data: {
          closedAt: new Date(),
          closingBalance: toDecimal(closingBalance),
          closingNotes: body.closingNotes || null,
        },
      });

      return ApiResponse.success(serialize(session));
    }

    if (action === "sangria") {
      const currentSession = existing.sessions[0];
      const toAccount = String(body.toAccount || "").trim();
      const amount = Number(body.amount || 0);
      const description = String(body.description || "").trim();
      const transferDate = body.transferDate
        ? new Date(String(body.transferDate))
        : new Date();

      if (!currentSession) {
        return ApiResponse.error("Este caixa precisa estar aberto para realizar sangria.");
      }

      if (!toAccount) {
        return ApiResponse.error("Selecione a conta de destino da sangria.");
      }

      if (toAccount === existing.nome) {
        return ApiResponse.error("A conta de destino deve ser diferente do caixa.");
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return ApiResponse.error("Informe um valor de sangria válido.");
      }

      if (Number.isNaN(transferDate.getTime())) {
        return ApiResponse.error("Informe uma data de sangria válida.");
      }

      const [bankAccount, cashRegister] = await Promise.all([
        prisma.financialBankAccount.findFirst({
          where: {
            templeId: user.templeId,
            nome: toAccount,
            deletedAt: null,
          },
          select: { id: true },
        }),
        prisma.cashRegister.findFirst({
          where: {
            templeId: user.templeId,
            nome: toAccount,
            deletedAt: null,
          },
          select: { id: true },
        }),
      ]);

      if (!bankAccount && !cashRegister) {
        return ApiResponse.error("Conta de destino não encontrada.");
      }

      const transferId = randomUUID();
      const narrative = description
        ? `Sangria de caixa - ${description}`
        : "Sangria de caixa";

      await prisma.cashLedgerEntry.createMany({
        data: [
          {
            templeId: user.templeId,
            accountName: existing.nome,
            entryDate: transferDate,
            category: "Sangria",
            description: `${narrative} - Caixa: ${existing.nome} - Destino: ${toAccount}`,
            movementType: "D",
            amount: toDecimal(amount),
            externalId: `${transferId}:debit`,
            sourceFile: "SANGRIA_CAIXA",
            transferFrom: existing.nome,
            transferTo: toAccount,
            isTransfer: true,
          },
          {
            templeId: user.templeId,
            accountName: toAccount,
            entryDate: transferDate,
            category: "Sangria",
            description: `${narrative} - Caixa: ${existing.nome} - Destino: ${toAccount}`,
            movementType: "C",
            amount: toDecimal(amount),
            externalId: `${transferId}:credit`,
            sourceFile: "SANGRIA_CAIXA",
            transferFrom: existing.nome,
            transferTo: toAccount,
            isTransfer: true,
          },
        ],
      });

      return ApiResponse.success(
        serialize({
          success: true,
          transferId,
        })
      );
    }

    if (!body.nome) {
      return ApiResponse.error("Informe o nome do caixa.");
    }

    const nextName = String(body.nome).trim();

    const register = await prisma.$transaction(async (tx) => {
      if (nextName !== existing.nome) {
        const conflictingBankAccount = await tx.financialBankAccount.findFirst({
          where: {
            templeId: user.templeId,
            nome: nextName,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (conflictingBankAccount) {
          throw new Error("Já existe uma conta bancária com esse nome.");
        }
      }

      const updated = await tx.cashRegister.update({
        where: { id },
        data: {
          nome: nextName,
          descricao: body.descricao || null,
          observacoes: body.observacoes || null,
          ativo: body.ativo !== "false" && body.ativo !== false,
        },
      });

      if (nextName !== existing.nome) {
        await Promise.all([
          tx.cashLedgerEntry.updateMany({
            where: { templeId: user.templeId, accountName: existing.nome },
            data: { accountName: nextName },
          }),
          tx.cashLedgerEntry.updateMany({
            where: { templeId: user.templeId, transferFrom: existing.nome },
            data: { transferFrom: nextName },
          }),
          tx.cashLedgerEntry.updateMany({
            where: { templeId: user.templeId, transferTo: existing.nome },
            data: { transferTo: nextName },
          }),
        ]);
      }

      return updated;
    });

    return ApiResponse.success(serialize(register));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.cashRegister.findFirst({
      where: { id, templeId: user.templeId, deletedAt: null },
      include: {
        sessions: {
          where: { closedAt: null },
          select: { id: true },
        },
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Caixa não encontrado.");
    }

    if (existing.sessions.length > 0) {
      return ApiResponse.error("Feche o caixa antes de excluir.");
    }

    await prisma.cashRegister.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
