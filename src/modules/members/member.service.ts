import { Gender, MemberStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { anyIncludesNormalizedSearch } from "@/lib/search";
import { MemberInput } from "./member.validator";

export type MemberListFilters = {
  search?: string;
  workerOnly?: boolean;
  status?: MemberStatus;
};

const CURRENT_WORKER_CLASSIFICATION =
  "Trabalhador da Corrente";

const memberInclude = {
  fatherEntity1: true,
  fatherEntity2: true,
  motherEntity1: true,
  motherEntity2: true,
  hierarchy: true,
  classification: true,
  memberHierarchies: {
    include: {
      hierarchy: true,
    },
    orderBy: {
      order: "asc" as const,
    },
  },
  memberClassifications: {
    include: {
      classification: true,
    },
    orderBy: {
      order: "asc" as const,
    },
  },
} satisfies Prisma.MemberInclude;

const memberLegacyInclude = {
  fatherEntity1: true,
  fatherEntity2: true,
  motherEntity1: true,
  motherEntity2: true,
  hierarchy: true,
  classification: true,
} satisfies Prisma.MemberInclude;

const memberListSelect = {
  id: true,
  nome: true,
  cpf: true,
  telefone: true,
  foto: true,
  status: true,
  admissaoCentro: true,
  saidaCentro: true,
  hierarchy: {
    select: {
      nome: true,
    },
  },
  classification: {
    select: {
      nome: true,
    },
  },
  memberHierarchies: {
    select: {
      order: true,
      hierarchy: {
        select: {
          nome: true,
        },
      },
    },
    orderBy: {
      order: "asc" as const,
    },
  },
  memberClassifications: {
    select: {
      order: true,
      classification: {
        select: {
          nome: true,
        },
      },
    },
    orderBy: {
      order: "asc" as const,
    },
  },
} satisfies Prisma.MemberSelect;

const memberLegacyListSelect = {
  id: true,
  nome: true,
  cpf: true,
  telefone: true,
  foto: true,
  status: true,
  admissaoCentro: true,
  saidaCentro: true,
  hierarchy: {
    select: {
      nome: true,
    },
  },
  classification: {
    select: {
      nome: true,
    },
  },
} satisfies Prisma.MemberSelect;

function emptyToNull(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function toDate(value: string) {
  return value ? new Date(value) : null;
}

function toGender(value: string) {
  if (value === "MASCULINO") return Gender.MALE;
  if (value === "FEMININO") return Gender.FEMALE;

  return null;
}

function isMissingMultiRelationsError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
  ) {
    return error.code === "P2021";
  }

  return (
    error instanceof Error &&
    (error.message.includes("MemberHierarchy") ||
      error.message.includes(
        "MemberClassificationLink"
      ))
  );
}

function withEmptyMultiRelations<
  T extends {
    hierarchy?: unknown;
    classification?: unknown;
  },
>(member: T) {
  return {
    ...member,
    memberHierarchies: [],
    memberClassifications: [],
  };
}

