import { MemberStatus } from "@prisma/client";

import CadastrosUnifiedView from "@/components/members/CadastrosUnifiedView";
import detailedRecords from "@/data/cadastros-fornecedores-detalhes.json";
import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

function statusLabel(status: MemberStatus) {
  if (status === "PENDING") {
    return "pendente";
  }

  if (status === "INACTIVE") {
    return "inativo";
  }

  return "ativo";
}

const EXTENDED_MARKER_START = "[CADASTRO_EXTENDIDO_JSON]";
const EXTENDED_MARKER_END = "[/CADASTRO_EXTENDIDO_JSON]";

function unpackExtended(value: string | null) {
  const text = value || "";
  const startIndex = text.indexOf(EXTENDED_MARKER_START);
  const endIndex = text.indexOf(EXTENDED_MARKER_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {} as Record<string, unknown>;
  }

  try {
    return JSON.parse(
      text.slice(startIndex + EXTENDED_MARKER_START.length, endIndex).trim()
    ) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function arrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeDocument(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function uniqueLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values.filter((value): value is string => {
    const normalized = normalizeText(value);

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MembrosPage({ searchParams }: Props) {
  const user = await requireCurrentUserFromCookies();
  const resolvedSearchParams = (await searchParams) || {};
  const requestedStatus = Array.isArray(resolvedSearchParams.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams.status;
  const requestedBirthdays = Array.isArray(resolvedSearchParams.birthdays)
    ? resolvedSearchParams.birthdays[0]
    : resolvedSearchParams.birthdays;
  const initialStatus =
    requestedStatus === "pendente" ||
    requestedStatus === "inativo" ||
    requestedStatus === "ativo" ||
    requestedStatus === "todos"
      ? requestedStatus
      : "ativo";

  const databaseMembers = await prisma.member.findMany({
    where: {
      templeId: user.templeId,
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
      cpf: true,
      nascimento: true,
      telefone: true,
      whatsapp: true,
      email: true,
      cidade: true,
      observacoes: true,
      status: true,
      createdAt: true,
      classification: {
        select: {
          nome: true,
        },
      },
      memberClassifications: {
        select: {
          classification: {
            select: {
              nome: true,
            },
          },
        },
      },
    },
    orderBy: {
      nome: "asc",
    },
  });

  const databaseMemberIds = new Set(databaseMembers.map((member) => member.id));
  const databaseMemberCpfs = new Set(
    databaseMembers
      .map((member) => normalizeDocument(member.cpf))
      .filter(Boolean)
  );
  const databaseMemberNames = new Set(
    databaseMembers
      .map((member) => normalizeText(member.nome))
      .filter(Boolean)
  );
  const databaseMemberEmails = new Set(
    databaseMembers
      .map((member) => normalizeText(member.email))
      .filter(Boolean)
  );

  const jsonRecords = detailedRecords
    .filter(
      (record) => {
        const normalizedCpf = normalizeDocument(record.cpfCnpj);
        const normalizedName = normalizeText(record.name);
        const normalizedEmail = normalizeText(record.email);

        return (
          !databaseMemberIds.has(record.id) &&
          !(normalizedCpf && databaseMemberCpfs.has(normalizedCpf)) &&
          !(normalizedName && databaseMemberNames.has(normalizedName)) &&
          !(normalizedEmail && databaseMemberEmails.has(normalizedEmail))
        );
      }
    )
    .map((record) => ({
    id: record.id,
    code: record.code,
    name: record.name,
    cpfCnpj: record.cpfCnpj,
    city: record.city,
    contact: record.cellphone || record.phone,
    email: record.email,
    status: record.status,
    birthDate: record.birthDate,
    createdAt: "",
    tags: uniqueLabels(record.classifications),
  }));

  const jsonRecordIds = new Set(jsonRecords.map((record) => record.id));
  const memberRecords = databaseMembers
    .filter((member) => !jsonRecordIds.has(member.id))
    .map((member) => {
      const extended = unpackExtended(member.observacoes);
      const extendedTags = arrayValue(extended.classifications);

      return {
      id: member.id,
      code: textValue(extended.code),
      name: member.nome,
      cpfCnpj: member.cpf || "",
      city: member.cidade || "",
      contact: member.whatsapp || member.telefone || "",
      email: member.email || "",
      status: statusLabel(member.status),
      birthDate: member.nascimento?.toISOString() || "",
      createdAt: member.createdAt.toISOString(),
      tags: uniqueLabels(
        extendedTags.length
        ? extendedTags
        : [
            member.classification?.nome,
            ...member.memberClassifications.map((item) => item.classification.nome),
          ]
      ),
      };
    });

  return (
    <CadastrosUnifiedView
      records={[...jsonRecords, ...memberRecords]}
      initialStatus={initialStatus}
      initialBirthdayMonth={requestedBirthdays === "month"}
    />
  );
}
