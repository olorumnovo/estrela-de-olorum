import {
  Gender,
  MemberStatus,
  PrismaClient,
} from "@prisma/client";
import xlsx from "xlsx";

const prisma = new PrismaClient();

const FILE_PATH =
  process.argv[2] ??
  "/home/paulo-pereira/Documentos/membros.xlsx";

type SpreadsheetRow = {
  ID?: string | number;
  Código?: string | number;
  Codigo?: string | number;
  "Nome Completo"?: string;
  Endereço?: string;
  Endereco?: string;
  Número?: string | number;
  Numero?: string | number;
  Complemento?: string;
  Bairro?: string;
  CEP?: string;
  Cidade?: string;
  "Estado (UF)"?: string;
  Celular?: string;
  "E-mail"?: string;
  CPF?: string;
  RG?: string;
  Status?: string;
  Observações?: string;
  Observacoes?: string;
  "Estado civil"?: string;
  Hierarquia?: string;
  Sexo?: string;
  "Data nascimento"?: string | number | Date;
  "Pai de Frente"?: string;
  "Pai de Costas"?: string;
  "Mãe de Frente"?: string;
  "Mae de Frente"?: string;
  "Mãe de Costas"?: string;
  "Mae de Costas"?: string;
  Classificação?: string;
  Classificacao?: string;
};

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
}

function nullable(value: unknown) {
  const normalized = text(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeName(value: unknown) {
  return text(value)
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: unknown) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);

    if (!parsed) return null;

    return new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d
    );
  }

  const raw = text(value);
  const match = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  if (!match) return null;

  const [, day, month, year] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function toGender(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("masc")) return Gender.MALE;
  if (normalized.includes("fem")) return Gender.FEMALE;

  return null;
}

function toStatus(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("pend")) {
    return MemberStatus.PENDING;
  }
  if (
    normalized.includes("susp") ||
    normalized.includes("inat")
  ) {
    return MemberStatus.SUSPENDED;
  }

  return MemberStatus.ACTIVE;
}

function splitClassifications(value: unknown) {
  return text(value)
    .split("|")
    .map((item) => normalizeName(item))
    .filter(Boolean);
}

async function hasMultiRelationTables() {
  const result = await prisma.$queryRaw<
    Array<{
      member_hierarchy: string | null;
      member_classification: string | null;
    }>
  >`
    SELECT
      to_regclass('"MemberHierarchy"')::text AS member_hierarchy,
      to_regclass('"MemberClassificationLink"')::text AS member_classification
  `;

  const row = result[0];

  return Boolean(
    row?.member_hierarchy &&
      row?.member_classification
  );
}

async function ensureHierarchy(
  templeId: string,
  name: string
) {
  const nome = normalizeName(name);

  if (!nome) return null;

  return prisma.hierarchy.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome,
      },
    },
    update: {
      ativo: true,
    },
    create: {
      templeId,
      nome,
      ativo: true,
    },
  });
}

async function ensureClassification(
  templeId: string,
  name: string
) {
  const nome = normalizeName(name);

  if (!nome) return null;

  return prisma.memberClassification.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome,
      },
    },
    update: {
      ativo: true,
    },
    create: {
      templeId,
      nome,
      ativo: true,
    },
  });
}

