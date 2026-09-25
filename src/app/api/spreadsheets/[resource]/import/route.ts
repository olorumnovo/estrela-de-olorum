import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { MemberStatus, PaymentMethod, PaymentStatus, Prisma, SaleStatus, ScheduleStatus, ScheduleType, TransactionType } from "@prisma/client";

import { requirePermission } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { resolveTransactionSourcePages } from "@/lib/finance/payables";
import { prisma } from "@/lib/prisma";
import { normalizeProductName } from "@/lib/products";
import { ApiResponse } from "@/lib/response";
import { isSpreadsheetResource } from "@/lib/spreadsheets/templates";

type Row = Record<string, unknown>;
type Result = { line: number; status: "new" | "duplicate" | "error"; reason?: string };

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function field(row: Row, ...aliases: string[]) {
  const keys = new Map(Object.keys(row).map((key) => [normalize(key).replace(/[^a-z0-9]/g, ""), key]));
  for (const alias of aliases) {
    const key = keys.get(normalize(alias).replace(/[^a-z0-9]/g, ""));
    if (key) return String(row[key] ?? "").trim();
  }
  return "";
}

function money(value: string) {
  const clean = value.replace(/[R$\s]/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, "") : clean;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function nonnegativeMoney(value: string) {
  const clean = value.replace(/[R$\s]/g, "");
  if (!clean) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(clean) && !/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(clean)) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, "") : clean;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 99999999.99 ? Math.round(amount * 100) / 100 : null;
}

