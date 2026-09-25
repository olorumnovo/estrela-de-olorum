import {
  Gender,
  MemberStatus,
  PrismaClient,
} from "@prisma/client";
import xlsx from "xlsx";

const prisma = new PrismaClient();

const FILE_PATH =
  process.argv[2] ??
  "/home/paulo-pereira/Área de trabalho/estrela/Membros Inativos.xlsx";

type SpreadsheetRow = {
  Nome?: string;
  Endereço?: string;
  Número?: string | number;
  Complemento?: string;
  Bairro?: string;
  CEP?: string;
  Cidade?: string;
  Estado?: string;
  Celular?: string;
  "E-mail"?: string;
  "CNPJ / CPF"?: string;
  "IE / RG"?: string;
  Situação?: string;
  Observações?: string;
  "Estado civil"?: string;
  Profissão?: string;
  Sexo?: string;
  "Data nascimento"?: string | number | Date;
  "Pai de Frente"?: string;
  "Pai de Costas"?: string;
  "Mãe de Frente"?: string;
  "Mãe de Costas"?: string;
  "Tipos de Contatos"?: string;
};

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
}

function nullable(value: unknown) {
  const normalized = text(value);
  return normalized.length > 0 ? normalized : null;
}

function digits(value: unknown) {
  const normalized = String(value ?? "").replace(/\D/g, "");
  return normalized.length > 0 ? normalized : null;
}

function normalizeName(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseDate(value: unknown) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);

    if (!parsed) return null;

    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  const raw = text(value);
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return null;

  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toGender(value: unknown) {
  const normalized = text(value).toLowerCase();

  if (normalized.includes("masc")) return Gender.MALE;
  if (normalized.includes("fem")) return Gender.FEMALE;

  return null;
}

function splitClassifications(value: unknown) {
  return text(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ensureProfession(
  templeId: string,
  name: string | null
) {
  if (!name) return null;

  return prisma.profession.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome: name,
      },
    },
    update: {
      ativo: true,
    },
    create: {
      templeId,
      nome: name,
      ativo: true,
    },
  });
}

async function ensureClassification(
  templeId: string,
  name: string
) {
  return prisma.memberClassification.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome: name,
      },
    },
    update: {
      ativo: true,
    },
    create: {
      templeId,
      nome: name,
      ativo: true,
    },
  });
}

