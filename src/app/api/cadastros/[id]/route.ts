import { NextRequest } from "next/server";
import { Gender, MemberStatus } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { readAnnualRecurrence } from "@/lib/finance/member-annual-recurrence";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";
import { syncMemberReceivableName } from "@/modules/members/member.service";

const EXTENDED_MARKER_START = "\n\n[CADASTRO_EXTENDIDO_JSON]";
const EXTENDED_MARKER_END = "[/CADASTRO_EXTENDIDO_JSON]";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function emptyToNull(value: unknown) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function toDate(value: unknown) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (brMatch) {
    const year =
      brMatch[3].length === 2
        ? Number(`20${brMatch[3]}`)
        : Number(brMatch[3]);

    return new Date(Date.UTC(year, Number(brMatch[2]) - 1, Number(brMatch[1])));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toGender(value: unknown) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

  if (text.startsWith("masc")) {
    return Gender.MALE;
  }

  if (text.startsWith("fem")) {
    return Gender.FEMALE;
  }

  return null;
}

function toStatus(value: unknown) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

  if (text.includes("inativo")) {
    return MemberStatus.INACTIVE;
  }

  if (text.includes("pendente")) {
    return MemberStatus.PENDING;
  }

  if (text.includes("suspenso")) {
    return MemberStatus.SUSPENDED;
  }

  return MemberStatus.ACTIVE;
}

function packObservations(body: Record<string, unknown>, previousObservations?: string | null) {
  const observations = String(body.observations || "").trim();
  const annualRecurrence = readAnnualRecurrence(previousObservations || null);
  const extended = {
    ...(annualRecurrence ? { annualRecurrence } : {}),
    code: body.code || "",
    fantasy: body.fantasy || "",
    contactNotes: body.contactNotes || "",
    phone: body.phone || "",
    fax: body.fax || "",
    cellphone: body.cellphone || "",
    website: body.website || "",
    personType: body.personType || "",
    ieExempt: body.ieExempt || "",
    maritalStatus: body.maritalStatus || "",
    hierarchy: body.hierarchy || "",
    sex: body.sex || "",
    birthDate: body.birthDate || "",
    admissionDate: body.admissionDate || "",
    exitDate: body.exitDate || "",
    naturality: body.naturality || "",
    fatherFront: body.fatherFront || "",
    fatherBack: body.fatherBack || "",
    motherFront: body.motherFront || "",
    motherBack: body.motherBack || "",
    priceList: body.priceList || "",
    seller: body.seller || "",
    invoiceEmail: body.invoiceEmail || "",
    classifications: Array.isArray(body.classifications)
      ? body.classifications
      : [],
    contributor: body.contributor || "",
    taxRegimeCode: body.taxRegimeCode || "",
    creditLimit: body.creditLimit || "",
  };

  return `${observations}${EXTENDED_MARKER_START}${JSON.stringify(extended)}${EXTENDED_MARKER_END}`;
}

