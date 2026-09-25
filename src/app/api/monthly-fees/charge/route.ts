import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

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

function extractPaymentLink(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const candidates = [
    "paymentLink",
    "payment_link",
    "url",
    "link",
    "shortUrl",
    "short_url",
  ];

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
  const accessToken = data?.access_token;

  if (!accessToken) {
    throw new Error("O Santander não retornou access_token.");
  }

  return accessToken as string;
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
      "A API de cobranca do Santander tambem precisa do Workspace ID da cobranca. Configure SANTANDER_WORKSPACE_ID ou SANTANDER_CHARGE_URL no Vercel."
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
    throw new Error(
      "O Santander respondeu, mas não retornou um link de cobrança utilizável."
    );
  }

  return {
    raw: data,
    paymentLink,
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();

    const member = await prisma.member.findFirst({
      where: {
        id: body.memberId,
        templeId: user.templeId,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        cpf: true,
        whatsapp: true,
        telefone: true,
      },
    });

    if (!member) {
      return ApiResponse.notFound("Membro não encontrado.");
    }

    const phone = digitsOnly(member.whatsapp || member.telefone || "");

    if (!phone) {
      return ApiResponse.error("Este membro não possui WhatsApp ou telefone cadastrado.");
    }

    const baseAmount = Number(body.baseAmount || 0);
    const discountAmount = Number(body.discountAmount || 0);
    const surchargeAmount = Number(body.surchargeAmount || 0);
    const finalAmount = Math.max(0, baseAmount - discountAmount + surchargeAmount);

    if (!finalAmount) {
      return ApiResponse.error("O valor final da cobrança precisa ser maior que zero.");
    }

    const dueDate = String(body.dueDate || "2026-08-10").slice(0, 10);
    const mensalidade = String(body.mensalidade || "Mensalidade Corrente");
    const curso = String(body.curso || "-");
    const chargeDescription = `${mensalidade}${curso && curso !== "-" ? ` - ${curso}` : ""}`;

    const charge = await createSantanderCharge({
      memberName: member.nome,
      memberDocument: member.cpf || null,
      amount: finalAmount,
      dueDate,
      description: chargeDescription,
    });

    const message = [
      `Ola ${member.nome},`,
      `segue o link da sua cobranca referente a ${mensalidade}.`,
      curso && curso !== "-" ? `Curso: ${curso}.` : "",
      `Valor final: ${money(finalAmount)}.`,
      `Vencimento: ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${dueDate}T12:00:00`))}.`,
      charge.paymentLink,
    ]
      .filter(Boolean)
      .join(" ");

    const whatsappUrl = `https://web.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(message)}`;

    return ApiResponse.success({
      paymentLink: charge.paymentLink,
      whatsappUrl,
      amount: finalAmount,
      dueDate,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