async function ensureSpiritualEntity(
  templeId: string,
  name: string,
  tipo: string
) {
  const nome = normalizeName(name);

  if (!nome) return null;

  const existing =
    await prisma.spiritualEntity.findUnique({
      where: {
        templeId_nome: {
          templeId,
          nome,
        },
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
  });
}

async function main() {
  const temple = await prisma.temple.findFirst({
    where: {
      ativo: true,
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!temple) {
    throw new Error(
      "Nenhum templo ativo encontrado."
    );
  }

  const existingMembers = await prisma.member.count();

  if (existingMembers > 0) {
    throw new Error(
      `A importacao foi cancelada porque ainda existem ${existingMembers} membros no banco.`
    );
  }

  const workbook = xlsx.readFile(FILE_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(
      `A aba principal nao foi encontrada em ${FILE_PATH}.`
    );
  }

  const rows =
    xlsx.utils.sheet_to_json<SpreadsheetRow>(
      sheet,
      {
        defval: "",
      }
    );

  const multiRelationsEnabled =
    await hasMultiRelationTables();

  let imported = 0;

  for (const row of rows) {
    const nome = normalizeName(row["Nome Completo"]);

    if (!nome) {
      continue;
    }

    const hierarchy =
      await ensureHierarchy(
        temple.id,
        text(row.Hierarquia)
      );

    const classificationNames =
      splitClassifications(
        row["Classificação"] ??
          row.Classificacao
      );

    const classifications =
      await Promise.all(
        classificationNames.map((name) =>
          ensureClassification(temple.id, name)
        )
      );

    const fatherFront =
      await ensureSpiritualEntity(
        temple.id,
        text(row["Pai de Frente"]),
        "pai-frente"
      );
    const fatherBack =
      await ensureSpiritualEntity(
        temple.id,
        text(row["Pai de Costas"]),
        "pai-costas"
      );
    const motherFront =
      await ensureSpiritualEntity(
        temple.id,
        text(
          row["Mãe de Frente"] ??
            row["Mae de Frente"]
        ),
        "mae-frente"
      );
    const motherBack =
      await ensureSpiritualEntity(
        temple.id,
        text(
          row["Mãe de Costas"] ??
            row["Mae de Costas"]
        ),
        "mae-costas"
      );

    const memberData = {
      templeId: temple.id,
      nome,
      cpf: nullable(row.CPF),
      rg: nullable(row.RG),
      nascimento: parseDate(
        row["Data nascimento"]
      ),
      genero: toGender(text(row.Sexo)),
      estadoCivil: nullable(
        row["Estado civil"]
      ),
      telefone: nullable(row.Celular),
      whatsapp: nullable(row.Celular),
      email: nullable(row["E-mail"]),
      cep: nullable(row.CEP),
      endereco: nullable(
        row["Endereço"] ?? row.Endereco
      ),
      numero: nullable(
        row["Número"] ?? row.Numero
      ),
      complemento: nullable(row.Complemento),
      bairro: nullable(row.Bairro),
      cidade: nullable(row.Cidade),
      estado: nullable(row["Estado (UF)"]),
      fatherEntity1Id: fatherFront?.id ?? null,
      fatherEntity2Id: fatherBack?.id ?? null,
      motherEntity1Id: motherFront?.id ?? null,
      motherEntity2Id: motherBack?.id ?? null,
      hierarchyId: hierarchy?.id ?? null,
      classificationId:
        classifications[0]?.id ?? null,
      observacoes: nullable(
        row["Observações"] ?? row.Observacoes
      ),
      status: toStatus(text(row.Status)),
    };

    if (multiRelationsEnabled) {
      await prisma.member.create({
        data: {
          ...memberData,
          memberHierarchies: hierarchy
            ? {
                create: [
                  {
                    hierarchyId: hierarchy.id,
                    order: 0,
                  },
                ],
              }
            : undefined,
          memberClassifications:
            classifications.length > 0
              ? {
                  create: classifications
                    .filter(Boolean)
                    .map(
                      (
                        classification,
                        index
                      ) => ({
                        classificationId:
                          classification!.id,
                        order: index,
                      })
                    ),
                }
              : undefined,
        },
      });
    } else {
      await prisma.member.create({
        data: memberData,
      });
    }

    imported += 1;
  }

  const finalCount = await prisma.member.count();

  console.log(
    JSON.stringify(
      {
        temple: temple.nome,
        imported,
        finalCount,
        multiRelationsEnabled,
        source: FILE_PATH,
        sheet: sheetName,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
