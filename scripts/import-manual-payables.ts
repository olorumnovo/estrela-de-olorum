import path from "node:path";

import { prisma } from "@/lib/prisma";
import { importManualPayablesFromFolder } from "@/lib/manual-payables/importer";

async function main() {
  const baseDir =
    process.argv[2] ||
    path.resolve(process.cwd(), "../Contas/Contas a Pagar");

  const temple = await prisma.temple.findFirst({
    where: {
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
    throw new Error("Nenhum templo ativo encontrado para importar as contas a pagar.");
  }

  const result = await importManualPayablesFromFolder({
    templeId: temple.id,
    baseDir,
  });

  console.log(
    JSON.stringify(
      {
        temple: temple.nome,
        baseDir,
        ...result,
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
