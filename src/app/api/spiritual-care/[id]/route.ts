import { NextRequest } from "next/server";
import { SpiritualCareStatus } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type AttachmentInput = {
  nome?: string;
  arquivo?: string;
  tipo?: string;
};

const includeCare = {
  member: {
    select: {
      id: true,
      nome: true,
    },
  },
  attachments: true,
};

function parseAttachments(value: unknown): AttachmentInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is AttachmentInput =>
      Boolean(item) && typeof item === "object"
  );
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const record = await prisma.spiritualCare.findFirst({
      where: { id, templeId: user.templeId },
      include: includeCare,
    });

    if (!record) {
      return ApiResponse.notFound("Atendimento não encontrado.");
    }

    return ApiResponse.success(serialize(record));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const data = toDate(body.data);

    if (!body.consulente || !body.tipo || !data) {
      return ApiResponse.error("Informe consulente, tipo e data.");
    }

    const existing = await prisma.spiritualCare.findFirst({
      where: { id, templeId: user.templeId },
      select: { templeId: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Atendimento não encontrado.");
    }

    await prisma.spiritualCareAttachment.deleteMany({
      where: { spiritualCareId: id },
    });

    const record = await prisma.spiritualCare.update({
      where: { id },
      data: {
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
                    templeId: existing.templeId,
                    nome: body.anexoNome || "Anexo",
                    arquivo: body.anexoArquivo || "",
                    tipo: body.anexoTipo || null,
                  },
                ]
              : parseAttachments(body.attachments).map((item) => ({
                  templeId: existing.templeId,
                  nome: item.nome || "Anexo",
                  arquivo: item.arquivo || "",
                  tipo: item.tipo || null,
                })),
        },
      },
      include: includeCare,
    });

    return ApiResponse.success(serialize(record));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.spiritualCare.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Atendimento não encontrado.");
    }

    await prisma.spiritualCare.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
