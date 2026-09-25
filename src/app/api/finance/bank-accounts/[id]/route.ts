import { BankAccountType } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    if (!body.nome || !body.banco) {
      return ApiResponse.error("Informe o nome da conta e o banco.");
    }

    const existing = await prisma.financialBankAccount.findFirst({
      where: { id, templeId: user.templeId, deletedAt: null },
      select: { id: true, nome: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Conta bancária não encontrada.");
    }

    const nextName = String(body.nome).trim();

    const account = await prisma.$transaction(async (tx) => {
      if (nextName !== existing.nome) {
        const conflictingCashRegister = await tx.cashRegister.findFirst({
          where: {
            templeId: user.templeId,
            nome: nextName,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (conflictingCashRegister) {
          throw new Error("Já existe um caixa com esse nome.");
        }
      }

      const updated = await tx.financialBankAccount.update({
        where: { id },
        data: {
          nome: nextName,
          banco: String(body.banco).trim(),
          agencia: body.agencia || null,
          conta: body.conta || null,
          titular: body.titular || null,
          documento: body.documento || null,
          tipo: (body.tipo || "CORRENTE") as BankAccountType,
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

    return ApiResponse.success(serialize(account));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.financialBankAccount.findFirst({
      where: { id, templeId: user.templeId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Conta bancária não encontrada.");
    }

    await prisma.financialBankAccount.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
