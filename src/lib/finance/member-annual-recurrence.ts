import { PaymentStatus, Prisma } from "@prisma/client";

import { resolveTransactionSourcePages } from "@/lib/finance/payables";
import { prisma } from "@/lib/prisma";

const START = "[CADASTRO_EXTENDIDO_JSON]";
const END = "[/CADASTRO_EXTENDIDO_JSON]";
const SOURCE = "member_annual_recurrence";

export type AnnualTemplate = {
  month: number;
  description: string;
  amount: string;
  day: number;
  categoryId: string;
};

export type AnnualRecurrence = {
  enabled: boolean;
  templates: AnnualTemplate[];
  lastGeneratedYear?: number;
};

export function readAnnualRecurrence(observations: string | null): AnnualRecurrence | null {
  const start = observations?.indexOf(START) ?? -1;
  const end = observations?.indexOf(END, start + START.length) ?? -1;
  if (!observations || start < 0 || end < 0) return null;
  try {
    const extended = JSON.parse(observations.slice(start + START.length, end)) as Record<string, unknown>;
    const value = extended.annualRecurrence;
    if (!value || typeof value !== "object") return null;
    const recurrence = value as AnnualRecurrence;
    return typeof recurrence.enabled === "boolean" && Array.isArray(recurrence.templates) ? recurrence : null;
  } catch {
    return null;
  }
}

export function writeAnnualRecurrence(observations: string | null, recurrence: AnnualRecurrence): string {
  const source = observations || "";
  const start = source.indexOf(START);
  const end = source.indexOf(END, start + START.length);
  if (start < 0 || end < 0) {
    return `${source.trim()}\n\n${START}${JSON.stringify({ annualRecurrence: recurrence })}${END}`.trim();
  }
  const extended = JSON.parse(source.slice(start + START.length, end)) as Record<string, unknown>;
  extended.annualRecurrence = recurrence;
  return `${source.slice(0, start + START.length)}${JSON.stringify(extended)}${source.slice(end)}`;
}

function monthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

export async function captureMemberAnnualTemplates(templeId: string, memberId: string, memberName: string, year: number) {
  const rows = await prisma.financialTransaction.findMany({
    where: {
      templeId, deletedAt: null, tipo: "INCOME", centroCusto: { equals: memberName, mode: "insensitive" },
      descricao: { contains: "mensalidade", mode: "insensitive" },
      vencimento: { gte: monthStart(year, 1), lt: monthStart(year + 1, 1) },
      OR: [{ externalSource: null }, { externalSource: { not: SOURCE } }],
    },
    select: { id: true, descricao: true, valor: true, vencimento: true, categoryId: true, externalSource: true, externalId: true },
  });
  const feeIds = rows.filter((row) => row.externalSource === "monthly_fee" && row.externalId).map((row) => row.externalId as string);
  const ownFees = feeIds.length ? await prisma.monthlyFee.findMany({
    where: { templeId, memberId, id: { in: feeIds }, deletedAt: null }, select: { id: true },
  }) : [];
  const ownFeeIds = new Set(ownFees.map((fee) => fee.id));
  const candidates = rows.filter((row) => row.externalSource !== "monthly_fee" || (row.externalId && ownFeeIds.has(row.externalId)));
  const templates: AnnualTemplate[] = [];
  const missing: number[] = [];
  const ambiguous: number[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const matches = candidates.filter((row) => row.vencimento?.getUTCMonth() === month - 1);
    // A synchronized copy of the same monthly fee is not a second charge template.
    const preferred = matches.filter((row) => row.externalSource !== "monthly_fee");
    const actual = preferred.length ? preferred : matches;
    if (actual.length === 0) { missing.push(month); continue; }
    if (actual.length > 1) { ambiguous.push(month); continue; }
    const row = actual[0];
    if (!row.vencimento || Number(row.valor) <= 0) { missing.push(month); continue; }
    templates.push({ month, description: row.descricao, amount: row.valor.toString(), day: row.vencimento.getUTCDate(), categoryId: row.categoryId });
  }
  if (missing.length || ambiguous.length) {
    return { templates: null, missing, ambiguous };
  }
  return { templates, missing, ambiguous };
}

