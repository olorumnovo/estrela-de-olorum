"use client";

import { Download, Printer } from "lucide-react";

import ManagementModule, { ResourceRecord } from "@/components/modules/ManagementModule";
import SpreadsheetImportActions from "@/components/spreadsheets/SpreadsheetImportActions";
import StockInventory from "@/components/stock/StockInventory";
import { exportRowsToXlsx } from "@/lib/export-xlsx";

function money(value: unknown) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(number) ? number : 0);
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : "-";
}

function numberText(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR");
}

async function movement(record: ResourceRecord) {
  const tipo = window.prompt("Tipo: ENTRY, EXIT, TRANSFER, INVENTORY ou ADJUSTMENT", "ENTRY");
  const quantidade = window.prompt("Quantidade", "1");

  if (!record.id || !tipo || !quantidade) {
    return;
  }

  const origem = tipo === "TRANSFER" ? window.prompt("Origem", "") : "";
  const destino = tipo === "TRANSFER" ? window.prompt("Destino", "") : "";
  const observacao = window.prompt("Observação", "") || "";

  await fetch(`/api/products/${record.id}/movements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, quantidade, origem, destino, observacao }),
  });

  window.location.reload();
}

async function loadAllProducts() {
  const response = await fetch("/api/products", { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || "Não foi possível carregar o estoque.");
  }

  if (Array.isArray(payload)) {
    return payload as ResourceRecord[];
  }

  return Array.isArray(payload?.data) ? (payload.data as ResourceRecord[]) : [];
}

async function exportStock() {
  try {
    const products = await loadAllProducts();

    exportRowsToXlsx(
      products.map((product) => ({
        Código: text(product.sku),
        Produto: text(product.nome),
        Categoria: text(product.categoria),
        Fornecedor: text(product.fornecedor),
        Quantidade: Number(product.estoque || 0),
        "Estoque mínimo": Number(product.estoqueMinimo || 0),
        "Preço de custo": Number(product.precoCusto || 0),
        "Preço de venda": Number(product.precoVenda || 0),
        Localização: text(product.localizacao),
        Status: text(product.status),
      })),
      `estoque-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Estoque"
    );
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Não foi possível exportar o estoque.");
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function printStock() {
  try {
    const products = await loadAllProducts();
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.alert("Permita a abertura de janelas para imprimir o estoque.");
      return;
    }

    const rows = products
      .map(
        (product) => `
          <tr>
            <td>${escapeHtml(text(product.sku))}</td>
            <td>${escapeHtml(text(product.nome))}</td>
            <td>${escapeHtml(text(product.categoria))}</td>
            <td class="number">${escapeHtml(numberText(product.estoque))}</td>
            <td class="number">${escapeHtml(money(product.precoCusto))}</td>
            <td class="number">${escapeHtml(money(product.precoVenda))}</td>
          </tr>`
      )
      .join("");

    printWindow.document.write(`<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Estoque PDV</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #171717; margin: 28px; }
            h1 { margin: 0 0 6px; font-size: 24px; }
            p { margin: 0 0 20px; color: #666; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f3f4f6; }
            .number { text-align: right; }
            @page { size: landscape; margin: 12mm; }
          </style>
        </head>
        <body>
          <h1>Estoque PDV</h1>
          <p>Emitido em ${new Date().toLocaleString("pt-BR")} • ${products.length} produto(s)</p>
          <table>
            <thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Quantidade</th><th>Custo</th><th>Venda</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <script>window.addEventListener("load", () => window.print());<\/script>
        </body>
      </html>`);
    printWindow.document.close();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Não foi possível imprimir o estoque.");
  }
}

export default function EstoquePage() {
  return (
    <ManagementModule
      title="Estoque"
      description="Produtos, entradas, saídas, transferências, inventário, histórico e alertas."
      endpoint="/api/products"
      headerActions={
        <>
          <StockInventory />
          <SpreadsheetImportActions resource="products" />
          <button
            type="button"
            onClick={() => void exportStock()}
            className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm font-semibold text-[#1D1B18]"
          >
            <Download size={17} />
            Exportar estoque
          </button>
          <button
            type="button"
            onClick={() => void printStock()}
            className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm font-semibold text-[#1D1B18]"
          >
            <Printer size={17} />
            Imprimir estoque
          </button>
        </>
      }
      initialValues={{ ativo: "true", status: "ATIVO", estoque: "0" }}
      fields={[
        { name: "sku", label: "Código" },
        { name: "nome", label: "Nome", required: true },
        { name: "foto", label: "Foto do produto", type: "file", accept: "image/png,image/jpeg,image/webp" },
        { name: "categoria", label: "Categoria" },
        { name: "fornecedor", label: "Fornecedor" },
        { name: "estoque", label: "Quantidade", type: "number" },
        { name: "estoqueMinimo", label: "Quantidade mínima", type: "number" },
        { name: "precoCusto", label: "Valor de custo", type: "number" },
        { name: "precoVenda", label: "Valor de venda", type: "number", required: true },
        { name: "localizacao", label: "Localização" },
        { name: "lote", label: "Lote" },
        { name: "validade", label: "Validade", type: "date" },
        { name: "status", label: "Status" },
        { name: "descricao", label: "Observações", type: "textarea" },
      ]}
      columns={[
        { header: "Código", render: (record) => text(record.sku) },
        { header: "Nome", render: (record) => text(record.nome) },
        { header: "Foto", render: (record) => record.foto ? "Sim" : "-" },
        { header: "Categoria", render: (record) => text(record.categoria) },
        { header: "Fornecedor", render: (record) => text(record.fornecedor) },
        { header: "Qtd.", render: (record) => numberText(record.estoque) },
        { header: "Mín.", render: (record) => numberText(record.estoqueMinimo) },
        { header: "Custo", render: (record) => money(record.precoCusto) },
        { header: "Venda", render: (record) => money(record.precoVenda) },
        { header: "Local", render: (record) => text(record.localizacao) },
        { header: "Status", render: (record) => text(record.status) },
      ]}
      actions={[
        {
          label: "Movimentar",
          icon: "copy",
          onClick: movement,
        },
      ]}
      afterLoad={(records) => {
        const lowStock = records.filter((record) => {
          const min = Number(record.estoqueMinimo || 0);
          return min > 0 && Number(record.estoque || 0) <= min;
        });

        const total = records.reduce((sum, record) => sum + Number(record.estoque || 0) * Number(record.precoVenda || 0), 0);

        return (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Summary title="Produtos" value={String(records.length)} />
            <Summary title="Estoque baixo" value={String(lowStock.length)} />
            <Summary title="Valor estimado" value={money(total)} />
          </div>
        );
      }}
      enablePagination
      defaultPerPage={10}
    />
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">{title}</p>
      <h2 className="mt-3 text-4xl font-bold text-slate-900">{value}</h2>
    </section>
  );
}
