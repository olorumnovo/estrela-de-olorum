import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getSantanderBaseUrl() {
  if (process.env.SANTANDER_API_BASE_URL) {
    return process.env.SANTANDER_API_BASE_URL;
  }

  return process.env.SANTANDER_ENVIRONMENT === "production"
    ? "https://trust-open.api.santander.com.br"
    : "https://trust-sandbox.api.santander.com.br";
}

function getSantanderTokenUrl() {
  return `${getSantanderBaseUrl()}/auth/oauth/v2/token`;
}

function getSantanderChargeUrl() {
  if (process.env.SANTANDER_CHARGE_URL) {
    return process.env.SANTANDER_CHARGE_URL;
  }

  const workspaceId = process.env.SANTANDER_WORKSPACE_ID;

  if (!workspaceId) {
    return null;
  }

  return `${getSantanderBaseUrl()}/collection_bill_management/v2/workspaces/${workspaceId}/bank_slips`;
}

function extractPaymentLink(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const candidates = ["paymentLink", "payment_link", "url", "link", "shortUrl", "short_url"];

  for (const key of candidates) {
    if (key in data && typeof (data as Record<string, unknown>)[key] === "string") {
      return String((data as Record<string, unknown>)[key]);
    }
  }

  if ("data" in data && data.data && typeof data.data === "object") {
    return extractPaymentLink(data.data);
  }

  return null;
}

async function fetchSantanderAccessToken() {
  const clientId = process.env.SANTANDER_CLIENT_ID;
  const clientSecret = process.env.SANTANDER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Configure SANTANDER_CLIENT_ID e SANTANDER_CLIENT_SECRET.");
  }

  const response = await fetch(getSantanderTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Falha ao autenticar no Santander (${response.status}). ${errorText || ""}`.trim()
    );
  }

  const data = await response.json();

  if (!data?.access_token) {
    throw new Error("O Santander não retornou access_token.");
  }

  return String(data.access_token);
}

async function createSantanderCharge(payload: {
  memberName: string;
  memberDocument?: string | null;
  amount: number;
  dueDate: string;
  description: string;
}) {
  const chargeUrl = getSantanderChargeUrl();
  const clientId = process.env.SANTANDER_CLIENT_ID;

  if (!chargeUrl) {
    throw new Error(
      "Configure SANTANDER_WORKSPACE_ID ou SANTANDER_CHARGE_URL para emitir cobranças."
    );
  }

  const accessToken = await fetchSantanderAccessToken();
  const response = await fetch(chargeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(clientId
        ? {
            "X-Application-Key": clientId,
          }
        : {}),
    },
    body: JSON.stringify({
      payer: {
        name: payload.memberName,
        document: payload.memberDocument || undefined,
      },
      amount: Number(payload.amount.toFixed(2)),
      dueDate: payload.dueDate,
      description: payload.description,
    }),
  });

  const responseText = await response.text();
  let data: unknown = null;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    throw new Error(
      `Falha ao gerar cobrança no Santander (${response.status}). ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  const paymentLink = extractPaymentLink(data);

  if (!paymentLink) {
    throw new Error("O Santander respondeu, mas não retornou um link de cobrança utilizável.");
  }

  return paymentLink;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const transaction = await prisma.financialTransaction.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
    });

    if (!transaction) {
      return ApiResponse.notFound("Conta a receber não encontrada.");
    }

    if (transaction.tipo !== "INCOME") {
      return ApiResponse.error("A cobrança só pode ser emitida para contas a receber.", 409);
    }

    if (transaction.externalSource !== "monthly_fee" || !transaction.externalId) {
      return ApiResponse.error(
        "Emitir cobrança está disponível somente para mensalidades vinculadas a membros.",
        409
      );
    }

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
            whatsapp: true,
            telefone: true,
          },
        },
      },
    });

    if (!monthlyFee) {
      return ApiResponse.notFound("Mensalidade vinculada não encontrada.");
    }

    const phone = digitsOnly(monthlyFee.member.whatsapp || monthlyFee.member.telefone || "");

    if (!phone) {
      return ApiResponse.error("Este membro não possui WhatsApp ou telefone cadastrado.");
    }

    const amount = Number(transaction.valor || 0);

    if (amount <= 0) {
      return ApiResponse.error("O valor da cobrança precisa ser maior que zero.");
    }

    const dueDate = transaction.vencimento
      ? new Date(transaction.vencimento).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const description = String(transaction.descricao || "Cobrança de mensalidade");
    const paymentLink = await createSantanderCharge({
      memberName: monthlyFee.member.nome,
      memberDocument: monthlyFee.member.cpf || null,
      amount,
      dueDate,
      description,
    });

    const message = [
      `Olá ${monthlyFee.member.nome},`,
      `segue o link da sua cobrança referente a ${description}.`,
      `Valor: ${money(amount)}.`,
      `Vencimento: ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${dueDate}T12:00:00`))}.`,
      paymentLink,
    ].join(" ");

    return ApiResponse.success({
      paymentLink,
      whatsappUrl: `https://web.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(message)}`,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