function normalizeIds(values: string[]) {
  const ids = values
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function buildHierarchyRelationItems(ids: string[]) {
  return ids.map((id, index) => ({
    hierarchy: {
      connect: {
        id,
      },
    },
    order: index,
  }));
}

function buildClassificationRelationItems(
  ids: string[]
) {
  return ids.map((id, index) => ({
    classification: {
      connect: {
        id,
      },
    },
    order: index,
  }));
}

function toMemberData(data: MemberInput) {
  const hierarchyIds = normalizeIds(
    data.hierarchyIds
  );
  const classificationIds = normalizeIds(
    data.classificationIds
  );

  return {
    nome: data.nome,
    cpf: emptyToNull(data.cpfCnpj),
    rg: emptyToNull(data.rg),
    nascimento: toDate(data.dataNascimento),
    genero: toGender(data.sexo),
    estadoCivil: emptyToNull(data.estadoCivil),
    admissaoCentro: toDate(data.dataEntrada),
    saidaCentro: toDate(data.dataSaida),
    telefone: emptyToNull(data.celular),
    whatsapp: emptyToNull(data.celular),
    email: emptyToNull(data.email),
    cep: emptyToNull(data.cep),
    endereco: emptyToNull(data.endereco),
    numero: emptyToNull(data.numero),
    complemento: emptyToNull(data.complemento),
    bairro: emptyToNull(data.bairro),
    cidade: emptyToNull(data.cidade),
    estado: emptyToNull(data.estado),
    fatherEntity1Id: emptyToNull(data.entidadePai1),
    fatherEntity2Id: emptyToNull(data.entidadePai2),
    motherEntity1Id: emptyToNull(data.entidadeMae1),
    motherEntity2Id: emptyToNull(data.entidadeMae2),
    hierarchyId: hierarchyIds[0] ?? null,
    classificationId: classificationIds[0] ?? null,
    foto:
      typeof data.foto === "string"
        ? emptyToNull(data.foto)
        : null,
    observacoes: emptyToNull(data.observacoes),
    status: data.status,
  } satisfies Prisma.MemberUncheckedUpdateInput;
}

export class MemberService {
  async listarOpcoesFormulario(templeId: string) {
    const orderBy = {
      nome: "asc" as const,
    };

    const where = {
      templeId,
      ativo: true,
    };

    const select = {
      id: true,
      nome: true,
    };
    const fatherEntityWhere = {
      ...where,
      OR: [
        {
          tipo: {
            in: ["pai-frente", "pai-costas", "ORIXA"],
          },
        },
        {
          tipo: null,
        },
      ],
    };
    const motherEntityWhere = {
      ...where,
      OR: [
        {
          tipo: {
            in: ["mae-frente", "mae-costas", "ORIXA"],
          },
        },
        {
          tipo: null,
        },
      ],
    };

    const [
      fatherFrontEntities,
      fatherBackEntities,
      motherFrontEntities,
      motherBackEntities,
      hierarchies,
      classifications,
    ] = await Promise.all([
      prisma.spiritualEntity.findMany({
        where: fatherEntityWhere,
        orderBy,
        select,
      }),
      prisma.spiritualEntity.findMany({
        where: fatherEntityWhere,
        orderBy,
        select,
      }),
      prisma.spiritualEntity.findMany({
        where: motherEntityWhere,
        orderBy,
        select,
      }),
      prisma.spiritualEntity.findMany({
        where: motherEntityWhere,
        orderBy,
        select,
      }),
      prisma.hierarchy.findMany({
        where,
        orderBy,
        select,
      }),
      prisma.memberClassification.findMany({
        where,
        orderBy,
        select,
      }),
    ]);

    return {
      fatherFrontEntities,
      fatherBackEntities,
      motherFrontEntities,
      motherBackEntities,
      hierarchies,
      classifications,
    };
  }

  async listar(
    templeId: string,
    filters: MemberListFilters = {}
  ) {
    const search = filters.search?.trim();
    const where = {
      templeId,
      deletedAt: null,
      ...(filters.status
        ? {
            status: filters.status,
          }
        : {}),
      ...(filters.workerOnly
        ? {
            OR: [
              {
                classification: {
                  nome: CURRENT_WORKER_CLASSIFICATION,
                },
              },
              {
                memberClassifications: {
                  some: {
                    classification: {
                      nome: CURRENT_WORKER_CLASSIFICATION,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    } satisfies Prisma.MemberWhereInput;

    try {
      const members = await prisma.member.findMany({
        where,
        select: memberListSelect,
        orderBy: {
          nome: "asc",
        },
      });

      if (!search) {
        return members;
      }

      return members.filter((member) =>
        anyIncludesNormalizedSearch(
          [member.nome, member.cpf, member.telefone],
          search
        )
      );
    } catch (error) {
      if (!isMissingMultiRelationsError(error)) {
        throw error;
      }

      const members = await prisma.member.findMany({
        where,
        select: memberLegacyListSelect,
        orderBy: {
          nome: "asc",
        },
      });

      return members.map(withEmptyMultiRelations);
    }
  }

  async contar(templeId: string) {
    const where = {
      templeId,
      deletedAt: null,
      OR: [
        {
          classification: {
            nome: CURRENT_WORKER_CLASSIFICATION,
          },
        },
        {
          memberClassifications: {
            some: {
              classification: {
                nome: CURRENT_WORKER_CLASSIFICATION,
              },
            },
          },
        },
      ],
    } satisfies Prisma.MemberWhereInput;

    const [total, ativos, suspensos, pendentes] =
      await Promise.all([
        prisma.member.count({ where }),
        prisma.member.count({
          where: {
            ...where,
            status: "ACTIVE",
          },
        }),
        prisma.member.count({
          where: {
            ...where,
            status: "SUSPENDED",
          },
        }),
        prisma.member.count({
          where: {
            ...where,
            status: "PENDING",
          },
        }),
      ]);

    return {
      total,
      ativos,
      suspensos,
      pendentes,
    };
  }

  async buscar(id: string, templeId?: string) {
    const where = {
      id,
      ...(templeId ? { templeId } : {}),
      deletedAt: null,
    };

    try {
      return await prisma.member.findFirst({
        where,
        include: memberInclude,
      });
    } catch (error) {
      if (!isMissingMultiRelationsError(error)) {
        throw error;
      }

      const member = await prisma.member.findFirst({
        where,
        include: memberLegacyInclude,
      });

      return member
        ? withEmptyMultiRelations(member)
        : null;
    }
  }

  async criar(
    templeId: string,
    data: MemberInput
  ) {
    const hierarchyIds = normalizeIds(
      data.hierarchyIds
    );
    const classificationIds = normalizeIds(
      data.classificationIds
    );

    try {
      return await prisma.member.create({
        data: {
          templeId,
          ...toMemberData(data),
          memberHierarchies: {
            create:
              buildHierarchyRelationItems(
                hierarchyIds
              ),
          },
          memberClassifications: {
            create:
              buildClassificationRelationItems(
                classificationIds
              ),
          },
        },
        include: memberInclude,
      });
    } catch (error) {
      if (!isMissingMultiRelationsError(error)) {
        throw error;
      }

      const member = await prisma.member.create({
        data: {
          templeId,
          ...toMemberData(data),
        },
        include: memberLegacyInclude,
      });

      return withEmptyMultiRelations(member);
    }
  }

  async atualizar(
    id: string,
    data: MemberInput,
    templeId?: string
  ) {
    const hierarchyIds = normalizeIds(
      data.hierarchyIds
    );
    const classificationIds = normalizeIds(
      data.classificationIds
    );

    const where = {
      ...(templeId
        ? {
            id_templeId: {
              id,
              templeId,
            },
          }
        : { id }),
    };

    try {
      return await prisma.member.update({
        where,
        data: {
          ...toMemberData(data),
          memberHierarchies: {
            deleteMany: {},
            create:
              buildHierarchyRelationItems(
                hierarchyIds
              ),
          },
          memberClassifications: {
            deleteMany: {},
            create:
              buildClassificationRelationItems(
                classificationIds
              ),
          },
        },
        include: memberInclude,
      });
    } catch (error) {
      if (!isMissingMultiRelationsError(error)) {
        throw error;
      }

      const member = await prisma.member.update({
        where,
        data: {
          ...toMemberData(data),
        },
        include: memberLegacyInclude,
      });

      return withEmptyMultiRelations(member);
    }
  }

  async excluir(id: string, templeId?: string) {
    return prisma.member.update({
      where: {
        ...(templeId
          ? {
              id_templeId: {
                id,
                templeId,
              },
            }
          : { id }),
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async atualizarStatus(
    id: string,
    status: "ACTIVE" | "INACTIVE",
    templeId?: string
  ) {
    const now = new Date();

    return prisma.member.update({
      where: {
        ...(templeId
          ? {
              id_templeId: {
                id,
                templeId,
              },
            }
          : { id }),
      },
      data: {
        status,
        ...(status === "INACTIVE"
          ? {
              saidaCentro: now,
            }
          : {
              saidaCentro: null,
            }),
      },
    });
  }
}

export const memberService =
  new MemberService();
