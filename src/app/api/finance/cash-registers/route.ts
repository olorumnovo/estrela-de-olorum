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
              { descricao: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    } as const;

    const [registers, total] = await Promise.all([
      prisma.cashRegister.findMany({
        where,
        orderBy: { nome: "asc" },
        skip,
        take: perPage,
        include: {
          sessions: {
            where: {
              closedAt: null,
            },
            orderBy: { openedAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.cashRegister.count({ where }),
    ]);

    const data = registers.map((register) => {
      const currentSession = register.sessions[0] ?? null;

      return {
        ...register,
        aberto: Boolean(currentSession),
        aberturaEm: currentSession?.openedAt ?? null,
        saldoAbertura: currentSession?.openingBalance ?? null,
        fechamentoEm: currentSession?.closedAt ?? null,
        saldoFechamento: currentSession?.closingBalance ?? null,
        currentSessionId: currentSession?.id ?? null,
      };
    });

    return ApiResponse.success(
      serialize({
        data,
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

    if (!body.nome) {
      return ApiResponse.error("Informe o nome do caixa.");
    }

    const register = await prisma.cashRegister.upsert({
      where: {
        templeId_nome: {
          templeId: user.templeId,
          nome: body.nome,
        },
      },
      update: {
        descricao: body.descricao || null,
        observacoes: body.observacoes || null,
        ativo: body.ativo !== "false" && body.ativo !== false,
        deletedAt: null,
      },
      create: {
        templeId: user.templeId,
        nome: body.nome,
        descricao: body.descricao || null,
        observacoes: body.observacoes || null,
        ativo: body.ativo !== "false" && body.ativo !== false,
      },
    });

    return ApiResponse.created(serialize(register));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
