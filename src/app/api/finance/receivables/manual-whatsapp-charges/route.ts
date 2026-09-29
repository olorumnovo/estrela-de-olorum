import { NextRequest } from "next/server";

import { requirePermission } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { cancelManualCharge, enqueueManualCharges, listManualChargeJobs, parseChargeAmount } from "@/lib/finance/manual-charge-queue";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "financeiro.visualizar");
    return ApiResponse.success({ jobs: await listManualChargeJobs(user.templeId) });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "financeiro.criar");
    const body = await req.json();
    if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 100) {
      return ApiResponse.error("Selecione de 1 a 100 contas atrasadas.");
    }
    const entries = body.entries.map((entry: unknown) => {
      const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return { transactionId: typeof row.transactionId === "string" ? row.transactionId : "", amountOverride: parseChargeAmount(row.amountOverride) };
    });
    if (entries.some((entry: { transactionId: string; amountOverride: number | null }) => !entry.transactionId || (entry.amountOverride !== null && !Number.isFinite(entry.amountOverride)))) {
      return ApiResponse.error("Há uma conta ou valor personalizado inválido.");
    }
    const queued = await enqueueManualCharges(user.templeId, entries);
    return ApiResponse.success({ queued: queued.length, jobs: queued });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") return ApiResponse.serverError(message);
    return ApiResponse.error(message, 409);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePermission(req, "financeiro.criar");
    const body = await req.json();
    if (typeof body.id !== "string" || !body.id) return ApiResponse.error("Informe a cobrança da fila.");
    const canceled = await cancelManualCharge(user.templeId, body.id);
    if (!canceled) return ApiResponse.error("A cobrança já saiu da fila ou não foi encontrada.", 409);
    return ApiResponse.success({ canceled: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
