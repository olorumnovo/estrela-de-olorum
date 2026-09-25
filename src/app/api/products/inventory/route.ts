import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requirePermission } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

type InventoryRow = { productId: string; expectedStock: string | number; countedStock: string | number };

function quantity(value: unknown) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) return null;
  return new Prisma.Decimal(raw);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "estoque.editar");
    const body = await req.json();
    const rows: InventoryRow[] = body.rows;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 250) {
      return ApiResponse.error("Informe de 1 a 250 produtos por inventário.");
    }
    const ids = new Set<string>();
    const parsed = rows.map((row) => {
      const id = typeof row?.productId === "string" ? row.productId : "";
      const expected = quantity(row?.expectedStock);
      const counted = quantity(row?.countedStock);
      if (!id || ids.has(id) || !expected || !counted) return null;
      ids.add(id);
      return { id, expected, counted };
    });
    if (parsed.some((item) => !item)) {
      return ApiResponse.error("Inventário inválido: produtos repetidos ou quantidades fora do formato aceito.");
    }
    const note = typeof body.observacao === "string" ? body.observacao.trim().slice(0, 500) : "";
    const result = await prisma.$transaction(async (tx) => {
      let adjusted = 0;
      let unchanged = 0;
      for (const row of parsed) {
        if (!row) continue;
        const product = await tx.product.findFirst({ where: { id: row.id, templeId: user.templeId, deletedAt: null }, select: { estoque: true, nome: true } });
        if (!product) throw new Error("Produto não encontrado no estoque.");
        if (!product.estoque.eq(row.expected)) throw new Error(`O estoque de ${product.nome} mudou desde a contagem. Atualize a página e confira novamente.`);
        if (row.counted.eq(row.expected)) { unchanged++; continue; }
        const update = await tx.product.updateMany({ where: { id: row.id, templeId: user.templeId, deletedAt: null, estoque: row.expected }, data: { estoque: row.counted } });
        if (update.count !== 1) throw new Error(`O estoque de ${product.nome} mudou durante o inventário. Tente novamente.`);
        await tx.stockMovement.create({ data: {
          productId: row.id, tipo: "INVENTORY", quantidade: row.counted,
          observacao: [`Contagem física: ${row.expected.toString()} → ${row.counted.toString()}`, `Responsável: ${user.nome}`, note].filter(Boolean).join(" | "),
        } });
        adjusted++;
      }
      return { adjusted, unchanged };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return ApiResponse.success(result);
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("mudou") || message.includes("não encontrado")) return ApiResponse.error(message, 409);
    return ApiResponse.serverError(message);
  }
}
