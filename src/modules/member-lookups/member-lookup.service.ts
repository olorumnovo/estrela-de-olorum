import { prisma } from "@/lib/prisma";
import { MemberLookupInput } from "./member-lookup.validator";

export type MemberLookupType =
  | "hierarchies"
  | "classifications";

const orderBy = {
  nome: "asc" as const,
};

export class MemberLookupService {
  async listar(type: MemberLookupType, templeId: string) {
    if (type === "hierarchies") {
      return prisma.hierarchy.findMany({
        where: { templeId },
        orderBy,
      });
    }

    return prisma.memberClassification.findMany({
      where: { templeId },
      orderBy,
    });
  }

  async buscar(
    type: MemberLookupType,
    id: string,
    templeId: string
  ) {
    if (type === "hierarchies") {
      return prisma.hierarchy.findFirst({
        where: { id, templeId },
      });
    }

    return prisma.memberClassification.findFirst({
      where: { id, templeId },
    });
  }

  async criar(
    type: MemberLookupType,
    templeId: string,
    data: MemberLookupInput
  ) {
    if (type === "hierarchies") {
      return prisma.hierarchy.create({
        data: {
          templeId,
          nome: data.nome,
          ativo: data.ativo,
        },
      });
    }

    return prisma.memberClassification.create({
      data: {
        templeId,
        nome: data.nome,
        ativo: data.ativo,
      },
    });
  }

  async atualizar(
    type: MemberLookupType,
    id: string,
    templeId: string,
    data: MemberLookupInput
  ) {
    const existing = await this.buscar(type, id, templeId);

    if (!existing) {
      throw new Error("Registro não encontrado.");
    }

    if (type === "hierarchies") {
      return prisma.hierarchy.update({
        where: { id },
        data: {
          nome: data.nome,
          ativo: data.ativo,
        },
      });
    }

    return prisma.memberClassification.update({
      where: { id },
      data: {
        nome: data.nome,
        ativo: data.ativo,
      },
    });
  }

  async excluir(
    type: MemberLookupType,
    id: string,
    templeId: string
  ) {
    const existing = await this.buscar(type, id, templeId);

    if (!existing) {
      throw new Error("Registro não encontrado.");
    }

    if (type === "hierarchies") {
      return prisma.hierarchy.update({
        where: { id },
        data: { ativo: false },
      });
    }

    return prisma.memberClassification.update({
      where: { id },
      data: { ativo: false },
    });
  }
}

export const memberLookupService =
  new MemberLookupService();