export async function generateMemberAnnualReceivables(args: {
  templeId: string;
  memberId: string;
  memberName: string;
  year: number;
  templates: AnnualTemplate[];
}) {
  const { templeId, memberId, memberName, year, templates } = args;
  if (templates.length !== 12 || new Set(templates.map((item) => item.month)).size !== 12) throw new Error("Recorrência sem 12 mensalidades válidas.");
  const existing = await prisma.financialTransaction.findMany({
    where: { templeId, deletedAt: null, tipo: "INCOME", centroCusto: { equals: memberName, mode: "insensitive" }, vencimento: { gte: monthStart(year, 1), lt: monthStart(year + 1, 1) } },
    select: { vencimento: true, descricao: true },
  });
  const categoryIds = [...new Set(templates.map((item) => item.categoryId))];
  const categories = await prisma.financialCategory.findMany({ where: { id: { in: categoryIds }, templeId, deletedAt: null }, select: { id: true } });
  if (categories.length !== categoryIds.length) throw new Error("Uma ou mais categorias das mensalidades não estão disponíveis.");
  const existingFees = await prisma.monthlyFee.findMany({
    where: { templeId, memberId, deletedAt: null, vencimento: { gte: monthStart(year, 1), lt: monthStart(year + 1, 1) } },
    select: { vencimento: true },
  });
  let created = 0;
  let skipped = 0;
  for (const template of templates) {
    const dueDate = new Date(Date.UTC(year, template.month - 1, Math.min(template.day, new Date(Date.UTC(year, template.month, 0)).getUTCDate()), 12));
    const alreadyExists = existing.some((row) => row.vencimento?.getUTCMonth() === template.month - 1 && row.descricao.toLocaleLowerCase("pt-BR").includes("mensalidade")) || existingFees.some((fee) => fee.vencimento.getUTCMonth() === template.month - 1);
    if (alreadyExists) { skipped += 1; continue; }
    const externalId = `${memberId}:${year}:${String(template.month).padStart(2, "0")}`;
    const result = await prisma.financialTransaction.createMany({
      data: [{
        templeId, categoryId: template.categoryId, descricao: template.description, centroCusto: memberName,
        tipo: "INCOME", valor: new Prisma.Decimal(template.amount), status: PaymentStatus.PENDING,
        rawStatus: "Em aberto", amountPaid: new Prisma.Decimal(0), vencimento: dueDate,
        competencia: monthStart(year, template.month), issuedAt: monthStart(year, template.month),
        sourcePages: resolveTransactionSourcePages(PaymentStatus.PENDING),
        externalSource: SOURCE, externalId,
        observacoes: `Recorrência anual do cadastro ${memberId}`,
      }], skipDuplicates: true,
    });
    if (result.count) created += 1; else skipped += 1;
  }
  return { created, skipped };
}

export async function processAnnualMemberRecurrences(templeId: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (month < 11) return { processed: 0, created: 0, failed: 0 };
  const members = await prisma.member.findMany({ where: { templeId, deletedAt: null, status: "ACTIVE" }, select: { id: true, nome: true, observacoes: true } });
  let processed = 0;
  let created = 0;
  let failed = 0;
  for (const member of members) {
    const recurrence = readAnnualRecurrence(member.observacoes);
    if (!recurrence?.enabled || (recurrence.lastGeneratedYear || 0) >= year + 1) continue;
    try {
      const result = await generateMemberAnnualReceivables({ templeId, memberId: member.id, memberName: member.nome, year: year + 1, templates: recurrence.templates });
      created += result.created;
      processed += 1;
      await prisma.member.updateMany({
        where: { id: member.id, templeId, observacoes: member.observacoes },
        data: { observacoes: writeAnnualRecurrence(member.observacoes, { ...recurrence, lastGeneratedYear: year + 1 }) },
      });
    } catch {
      failed += 1;
    }
  }
  return { processed, created, failed };
}