function dateKey(value: string) {
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const key = br
    ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
    : iso
      ? `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
      : "";
  if (!key) return null;
  const date = new Date(`${key}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : key;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function importId(resource: string, templeId: string, key: string) {
  const value = hash(`${resource}:${templeId}:${key}`).slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function report(results: Result[]) {
  return {
    total: results.length,
    ready: results.filter((item) => item.status === "new").length,
    duplicate: results.filter((item) => item.status === "duplicate").length,
    errors: results.filter((item) => item.status === "error"),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params;
    if (!isSpreadsheetResource(resource)) return ApiResponse.error("Tipo de planilha inválido.", 404);
    const permission = resource === "payables" || resource === "receivables" ? "financeiro.criar" : resource === "products" ? "estoque.criar" : "administrador.total";
    const user = await requirePermission(req, permission);
    const body = await req.json();
    const rows: Row[] = body.rows;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000 || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      return ApiResponse.error("A planilha deve conter entre 1 e 5.000 linhas válidas.");
    }

    const results: Result[] = [];
    const memberData: Prisma.MemberCreateManyInput[] = [];
    const memberLinks = new Map<string, string[]>();
    const financeData: Prisma.FinancialTransactionCreateManyInput[] = [];
    const scheduleData: Prisma.ScheduleCreateManyInput[] = [];
    const saleData: Prisma.SaleCreateManyInput[] = [];
    const productData: Prisma.ProductCreateManyInput[] = [];
    const seen = new Set<string>();

    if (resource === "members") {
      const requestedCpfs = rows.map((row) => field(row, "CPF", "CPF/CNPJ").replace(/\D/g, "")).filter(Boolean);
      const [existing, cpfOwners, classifications, hierarchies] = await Promise.all([
        prisma.member.findMany({ where: { templeId: user.templeId, deletedAt: null }, select: { nome: true, cpf: true, nascimento: true, whatsapp: true, telefone: true } }),
        prisma.member.findMany({ where: { cpf: { in: requestedCpfs } }, select: { cpf: true } }),
        prisma.memberClassification.findMany({ where: { templeId: user.templeId, ativo: true }, select: { id: true, nome: true } }),
        prisma.hierarchy.findMany({ where: { templeId: user.templeId }, select: { id: true, nome: true } }),
      ]);
      const cpfs = new Set(cpfOwners.map((member) => (member.cpf || "").replace(/\D/g, "")).filter(Boolean));
      const identities = new Set(existing.flatMap((member) => {
        const name = normalize(member.nome);
        const contact = (member.whatsapp || member.telefone || "").replace(/\D/g, "");
        return [
          member.nascimento ? `birth:${name}:${member.nascimento.toISOString().slice(0, 10)}` : "",
          contact ? `contact:${name}:${contact}` : "",
        ].filter(Boolean);
      }));
      for (const [index, row] of rows.entries()) {
        const nome = field(row, "Nome");
        const cpf = field(row, "CPF", "CPF/CNPJ").replace(/\D/g, "") || null;
        const nascimentoText = field(row, "Nascimento", "Data de nascimento");
        const nascimento = nascimentoText ? dateKey(nascimentoText) : null;
        const classificationNames = field(row, "Classificação", "Classificações").split("|").map((name) => name.trim()).filter(Boolean);
        const hierarchyName = field(row, "Hierarquia");
        const linkedClassifications = classificationNames.map((name) => classifications.find((item) => normalize(item.nome) === normalize(name)));
        const classification = linkedClassifications[0];
        const hierarchy = hierarchyName ? hierarchies.find((item) => normalize(item.nome) === normalize(hierarchyName)) : null;
        const statusText = field(row, "Status", "Situação").toUpperCase();
        const status = statusText === "INATIVO" ? "INACTIVE" : statusText === "ATIVO" ? "ACTIVE" : statusText || "ACTIVE";
        const contact = field(row, "WhatsApp", "Celular", "Telefone", "Contato").replace(/\D/g, "");
        const identity = cpf ? `cpf:${cpf}` : nascimento ? `birth:${normalize(nome)}:${nascimento}` : contact ? `contact:${normalize(nome)}:${contact}` : "";
        if (nome.length < 3 || !identity || (cpf && cpf.length !== 11 && cpf.length !== 14) || (nascimentoText && !nascimento) || linkedClassifications.some((item) => !item) || (hierarchyName && !hierarchy) || !Object.values(MemberStatus).includes(status as MemberStatus)) {
          results.push({ line: index + 2, status: "error", reason: "Verifique nome, CPF, nascimento, contato, classificação, hierarquia e status. Sem CPF, informe nascimento ou contato para identificar duplicatas." });
          continue;
        }
        if ((cpf && cpfs.has(cpf)) || (!cpf && identities.has(identity)) || seen.has(identity)) {
          results.push({ line: index + 2, status: "duplicate" });
          continue;
        }
        seen.add(identity);
        if (cpf) cpfs.add(cpf);
        if (nascimento) identities.add(`birth:${normalize(nome)}:${nascimento}`);
        if (contact) identities.add(`contact:${normalize(nome)}:${contact}`);
        const id = importId(resource, user.templeId, cpf || identity);
        memberData.push({
          id,
          templeId: user.templeId, nome, cpf, nascimento: nascimento ? new Date(`${nascimento}T12:00:00.000Z`) : null,
          telefone: field(row, "Telefone", "Contato") || null,
          whatsapp: field(row, "WhatsApp", "Celular") || null,
          email: field(row, "E-mail", "Email") || null,
          cidade: field(row, "Cidade") || null, estado: field(row, "Estado", "UF") || null,
          status: status as MemberStatus,
          classificationId: classification?.id || null, hierarchyId: hierarchy?.id || null,
        });
        memberLinks.set(id, [...new Set(linkedClassifications.flatMap((item) => item ? [item.id] : []))]);
        results.push({ line: index + 2, status: "new" });
      }
    } else if (resource === "receivables" || resource === "payables") {
      const tipo = resource === "receivables" ? TransactionType.INCOME : TransactionType.EXPENSE;
      const [existing, categories] = await Promise.all([
        prisma.financialTransaction.findMany({ where: { templeId: user.templeId, deletedAt: null, tipo }, select: { descricao: true, centroCusto: true, documentNumber: true, vencimento: true, valor: true } }),
        prisma.financialCategory.findMany({ where: { templeId: user.templeId, deletedAt: null, ativo: true }, select: { id: true, nome: true } }),
      ]);
      const keyFor = (document: string, name: string, due: string, amount: number, history: string) =>
        `${normalize(document)}|${normalize(name)}|${due}|${amount.toFixed(2)}|${normalize(history)}`;
      const existingKeys = new Set(existing.map((item) => keyFor(item.documentNumber || "", item.centroCusto || "", item.vencimento?.toISOString().slice(0, 10) || "", Number(item.valor), item.descricao)));
      const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      for (const [index, row] of rows.entries()) {
        const document = field(row, "Documento", "Nº documento", "Numero documento");
        const name = field(row, resource === "receivables" ? "Cliente" : "Fornecedor", "Nome");
        const history = field(row, "Histórico", "Descricao");
        const categoryName = field(row, "Categoria");
        const importedStatus = normalize(field(row, "Status"));
        const category = categories.find((item) => normalize(item.nome) === normalize(categoryName));
        const issuedText = field(row, "Data emissão", "Emissão");
        const issued = issuedText ? dateKey(issuedText) : null;
        const competenceText = field(row, "Competência");
        const competence = competenceText ? dateKey(competenceText) : null;
        const due = dateKey(field(row, "Vencimento"));
        const amount = money(field(row, "Valor"));
        const paidAmount = money(field(row, "Pago", "Recebido"));
        const remainingText = field(row, "Saldo");
        const remainingAmount = money(remainingText);
        if (!name || !history || !category || !issued || !due || amount === null || (competenceText && !competence) || paidAmount !== null || (remainingText && (remainingAmount === null || remainingAmount < amount)) || (importedStatus && !["em aberto", "pendente", "atrasado", "atrasada", "overdue", "pending", "emitida", "emitido"].includes(importedStatus))) {
          results.push({ line: index + 2, status: "error", reason: "Informe nome, histórico, categoria existente, data de emissão, vencimento e valor positivo. Contas pagas/parciais não podem ser importadas como abertas." });
          continue;
        }
        const key = keyFor(document, name, due, amount, history);
        if (existingKeys.has(key) || seen.has(key)) {
          results.push({ line: index + 2, status: "duplicate" });
          continue;
        }
        seen.add(key);
        const status = due < todayKey ? PaymentStatus.OVERDUE : PaymentStatus.PENDING;
        financeData.push({
          templeId: user.templeId, categoryId: category.id, descricao: history, centroCusto: name,
          tipo, valor: amount, status, sourcePages: resolveTransactionSourcePages(status),
          issuedAt: new Date(`${issued}T00:00:00.000Z`),
          competencia: competence ? new Date(`${competence}T00:00:00.000Z`) : null,
          documentNumber: document || null, vencimento: new Date(`${due}T00:00:00.000Z`),
          observacoes: field(row, "Observações") || null,
          externalSource: `planilha:${resource}`, externalId: hash(key),
        });
        results.push({ line: index + 2, status: "new" });
      }
    } else if (resource === "activities") {
      const existing = await prisma.schedule.findMany({ where: { templeId: user.templeId, deletedAt: null }, select: { titulo: true, tipo: true, inicio: true } });
      const keys = new Set(existing.map((item) => `${normalize(item.titulo)}|${item.tipo}|${item.inicio.toISOString().slice(0, 10)}`));
      for (const [index, row] of rows.entries()) {
        const title = field(row, "Título", "Titulo");
        const tipo = field(row, "Categoria", "Tipo").toUpperCase().replace(/\s+/g, "_") || "EVENTO";
        const statusText = field(row, "Status").toUpperCase().replace(/\s+/g, "_") || "AGENDADO";
        const day = dateKey(field(row, "Data do evento", "Data", "Início"));
        if (!title || !day || !Object.values(ScheduleType).includes(tipo as ScheduleType) || !Object.values(ScheduleStatus).includes(statusText as ScheduleStatus)) {
          results.push({ line: index + 2, status: "error", reason: "Verifique título, data, categoria e status da atividade." });
          continue;
        }
        const key = `${normalize(title)}|${tipo}|${day}`;
        if (keys.has(key) || seen.has(key)) {
          results.push({ line: index + 2, status: "duplicate" });
          continue;
        }
        seen.add(key);
        const start = new Date(`${day}T12:00:00.000Z`);
        scheduleData.push({
          id: importId(resource, user.templeId, key),
          templeId: user.templeId, titulo: title, tipo: tipo as ScheduleType, status: statusText as ScheduleStatus,
          inicio: start, fim: new Date(`${day}T23:59:59.999Z`),
          descricao: field(row, "Descrição") || null, responsavel: field(row, "Responsável") || null,
          observacoes: field(row, "Observações") || null,
        });
        results.push({ line: index + 2, status: "new" });
      }
    } else if (resource === "products") {
      const requestedSkus = rows.map((row) => field(row, "Código", "SKU")).filter(Boolean);
      const [existing, skuOwners] = await Promise.all([
        prisma.product.findMany({ where: { templeId: user.templeId, deletedAt: null }, select: { nome: true, categoria: true, fornecedor: true, sku: true } }),
        prisma.product.findMany({ where: { sku: { in: requestedSkus } }, select: { sku: true } }),
      ]);
      const skus = new Set(skuOwners.map((item) => item.sku).filter(Boolean));
      const productKey = (name: string, category: string, supplier: string) => `${normalize(normalizeProductName(name))}|${normalize(category)}|${normalize(supplier)}`;
      const identities = new Set(existing.map((item) => productKey(item.nome, item.categoria || "", item.fornecedor || "")));
      for (const [index, row] of rows.entries()) {
        const nome = normalizeProductName(field(row, "Produto", "Nome"));
        const sku = field(row, "Código", "SKU") || null;
        const categoria = field(row, "Categoria");
        const fornecedor = field(row, "Fornecedor");
        const quantidadeText = field(row, "Quantidade", "Estoque");
        const minimoText = field(row, "Estoque mínimo", "Quantidade mínima");
        const custoText = field(row, "Preço de custo", "Custo");
        const vendaText = field(row, "Preço de venda", "Venda");
        const quantidade = quantidadeText ? nonnegativeMoney(quantidadeText) : 0;
        const minimo = minimoText ? nonnegativeMoney(minimoText) : null;
        const custo = custoText ? nonnegativeMoney(custoText) : null;
        const venda = nonnegativeMoney(vendaText);
        if (nome.length < 2 || quantidade === null || (minimoText && minimo === null) || (custoText && custo === null) || venda === null) {
          results.push({ line: index + 2, status: "error", reason: "Informe produto, quantidade e preço de venda válidos. Custos e quantidades não podem ser negativos." });
          continue;
        }
        const identity = productKey(nome, categoria, fornecedor);
        if ((sku && skus.has(sku)) || identities.has(identity) || seen.has(identity)) {
          results.push({ line: index + 2, status: "duplicate" });
          continue;
        }
        if (sku) skus.add(sku);
        identities.add(identity);
        seen.add(identity);
        const status = field(row, "Status") || "ATIVO";
        productData.push({
          id: importId(resource, user.templeId, sku || identity), templeId: user.templeId,
          nome, sku, categoria: categoria || null, fornecedor: fornecedor || null,
          estoque: quantidade, estoqueMinimo: minimo, precoCusto: custo, precoVenda: venda,
          localizacao: field(row, "Localização") || null, status, ativo: normalize(status) !== "inativo",
        });
        results.push({ line: index + 2, status: "new" });
      }
    } else {
      const existing = await prisma.sale.findMany({ where: { templeId: user.templeId }, select: { id: true, observacoes: true } });
      const ids = new Set(existing.map((item) => item.id));
      const markers = new Set(existing.flatMap((item) => item.observacoes?.match(/\[IMPORT_REF:[a-f0-9]{24}\]/g) || []));
      const members = await prisma.member.findMany({ where: { templeId: user.templeId, deletedAt: null }, select: { id: true, nome: true } });
      for (const [index, row] of rows.entries()) {
        const reference = field(row, "Referência", "ID", "Codigo");
        const day = dateKey(field(row, "Data"));
        const amount = money(field(row, "Total", "Valor"));
        const methodText = field(row, "Método", "Forma").toUpperCase().replace(/\s+/g, "_");
        const statusText = field(row, "Status").toUpperCase() || "PAID";
        const name = field(row, "Cliente");
        if (!reference || !day || amount === null || (methodText && !Object.values(PaymentMethod).includes(methodText as PaymentMethod)) || !Object.values(SaleStatus).includes(statusText as SaleStatus)) {
          results.push({ line: index + 2, status: "error", reason: "Informe referência única, data, total positivo, método e status válidos." });
          continue;
        }
        const marker = `[IMPORT_REF:${hash(reference).slice(0, 24)}]`;
        if (ids.has(reference) || markers.has(marker) || seen.has(marker)) {
          results.push({ line: index + 2, status: "duplicate" });
          continue;
        }
        seen.add(marker);
        const matchingMembers = members.filter((member) => normalize(member.nome) === normalize(name));
        saleData.push({
          id: importId(resource, user.templeId, reference),
          templeId: user.templeId, memberId: matchingMembers.length === 1 ? matchingMembers[0].id : null,
          subtotal: amount, total: amount, status: statusText as SaleStatus,
          metodo: methodText ? methodText as PaymentMethod : null,
          createdAt: new Date(`${day}T12:00:00.000Z`),
          observacoes: [field(row, "Observações"), name ? `Cliente: ${name}` : "", "Importação histórica (sem movimentar estoque/caixa)", marker].filter(Boolean).join("\n"),
        });
        results.push({ line: index + 2, status: "new" });
      }
    }

    const summary = report(results);
    if (body.preview !== false) return ApiResponse.success({ ...summary, preview: true });
    if (summary.errors.length > 0) return ApiResponse.error("Corrija as linhas inválidas antes de importar.", 409);
    const created = resource === "members"
      ? await prisma.$transaction(async (tx) => {
          const inserted = await tx.member.createManyAndReturn({ data: memberData, skipDuplicates: true, select: { id: true } });
          const links = inserted.flatMap((member) => (memberLinks.get(member.id) || []).map((classificationId, order) => ({ memberId: member.id, classificationId, order })));
          if (links.length) await tx.memberClassificationLink.createMany({ data: links, skipDuplicates: true });
          return { count: inserted.length };
        })
      : resource === "activities"
        ? await prisma.schedule.createMany({ data: scheduleData, skipDuplicates: true })
        : resource === "products"
          ? await prisma.$transaction(async (tx) => {
              const inserted = await tx.product.createManyAndReturn({ data: productData, skipDuplicates: true, select: { id: true, estoque: true } });
              const openingStock = inserted.filter((product) => product.estoque.gt(0)).map((product) => ({
                productId: product.id, tipo: "ENTRY" as const, quantidade: product.estoque,
                observacao: "Saldo inicial da importação de estoque por planilha.",
              }));
              if (openingStock.length) await tx.stockMovement.createMany({ data: openingStock });
              return { count: inserted.length };
            })
        : resource === "sales"
          ? await prisma.sale.createMany({ data: saleData, skipDuplicates: true })
          : await prisma.financialTransaction.createMany({ data: financeData, skipDuplicates: true });
    return ApiResponse.success({ ...summary, created: created.count, preview: false });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
