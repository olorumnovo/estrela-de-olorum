import { PaymentStatus } from "@prisma/client";

export function parseSettlementAmount(value: unknown, fallback: number) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[R$]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveOpenStatusByDueDate(vencimento: Date | null | undefined) {
  if (!vencimento) {
    return PaymentStatus.PENDING;
  }

  const now = new Date();
  const dueDate = new Date(vencimento);
  dueDate.setHours(23, 59, 59, 999);

  return dueDate < now ? PaymentStatus.OVERDUE : PaymentStatus.PENDING;
}

export function resolveOpenRawStatus(status: PaymentStatus) {
  if (status === PaymentStatus.OVERDUE) {
    return "Atrasado";
  }

  return "Em aberto";
}
