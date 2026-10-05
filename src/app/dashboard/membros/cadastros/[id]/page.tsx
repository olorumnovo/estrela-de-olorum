import CadastroDetailView from "@/components/members/CadastroDetailView";
import records from "@/data/cadastros-fornecedores-detalhes.json";
import { prisma } from "@/lib/prisma";
import { readAnnualRecurrence } from "@/lib/finance/member-annual-recurrence";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

const EXTENDED_MARKER_START = "[CADASTRO_EXTENDIDO_JSON]";
const EXTENDED_MARKER_END = "[/CADASTRO_EXTENDIDO_JSON]";

function unpackObservations(value: string | null) {
  const text = value || "";
  const startIndex = text.indexOf(EXTENDED_MARKER_START);
  const endIndex = text.indexOf(EXTENDED_MARKER_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {
      observations: text,
      extended: {} as Record<string, unknown>,
    };
  }

  const observations = text.slice(0, startIndex).trim();
  const json = text
    .slice(startIndex + EXTENDED_MARKER_START.length, endIndex)
    .trim();

  try {
    return {
      observations,
      extended: JSON.parse(json) as Record<string, unknown>,
    };
  } catch {
    return {
      observations,
      extended: {} as Record<string, unknown>,
    };
  }
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function arrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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

function formatDateValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export default async function CadastroDetalhePage({ params }: Props) {
  const user = await requireCurrentUserFromCookies();

  const { id } = await params;
  const member = await prisma.member.findFirst({
    where: {
      id,
      templeId: user.templeId,
      deletedAt: null,
    },
    include: {
      fatherEntity1: true,
      fatherEntity2: true,
      motherEntity1: true,
      motherEntity2: true,
      hierarchy: true,
      classification: true,
      memberClassifications: {
        include: {
          classification: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (member) {
    const unpacked = unpackObservations(member.observacoes);
    const extended = unpacked.extended;
    const fallbackClassifications = [
      member.classification?.nome,
      ...member.memberClassifications.map((item) => item.classification.nome),
    ].filter(Boolean) as string[];

    return (
      <CadastroDetailView
        record={{
        id: member.id,
        annualRecurrenceEnabled: readAnnualRecurrence(member.observacoes)?.enabled || false,
        code: textValue(extended.code),
        name: member.nome,
        fantasy: textValue(extended.fantasy),
        address: member.endereco || "",
        number: member.numero || "",
        complement: member.complemento || "",
        neighborhood: member.bairro || "",
        zipCode: member.cep || "",
        city: member.cidade || "",
        state: member.estado || "",
        contactNotes: textValue(extended.contactNotes),
        phone: member.telefone || "",
        cellphone: member.whatsapp || member.telefone || "",
        email: member.email || "",
        personType: textValue(extended.personType) || "Pessoa Física",
        cpfCnpj: member.cpf || "",
        rgIe: member.rg || "",
        status:
          member.status === "PENDING"
            ? "pendente"
            : member.status === "INACTIVE"
              ? "inativo"
              : "ativo",
        observations: unpacked.observations,
        maritalStatus: member.estadoCivil || textValue(extended.maritalStatus),
        hierarchy: member.hierarchy?.nome || textValue(extended.hierarchy),
        sex: textValue(extended.sex) || member.genero || "",
        birthDate: member.nascimento
          ? formatDateValue(member.nascimento)
          : textValue(extended.birthDate),
        admissionDate:
          formatDateValue(member.admissaoCentro) ||
          textValue(extended.admissionDate),
        exitDate:
          formatDateValue(member.saidaCentro) ||
          textValue(extended.exitDate),
        fatherFront:
          member.fatherEntity1?.nome || textValue(extended.fatherFront),
        fatherBack:
          member.fatherEntity2?.nome || textValue(extended.fatherBack),
        motherFront:
          member.motherEntity1?.nome || textValue(extended.motherFront),
        motherBack:
          member.motherEntity2?.nome || textValue(extended.motherBack),
        classifications: uniqueLabels(
          arrayValue(extended.classifications).length
            ? arrayValue(extended.classifications)
            : fallbackClassifications
        ),
      }}
      />
    );
  }

  const record = records.find((item) => item.id === id);

  if (record) {
    return (
      <CadastroDetailView
        record={{
          ...record,
          admissionDate: "",
          exitDate: "",
          classifications: uniqueLabels(record.classifications),
        }}
      />
    );
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <h1 className="text-3xl font-bold text-slate-900">
        Cadastro não encontrado
      </h1>
    </main>
  );
}
