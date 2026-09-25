import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  defaultPermissions,
  criticalPermissions,
} from "../src/modules/users-permissions/defaults";

const prisma = new PrismaClient();

const PDV_EMAIL = "pdv@startsystem.com.br";
const LEGACY_PDV_EMAIL = "pdv@sistemaestreladeolurum@gmail.com";
const PDV_PASSWORD: string = process.env.PDV_INITIAL_PASSWORD || "";
if (!PDV_PASSWORD) throw new Error("PDV_INITIAL_PASSWORD não configurado.");
const PDV_ROLE = "PDV";
const PDV_PERMISSION_CODES = ["pdv.visualizar", "estoque.visualizar"];

async function main() {
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

  const permissionsToSeed = [...defaultPermissions, ...criticalPermissions];

  const permissions = await Promise.all(
    permissionsToSeed.map((permission) =>
      prisma.permission.upsert({
        where: {
          templeId_codigo: {
            templeId: temple.id,
            codigo: permission.codigo,
          },
        },
        update: {
          chave: permission.chave,
          nome: permission.nome,
          descricao: permission.descricao,
          modulo: permission.modulo,
          acao: permission.acao,
        },
        create: {
          templeId: temple.id,
          chave: permission.chave,
          codigo: permission.codigo,
          nome: permission.nome,
          descricao: permission.descricao,
          modulo: permission.modulo,
          acao: permission.acao,
        },
      })
    )
  );

  const pdvRole = await prisma.role.upsert({
    where: {
      templeId_nome: {
        templeId: temple.id,
        nome: PDV_ROLE,
      },
    },
    update: {
      descricao: "Acesso exclusivo ao PDV e Estoque.",
      ativo: true,
      deletedAt: null,
    },
    create: {
      templeId: temple.id,
      nome: PDV_ROLE,
      descricao: "Acesso exclusivo ao PDV e Estoque.",
      ativo: true,
    },
  });

  const pdvPermissions = permissions.filter((permission) =>
    PDV_PERMISSION_CODES.includes(permission.codigo || permission.chave)
  );

  await prisma.rolePermission.deleteMany({
    where: {
      roleId: pdvRole.id,
      permission: {
        OR: [
          { codigo: { notIn: PDV_PERMISSION_CODES } },
          { chave: { notIn: PDV_PERMISSION_CODES } },
        ],
      },
    },
  });

  await prisma.rolePermission.createMany({
    data: pdvPermissions.map((permission) => ({
      roleId: pdvRole.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  const senha = await bcrypt.hash(PDV_PASSWORD, 10);

  const legacyUser = await prisma.user.findUnique({
    where: {
      email: LEGACY_PDV_EMAIL,
    },
    select: {
      id: true,
    },
  });

  const existingTargetUser = await prisma.user.findUnique({
    where: {
      email: PDV_EMAIL,
    },
    select: {
      id: true,
    },
  });

  if (legacyUser && !existingTargetUser) {
    await prisma.user.update({
      where: {
        id: legacyUser.id,
      },
      data: {
        email: PDV_EMAIL,
      },
    });
  }

  const user = await prisma.user.upsert({
    where: {
      email: PDV_EMAIL,
    },
    update: {
      templeId: temple.id,
      nome: "Operador PDV",
      senha,
      cargo: "PDV",
      status: "ACTIVE",
      deveTrocarSenha: false,
      tentativasLogin: 0,
      bloqueadoEm: null,
      bloqueadoMotivo: null,
      deletedAt: null,
    },
    create: {
      templeId: temple.id,
      nome: "Operador PDV",
      email: PDV_EMAIL,
      senha,
      cargo: "PDV",
      status: "ACTIVE",
      deveTrocarSenha: false,
    },
  });

  await prisma.userRole.deleteMany({
    where: {
      userId: user.id,
    },
  });

  await prisma.userPermission.deleteMany({
    where: {
      userId: user.id,
    },
  });

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: pdvRole.id,
    },
  });

  await prisma.userSession.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  console.log("✅ Usuário PDV pronto.");
  console.log(`E-mail: ${PDV_EMAIL}`);
  console.log("Acesso: PDV + Estoque");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
