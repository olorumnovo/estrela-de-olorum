import { prisma } from "@/lib/prisma";
import {
  ReligiousLookupType,
  SpiritualEntityType,
} from "./religious-lookup.config";
import { ReligiousLookupInput } from "./religious-lookup.validator";

const orderBy = {
  nome: "asc" as const,
};

export class ReligiousLookupService {
  async listar(
    type: ReligiousLookupType,
    templeId: string,
    entityType?: SpiritualEntityType
  ) {
    switch (type) {
      case "spiritual-entities":
        return prisma.spiritualEntity.findMany({
          where: {
            templeId,
            ...(entityType
              ? {
                  tipo: entityType,
                }
              : {}),
          },
          orderBy,
        });

      case "contact-types":
        return prisma.contactType.findMany({
          where: {
            templeId,
          },
          orderBy,
        });

      case "religious-functions":
        return prisma.religiousFunction.findMany({
          where: {
            templeId,
          },
          orderBy,
        });
    }
  }

  async buscar(
    type: ReligiousLookupType,
    id: string,
    templeId?: string,
    entityType?: SpiritualEntityType
  ) {
    switch (type) {
      case "spiritual-entities":
        return prisma.spiritualEntity.findFirst({
          where: {
            id,
            ...(templeId ? { templeId } : {}),
            ...(entityType
              ? {
                  tipo: entityType,
                }
              : {}),
          },
        });

      case "contact-types":
        return prisma.contactType.findFirst({
          where: {
            id,
            ...(templeId ? { templeId } : {}),
          },
        });

      case "religious-functions":
        return prisma.religiousFunction.findFirst({
          where: {
            id,
            ...(templeId ? { templeId } : {}),
          },
        });
    }
  }

  async criar(
    type: ReligiousLookupType,
    templeId: string,
    data: ReligiousLookupInput,
    entityType?: SpiritualEntityType
  ) {
    switch (type) {
      case "spiritual-entities":
        return prisma.spiritualEntity.create({
          data: {
            templeId,
            nome: data.nome,
            tipo: entityType ?? data.tipo ?? null,
            ativo: data.ativo,
          },
        });

      case "contact-types":
        return prisma.contactType.create({
          data: {
            templeId,
            nome: data.nome,
            ativo: data.ativo,
          },
        });

      case "religious-functions":
        return prisma.religiousFunction.create({
          data: {
            templeId,
            nome: data.nome,
            ativo: data.ativo,
          },
        });
    }
  }

  async atualizar(
    type: ReligiousLookupType,
    id: string,
    data: ReligiousLookupInput,
    templeId?: string,
    entityType?: SpiritualEntityType
  ) {
    if (templeId) {
      const existing = await this.buscar(
        type,
        id,
        templeId,
        entityType
      );

      if (!existing) {
        throw new Error("Registro não encontrado.");
      }
    }

    switch (type) {
      case "spiritual-entities":
        return prisma.spiritualEntity.update({
          where: {
            id,
          },
          data: {
            nome: data.nome,
            ...(entityType || data.tipo
              ? {
                  tipo: entityType ?? data.tipo ?? null,
                }
              : {}),
            ativo: data.ativo,
          },
        });

      case "contact-types":
        return prisma.contactType.update({
          where: {
            id,
          },
          data: {
            nome: data.nome,
            ativo: data.ativo,
          },
        });

      case "religious-functions":
        return prisma.religiousFunction.update({
          where: {
            id,
          },
          data: {
            nome: data.nome,
            ativo: data.ativo,
          },
        });
    }
  }

  async excluir(
    type: ReligiousLookupType,
    id: string,
    templeId?: string,
    entityType?: SpiritualEntityType
  ) {
    if (templeId) {
      const existing = await this.buscar(
        type,
        id,
        templeId,
        entityType
      );

      if (!existing) {
        throw new Error("Registro não encontrado.");
      }
    }

    switch (type) {
      case "spiritual-entities":
        return prisma.spiritualEntity.update({
          where: {
            id,
          },
          data: {
            ativo: false,
          },
        });

      case "contact-types":
        return prisma.contactType.update({
          where: {
            id,
          },
          data: {
            ativo: false,
          },
        });

      case "religious-functions":
        return prisma.religiousFunction.update({
          where: {
            id,
          },
          data: {
            ativo: false,
          },
        });
    }
  }
}

export const religiousLookupService =
  new ReligiousLookupService();
