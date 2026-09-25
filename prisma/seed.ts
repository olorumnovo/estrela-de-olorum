import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword) throw new Error("SEED_ADMIN_PASSWORD não configurado.");
  const senha = await bcrypt.hash(seedPassword, 10);

  const temple = await prisma.temple.upsert({
    where: {
      slug: "matriz",
    },
    update: {},
    create: {
      nome: "Templo Estrela de Olorum",
      slug: "matriz",
      email: "sistemaestreladeolorum@gmail.com",
    },
  });

  await prisma.user.upsert({
    where: {
      email: "sistemaestreladeolorum@gmail.com",
    },
    update: {
      nome: "Administrador",
      senha,
      templeId: temple.id,
    },
    create: {
      templeId: temple.id,
      nome: "Administrador",
      email: "sistemaestreladeolorum@gmail.com",
      senha,
      status: "ACTIVE",
    },
  });

  console.log("✅ Seed executado com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
