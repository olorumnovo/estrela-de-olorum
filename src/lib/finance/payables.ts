import { PaymentStatus } from "@prisma/client";

export const sourcePageValues = [
  "TODAS",
  "EM_ABERTO",
  "EMITIDAS",
  "PAGAS",
  "ATRASADAS",
] as const;

export type SourcePage = (typeof sourcePageValues)[number];

export function resolveTransactionSourcePages(status: PaymentStatus) {
  const pages: SourcePage[] = ["TODAS", "EMITIDAS"];

  if (status === "PAID") {
    pages.push("PAGAS");
  }

  if (status === "PENDING") {
    pages.push("EM_ABERTO");
  }

  if (status === "OVERDUE") {
    pages.push("EM_ABERTO", "ATRASADAS");
  }

  return [...new Set(pages)];
}

export const payableSourcePageValues = sourcePageValues;
export type PayableSourcePage = SourcePage;
export const resolveExpenseSourcePages = resolveTransactionSourcePages;
