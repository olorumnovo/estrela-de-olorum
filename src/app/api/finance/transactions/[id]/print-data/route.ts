import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const fallbackIssuer = {
  nome: "TENDA DE UMBANDA ESTRELA DE OLORUM",
  cnpj: "48.628.461/0001-30",
  ie: "ISENTO",
  endereco: "RUA GOMES, 92",
  cidadeEstadoCep: "SÃO PAULO - SP - 03.373-120",
  telefone: "(11) 99999-5497",
  email: "contato@olorum.com.br",
  website: "https://estreladeolorum.com.br/",
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const transaction = await prisma.financialTransaction.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
      include: {
        category: true,
        temple: {
          select: {
            nome: true,
            cnpj: true,
            email: true,
            telefone: true,
          },
        },
      },
    });

    if (!transaction) {
      return ApiResponse.notFound("Lançamento não encontrado.");
    }

    let memberData: null | {
      nome: string;
      cpf: string | null;
      endereco: string | null;
      numero: string | null;
      complemento: string | null;
      bairro: string | null;
      cidade: string | null;
      estado: string | null;
      cep: string | null;
    } = null;

    if (transaction.externalSource === "monthly_fee" && transaction.externalId) {
      const monthlyFee = await prisma.monthlyFee.findFirst({
        where: {
          id: transaction.externalId,
          templeId: user.templeId,
          deletedAt: null,
        },
        include: {
          member: {
            select: {
              nome: true,
              cpf: true,
              endereco: true,
              numero: true,
              complemento: true,
              bairro: true,
              cidade: true,
              estado: true,
              cep: true,
            },
          },
        },
      });

      if (monthlyFee?.member) {
        memberData = monthlyFee.member;
      }
    }

    return ApiResponse.success(
      serialize({
        transaction,
        issuer: {
          nome: transaction.temple?.nome || fallbackIssuer.nome,
          cnpj: transaction.temple?.cnpj || fallbackIssuer.cnpj,
          ie: fallbackIssuer.ie,
          endereco: fallbackIssuer.endereco,
          cidadeEstadoCep: fallbackIssuer.cidadeEstadoCep,
          telefone: transaction.temple?.telefone || fallbackIssuer.telefone,
          email: transaction.temple?.email || fallbackIssuer.email,
          website: fallbackIssuer.website,
        },
        customer: memberData
          ? {
              nome: memberData.nome,
              cpf: memberData.cpf,
              endereco: memberData.endereco,
              numero: memberData.numero,
              complemento: memberData.complemento,
              bairro: memberData.bairro,
              cidade: memberData.cidade,
              estado: memberData.estado,
              cep: memberData.cep,
            }
          : {
              nome: transaction.centroCusto || "Cliente não informado",
              cpf: null,
              endereco: null,
              numero: null,
              complemento: null,
              bairro: null,
              cidade: null,
              estado: null,
              cep: null,
            },
      })
    );
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