async function ensureSpiritualEntity(
  templeId: string,
  name: string | null,
  tipo: string
) {
  if (!name) return null;

  const existing = await prisma.spiritualEntity.findUnique({
    where: {
      templeId_nome: {
        templeId,
        nome: name,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.spiritualEntity.create({
    data: {
      templeId,
      nome: name,
      tipo,
      ativo: true,
    },
  });
}

async function main() {
  const workbook = xlsx.readFile(FILE_PATH);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows =
    xlsx.utils.sheet_to_json<SpreadsheetRow>(worksheet, {
      defval: "",
    });

  const temple = await prisma.temple.findFirst({
    where: {
      ativo: true,
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
    },
  });

  if (!temple) {
    throw new Error("Nenhum templo ativo encontrado.");
  }

  const existingMembers = await prisma.member.findMany({
    where: {
      templeId: temple.id,
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
      cpf: true,
    },
  });

  const membersByCpf = new Map(
    existingMembers
      .map((member) => [digits(member.cpf), member] as const)
      .filter((entry) => entry[0])
  );
  const membersByName = new Map(
    existingMembers.map((member) => [
      normalizeName(member.nome),
      member,
    ])
  );
  const professionCache = new Map(
    (
      await prisma.profession.findMany({
        where: {
          templeId: temple.id,
        },
      })
    ).map((item) => [item.nome, item])
  );
  const classificationCache = new Map(
    (
      await prisma.memberClassification.findMany({
        where: {
          templeId: temple.id,
        },
      })
    ).map((item) => [item.nome, item])
  );
  const spiritualEntityCache = new Map(
    (
      await prisma.spiritualEntity.findMany({
        where: {
          templeId: temple.id,
        },
      })
    ).map((item) => [item.nome, item])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const nome = text(row.Nome);

    if (!nome) {
      skipped += 1;
      continue;
    }

    const cpf = digits(row["CNPJ / CPF"]);
    const existingMember =
      (cpf ? membersByCpf.get(cpf) : null) ??
      membersByName.get(normalizeName(nome)) ??
      null;

    const professionName = nullable(row.Profissão);
    let profession =
      professionName
        ? professionCache.get(professionName) ?? null
        : null;

    if (!profession && professionName) {
      profession = await ensureProfession(
        temple.id,
        professionName
      );

      if (profession) {
        professionCache.set(professionName, profession);
      }
    }

    const fatherFrontName = nullable(
      row["Pai de Frente"]
    );
    let fatherFront =
      fatherFrontName
        ? spiritualEntityCache.get(fatherFrontName) ??
          null
        : null;

    if (!fatherFront && fatherFrontName) {
      fatherFront = await ensureSpiritualEntity(
        temple.id,
        fatherFrontName,
        "ORIXA"
      );

      if (fatherFront) {
        spiritualEntityCache.set(
          fatherFrontName,
          fatherFront
        );
      }
    }

    const fatherBackName = nullable(
      row["Pai de Costas"]
    );
    let fatherBack =
      fatherBackName
        ? spiritualEntityCache.get(fatherBackName) ??
          null
        : null;

    if (!fatherBack && fatherBackName) {
      fatherBack = await ensureSpiritualEntity(
        temple.id,
        fatherBackName,
        "ORIXA"
      );

      if (fatherBack) {
        spiritualEntityCache.set(
          fatherBackName,
          fatherBack
        );
      }
    }

    const motherFrontName = nullable(
      row["Mãe de Frente"]
    );
    let motherFront =
      motherFrontName
        ? spiritualEntityCache.get(motherFrontName) ??
          null
        : null;

    if (!motherFront && motherFrontName) {
      motherFront = await ensureSpiritualEntity(
        temple.id,
        motherFrontName,
        "ORIXA"
      );

      if (motherFront) {
        spiritualEntityCache.set(
          motherFrontName,
          motherFront
        );
      }
    }

    const motherBackName = nullable(
      row["Mãe de Costas"]
    );
    let motherBack =
      motherBackName
        ? spiritualEntityCache.get(motherBackName) ??
          null
        : null;

    if (!motherBack && motherBackName) {
      motherBack = await ensureSpiritualEntity(
        temple.id,
        motherBackName,
        "ORIXA"
      );

      if (motherBack) {
        spiritualEntityCache.set(
          motherBackName,
          motherBack
        );
      }
    }

    const memberData = {
      templeId: temple.id,
      nome,
      cpf,
      rg: nullable(row["IE / RG"]),
      nascimento: parseDate(row["Data nascimento"]),
      genero: toGender(row.Sexo),
      estadoCivil: nullable(row["Estado civil"]),
      telefone: nullable(row.Celular),
      whatsapp: nullable(row.Celular),
      email: nullable(row["E-mail"]),
      cep: nullable(row.CEP),
      endereco: nullable(row.Endereço),
      numero: nullable(row.Número),
      complemento: nullable(row.Complemento),
      bairro: nullable(row.Bairro),
      cidade: nullable(row.Cidade),
      estado: nullable(row.Estado),
      professionId: profession?.id ?? null,
      funcao: nullable(row.Profissão),
      fatherEntity1Id: fatherFront?.id ?? null,
      fatherEntity2Id: fatherBack?.id ?? null,
      motherEntity1Id: motherFront?.id ?? null,
      motherEntity2Id: motherBack?.id ?? null,
      observacoes: nullable(row.Observações),
      status: MemberStatus.INACTIVE,
    };

    let memberId: string;

    if (existingMember) {
      const updatedMember = await prisma.member.update({
        where: {
          id: existingMember.id,
        },
        data: memberData,
        select: {
          id: true,
        },
      });

      updated += 1;
      memberId = updatedMember.id;
    } else {
      const createdMember = await prisma.member.create({
        data: memberData,
        select: {
          id: true,
        },
      });

      created += 1;
      memberId = createdMember.id;
    }

    const classifications = splitClassifications(
      row["Tipos de Contatos"]
    );

    if (classifications.length > 0) {
      const ensuredClassifications = [];

      for (const classificationName of classifications) {
        let classification =
          classificationCache.get(classificationName) ??
          null;

        if (!classification) {
          classification = await ensureClassification(
            temple.id,
            classificationName
          );
          classificationCache.set(
            classificationName,
            classification
          );
        }

        ensuredClassifications.push(classification);
      }

      await prisma.memberClassificationLink.deleteMany({
        where: {
          memberId,
        },
      });

      for (const [index, classification] of ensuredClassifications.entries()) {
        await prisma.memberClassificationLink.create({
          data: {
            memberId,
            classificationId: classification.id,
            order: index + 1,
          },
        });
      }

      await prisma.member.update({
        where: {
          id: memberId,
        },
        data: {
          classificationId: ensuredClassifications[0]?.id ?? null,
        },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        temple: temple.nome,
        file: FILE_PATH,
        totalRows: rows.length,
        created,
        updated,
        skipped,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
