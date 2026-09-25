import { NextRequest } from "next/server";
import { SpiritualCareStatus } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate } from "@/modules/shared";

const includeCare = {
  member: {
    select: {
      id: true,
      nome: true,
    },
  },
  attachments: true,
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status");

    const records = await prisma.spiritualCare.findMany({
      where: {
        templeId,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { consulente: { contains: q, mode: "insensitive" } },
                { tipo: { contains: q, mode: "insensitive" } },
                { responsavel: { contains: q, mode: "insensitive" } },
                { descricao: { contains: q, mode: "insensitive" } },
                { member: { nome: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
        ...(status && status !== "TODOS"
          ? { status: status as SpiritualCareStatus }
          : {}),
      },
      include: includeCare,
      orderBy: {
        data: "desc",
      },
    });

    return ApiResponse.success(serialize(records));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();
    const data = toDate(body.data);

    if (!body.consulente || !body.tipo || !data) {
      return ApiResponse.error("Informe consulente, tipo e data.");
    }

    const record = await prisma.spiritualCare.create({
      data: {
        templeId,
        memberId: body.memberId || null,
        consulente: body.consulente,
        tipo: body.tipo,
        responsavel: body.responsavel || null,
        data,
        descricao: body.descricao || null,
        observacoes: body.observacoes || null,
        resultado: body.resultado || null,
        status: (body.status || "AGENDADO") as SpiritualCareStatus,
        attachments: {
          create:
            body.anexoArquivo || body.anexoNome
              ? [
                  {
                    templeId,
                    nome: body.anexoNome || "Anexo",
                    arquivo: body.anexoArquivo || "",
                    tipo: body.anexoTipo || null,
                  },
                ]
              : [],
        },
      },
      include: includeCare,
    });

    return ApiResponse.created(serialize(record));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
