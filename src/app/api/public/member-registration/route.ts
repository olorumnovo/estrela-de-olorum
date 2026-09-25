import { NextRequest } from "next/server";
import { z } from "zod";

import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { memberService } from "@/modules/members";

const publicMemberSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo."),
  rg: z.string().trim().min(1, "Informe o RG."),
  cpfCnpj: z.string().trim().min(1, "Informe o CPF."),
  dataNascimento: z.string().min(1, "Informe a data de nascimento."),
  estadoCivil: z.string().trim().optional().default(""),
  email: z.string().email("Informe um e-mail válido."),
  celular: z.string().trim().min(1, "Informe o telefone celular."),
  cep: z.string().trim().min(1, "Informe o CEP."),
  endereco: z.string().trim().min(1, "Informe o endereço."),
  numero: z.string().trim().min(1, "Informe o número."),
  complemento: z.string().trim().optional().default(""),
  bairro: z.string().trim().min(1, "Informe o bairro."),
  cidade: z.string().trim().min(1, "Informe a cidade."),
  estado: z.string().trim().min(2, "Informe o estado."),
  foto: z.string().trim().optional().default(""),
  desejo: z.string().trim().min(1, "Informe o que você deseja."),
  experienciaTerreiro: z.string().trim().min(1, "Informe sua experiência em outro terreiro."),
});

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const data = publicMemberSchema.parse(
      await req.json()
    );
    const cpfDigits = onlyDigits(data.cpfCnpj);
    const rgDigits = onlyDigits(data.rg);

    const temple = await prisma.temple.findFirst({
      where: {
        ativo: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!temple) {
      return ApiResponse.error(
        "Nenhum templo disponível para cadastro."
      );
    }

    const duplicateConditions = [
      { cpf: data.cpfCnpj },
      { rg: data.rg },
      ...(cpfDigits ? [
        { cpf: cpfDigits },
        {
          cpf: {
            contains: cpfDigits,
          },
        },
      ] : []),
      ...(rgDigits ? [
        { rg: rgDigits },
        {
          rg: {
            contains: rgDigits,
          },
        },
      ] : []),
    ];

    const possibleDuplicate = await prisma.member.findFirst({
      where: {
        templeId: temple.id,
        deletedAt: null,
        OR: duplicateConditions,
      },
      select: {
        id: true,
        cpf: true,
        rg: true,
      },
    });

    if (possibleDuplicate) {
      return ApiResponse.error(
        "Já existe um cadastro com este CPF ou RG. Não é possível enviar um novo cadastro.",
        409
      );
    }

    const member = await memberService.criar(temple.id, {
      nome: data.nome,
      rg: data.rg,
      cpfCnpj: data.cpfCnpj,
      dataNascimento: data.dataNascimento,
      estadoCivil: data.estadoCivil,
      email: data.email,
      cep: data.cep,
      endereco: data.endereco,
      numero: data.numero,
      complemento: data.complemento,
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado,
      hierarchyIds: [""],
      classificationIds: [""],
      dataEntrada: "",
      dataSaida: "",
      entidadePai1: "",
      entidadePai2: "",
      entidadeMae1: "",
      entidadeMae2: "",
      observacoes: [
        "Cadastro recebido pelo link direto.",
        `O que deseja: ${data.desejo}`,
        `Já trabalhou ou trabalha em outro Terreiro: ${data.experienciaTerreiro}`,
      ].join("\n"),
      sexo: "",
      celular: data.celular,
      foto: data.foto || null,
      status: "PENDING",
    });

    return ApiResponse.created({
      success: true,
      id: member.id,
    });
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}
