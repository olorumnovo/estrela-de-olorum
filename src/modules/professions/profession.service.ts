import { prisma } from "@/lib/prisma";
import { ProfessionInput } from "./profession.validator";

export class ProfessionService {
  async listar(templeId: string) {
    return prisma.profession.findMany({
      where: {
        templeId,
      },
      orderBy: {
        nome: "asc",
      },
    });
  }

  async buscar(id: string, templeId?: string) {
    return prisma.profession.findFirst({
      where: {
        id,
        ...(templeId ? { templeId } : {}),
      },
    });
  }

  async criar(
    templeId: string,
    data: ProfessionInput
  ) {
    return prisma.profession.create({
      data: {
        templeId,
        nome: data.nome,
        ativo: data.ativo,
      },
    });
  }

  async atualizar(
    id: string,
    data: ProfessionInput,
    templeId?: string
  ) {
    if (templeId) {
      const existing = await this.buscar(id, templeId);

      if (!existing) {
        throw new Error("Profissão não encontrada.");
      }
    }

    return prisma.profession.update({
      where: {
        id,
      },
      data: {
        nome: data.nome,
        ativo: data.ativo,
      },
    });
  }

  async excluir(id: string, templeId?: string) {
    if (templeId) {
      const existing = await this.buscar(id, templeId);

      if (!existing) {
        throw new Error("Profissão não encontrada.");
      }
    }

    return prisma.profession.update({
      where: {
        id,
      },
      data: {
        ativo: false,
      },
    });
  }
}

export const professionService =
  new ProfessionService();