async function resolveSpiritualEntity(
  templeId: string,
  value: unknown,
  tipo: string
) {
  const nome = String(value || "").trim();

  if (!nome) {
    return null;
  }

  const existing = await prisma.spiritualEntity.findFirst({
    where: {
      templeId,
      nome: {
        equals: nome,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      tipo: true,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.spiritualEntity.create({
    data: {
      templeId,
      nome,
      tipo,
      ativo: true,
    },
    select: {
      id: true,
      tipo: true,
    },
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    if (!String(body.name || "").trim()) {
      return ApiResponse.error("Informe o nome do cadastro.");
    }

    const cpf = emptyToNull(body.cpfCnpj);
    const cpfOwner = cpf
      ? await prisma.member.findUnique({
          where: {
            cpf,
          },
          select: {
            id: true,
            templeId: true,
          },
        })
      : null;

    if (cpfOwner && cpfOwner.id !== id && cpfOwner.templeId === user.templeId) {
      return ApiResponse.error("Já existe um cadastro com este CPF.");
    }

    const hierarchyName = String(body.hierarchy || "").trim();
    const hierarchy = hierarchyName
      ? await prisma.hierarchy.findFirst({
          where: {
            templeId: user.templeId,
            nome: {
              equals: hierarchyName,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
          },
        })
      : null;
    const currentStatus = toStatus(body.status);
    const nextStatus =
      currentStatus === MemberStatus.PENDING && hierarchyName
        ? MemberStatus.ACTIVE
        : currentStatus;
    const [
      fatherFront,
      fatherBack,
      motherFront,
      motherBack,
    ] = await Promise.all([
      resolveSpiritualEntity(user.templeId, body.fatherFront, "pai-frente"),
      resolveSpiritualEntity(user.templeId, body.fatherBack, "pai-costas"),
      resolveSpiritualEntity(user.templeId, body.motherFront, "mae-frente"),
      resolveSpiritualEntity(user.templeId, body.motherBack, "mae-costas"),
    ]);

    const previousMember = await prisma.member.findFirst({ where: { id, templeId: user.templeId }, select: { observacoes: true } });
    const data = {
      templeId: user.templeId,
      nome: String(body.name || "").trim(),
      cpf,
      rg: emptyToNull(body.rgIe),
      nascimento: toDate(body.birthDate),
      admissaoCentro: toDate(body.admissionDate),
      saidaCentro:
        toDate(body.exitDate) ||
        (nextStatus === MemberStatus.INACTIVE ? new Date() : null),
      genero: toGender(body.sex),
      estadoCivil: emptyToNull(body.maritalStatus),
      telefone: emptyToNull(body.cellphone || body.phone),
      whatsapp: emptyToNull(body.cellphone || body.phone),
      email: emptyToNull(body.email),
      cep: emptyToNull(body.zipCode),
      endereco: emptyToNull(body.address),
      numero: emptyToNull(body.number),
      complemento: emptyToNull(body.complement),
      bairro: emptyToNull(body.neighborhood),
      cidade: emptyToNull(body.city),
      estado: emptyToNull(body.state),
      observacoes: packObservations(body, previousMember?.observacoes),
      status: nextStatus,
      hierarchyId: hierarchy?.id || null,
      fatherEntity1Id: fatherFront?.id || null,
      fatherEntity2Id: fatherBack?.id || null,
      motherEntity1Id: motherFront?.id || null,
      motherEntity2Id: motherBack?.id || null,
    };

    const member = await prisma.$transaction(async (tx) => {
      const existing = await tx.member.findFirst({
        where: { id, templeId: user.templeId },
        select: { nome: true },
      });
      if (!existing) {
        return tx.member.create({ data: { id, ...data } });
      }

      const updated = await tx.member.update({
        where: { id_templeId: { id, templeId: user.templeId } },
        data,
      });
      await syncMemberReceivableName(tx, user.templeId, id, existing.nome, updated.nome);
      return updated;
    }, { timeout: 15000 });

    return ApiResponse.success(serialize(member));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const status =
      body?.status === "ACTIVE" ||
      body?.status === "INACTIVE" ||
      body?.status === "PENDING" ||
      body?.status === "SUSPENDED"
        ? body.status
        : null;

    if (!status) {
      return ApiResponse.error("Status inválido.");
    }

    const member = await prisma.member.update({
      where: {
        id_templeId: {
          id,
          templeId: user.templeId,
        },
      },
      data: {
        status,
        ...(status === MemberStatus.INACTIVE
          ? {
              saidaCentro: new Date(),
            }
          : status === MemberStatus.ACTIVE
            ? {
                saidaCentro: null,
              }
            : {}),
      },
    });

    return ApiResponse.success(serialize(member));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    await prisma.member.update({
      where: {
        id_templeId: {
          id,
          templeId: user.templeId,
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return ApiResponse.success({
      success: true,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
