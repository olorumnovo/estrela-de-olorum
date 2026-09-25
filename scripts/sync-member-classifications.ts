import { PrismaClient } from "@prisma/client";
import xlsx from "xlsx";

const prisma = new PrismaClient();

const FILE_PATH =
  process.argv[2] ??
  "/home/paulo-pereira/Documentos/membros.xlsx";

type SpreadsheetRow = {
  "Nome Completo"?: string;
  CPF?: string;
  Classificação?: string;
  Classificacao?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeName(value: unknown) {
  return text(value).replace(/\s+/g, " ");
}

function splitClassifications(value: unknown) {
  return text(value)
    .split("|")
    .map((item) => normalizeName(item))
    .filter(Boolean);
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
    throw new Error("Nenhum templo ativo encontrado.");
  }

  const workbook = xlsx.readFile(FILE_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`A aba principal nao foi encontrada em ${FILE_PATH}.`);
  }

  const rows =
    xlsx.utils.sheet_to_json<SpreadsheetRow>(sheet, {
      defval: "",
    });

  let updatedMembers = 0;
  let membersWithMultiple = 0;

  for (const row of rows) {
    const cpf = text(row.CPF);
    const nome = normalizeName(row["Nome Completo"]);
    const classificationNames =
      splitClassifications(
        row["Classificação"] ?? row.Classificacao
      );

    if (!nome || classificationNames.length === 0) {
      continue;
    }

    const member = await prisma.member.findFirst({
      where: {
        templeId: temple.id,
        deletedAt: null,
        ...(cpf.length > 0
          ? {
              cpf,
            }
          : {
              nome,
            }),
      },
      select: {
        id: true,
      },
    });

    if (!member) {
      continue;
    }

    const classifications = await Promise.all(
      classificationNames.map((name) =>
        ensureClassification(temple.id, name)
      )
    );

    await prisma.member.update({
      where: {
        id: member.id,
      },
      data: {
        classificationId:
          classifications[0]?.id ?? null,
        memberClassifications: {
          deleteMany: {},
          create: classifications.map(
            (classification, index) => ({
              classificationId: classification.id,
              order: index,
            })
          ),
        },
      },
    });

    updatedMembers += 1;

    if (classifications.length > 1) {
      membersWithMultiple += 1;
    }
  }

  const links =
    await prisma.memberClassificationLink.count();

  console.log(
    JSON.stringify(
      {
        temple: temple.nome,
        updatedMembers,
        membersWithMultiple,
        totalClassificationLinks: links,
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
