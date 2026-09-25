import { BankAccountType } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const page = Math.max(
      Number(req.nextUrl.searchParams.get("page") || 1),
      1
    );
    const perPage = Math.min(
      Math.max(
        Number(req.nextUrl.searchParams.get("perPage") || 10),
        1
      ),
      100
    );
    const skip = (page - 1) * perPage;

    const where = {
      templeId: user.templeId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" as const } },
              { banco: { contains: q, mode: "insensitive" as const } },
              { agencia: { contains: q, mode: "insensitive" as const } },
              { conta: { contains: q, mode: "insensitive" as const } },
              { titular: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    } as const;

    const [accounts, total] = await Promise.all([
      prisma.financialBankAccount.findMany({
        where,
        orderBy: { nome: "asc" },
        skip,
        take: perPage,
      }),
      prisma.financialBankAccount.count({ where }),
    ]);

    return ApiResponse.success(
      serialize({
        data: accounts,
        pagination: {
          page,
          perPage,
          total,
          pages: Math.max(Math.ceil(total / perPage), 1),
        },
      })
    );
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();

    if (!body.nome || !body.banco) {
      return ApiResponse.error("Informe o nome da conta e o banco.");
    }

    const accountName = String(body.nome).trim();
    const [existingAccount, conflictingCashRegister] = await Promise.all([
      prisma.financialBankAccount.findUnique({
        where: {
          templeId_nome: {
            templeId: user.templeId,
            nome: accountName,
          },
        },
      }),
      prisma.cashRegister.findFirst({
        where: {
          templeId: user.templeId,
          nome: accountName,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

    if (existingAccount && !existingAccount.deletedAt) {
      return ApiResponse.error("Já existe uma conta bancária com esse nome.");
    }

    if (conflictingCashRegister) {
      return ApiResponse.error("Já existe um caixa com esse nome.");
    }

    const accountData = {
      banco: String(body.banco).trim(),
      agencia: body.agencia || null,
      conta: body.conta || null,
      titular: body.titular || null,
      documento: body.documento || null,
      tipo: (body.tipo || "CORRENTE") as BankAccountType,
      observacoes: body.observacoes || null,
      ativo: body.ativo !== "false" && body.ativo !== false,
    };

    const account = existingAccount
      ? await prisma.financialBankAccount.update({
          where: { id: existingAccount.id },
          data: {
            ...accountData,
            deletedAt: null,
          },
        })
      : await prisma.financialBankAccount.create({
          data: {
            templeId: user.templeId,
            nome: accountName,
            ...accountData,
          },
        });

    return ApiResponse.created(serialize(account));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
