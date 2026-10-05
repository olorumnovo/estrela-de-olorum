import { NextRequest } from "next/server";

import { requirePermission } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { captureMemberAnnualTemplates, generateMemberAnnualReceivables, readAnnualRecurrence, writeAnnualRecurrence } from "@/lib/finance/member-annual-recurrence";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission(req, "financeiro.criar");
    const { id } = await params;
    const body = await req.json();
    if (typeof body.enabled !== "boolean") return ApiResponse.error("Informe se a recorrência deve ser ativada ou pausada.");
    const member = await prisma.member.findFirst({ where: { id, templeId: user.templeId, deletedAt: null }, select: { id: true, nome: true, status: true, observacoes: true } });
    if (!member) return ApiResponse.notFound("Membro não encontrado.");
    const previous = readAnnualRecurrence(member.observacoes);
    if (!body.enabled) {
      const recurrence = { enabled: false, templates: previous?.templates || [], lastGeneratedYear: previous?.lastGeneratedYear };
      const updated = await prisma.member.updateMany({ where: { id: member.id, templeId: user.templeId, observacoes: member.observacoes }, data: { observacoes: writeAnnualRecurrence(member.observacoes, recurrence) } });
      if (updated.count !== 1) return ApiResponse.error("O cadastro foi alterado durante a operação. Atualize a página e tente novamente.", 409);
      return ApiResponse.success({ enabled: false, message: "Recorrência pausada. Contas já criadas foram mantidas." });
    }
    if (member.status !== "ACTIVE") return ApiResponse.error("Ative o cadastro do membro antes de ativar a recorrência.");
    if (previous?.enabled) return ApiResponse.success({ enabled: true, lastGeneratedYear: previous.lastGeneratedYear, message: "Recorrência já está ativa." });
    const sameNameCount = await prisma.member.count({ where: { templeId: user.templeId, deletedAt: null, nome: { equals: member.nome, mode: "insensitive" } } });
    if (sameNameCount > 1) return ApiResponse.error("Há mais de um cadastro com este nome. Não é seguro identificar a qual membro pertencem as contas a receber; diferencie os nomes antes de ativar.", 409);
    const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
    const captured = await captureMemberAnnualTemplates(user.templeId, member.id, member.nome, year);
    if (!captured.templates) {
      const parts = [
        captured.missing.length ? `sem mensalidade em ${captured.missing.map((month) => String(month).padStart(2, "0")).join(", ")}` : "",
        captured.ambiguous.length ? `com mais de uma mensalidade em ${captured.ambiguous.map((month) => String(month).padStart(2, "0")).join(", ")}` : "",
      ].filter(Boolean);
      return ApiResponse.error(`Não é possível ativar: o ano ${year} precisa ter exatamente uma mensalidade por mês para este membro (${parts.join("; ")}). Nenhuma conta foi criada.`, 409);
    }
    const result = await generateMemberAnnualReceivables({ templeId: user.templeId, memberId: member.id, memberName: member.nome, year: year + 1, templates: captured.templates });
    const recurrence = { enabled: true, templates: captured.templates, lastGeneratedYear: year + 1 };
    const updated = await prisma.member.updateMany({ where: { id: member.id, templeId: user.templeId, observacoes: member.observacoes }, data: { observacoes: writeAnnualRecurrence(member.observacoes, recurrence) } });
    if (updated.count !== 1) return ApiResponse.error("As contas foram conferidas, mas o cadastro mudou durante a operação. Atualize a página e tente novamente.", 409);
    return ApiResponse.success({ enabled: true, year: year + 1, ...result });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
