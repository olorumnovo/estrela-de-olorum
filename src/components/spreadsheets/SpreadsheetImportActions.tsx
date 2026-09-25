"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

import { spreadsheetTemplates, type SpreadsheetResource } from "@/lib/spreadsheets/templates";

type Preview = { total: number; ready: number; duplicate: number; errors: { line: number; reason: string }[]; created?: number };

export default function SpreadsheetImportActions({ resource, onImported }: { resource: SpreadsheetResource; onImported?: () => void }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const template = spreadsheetTemplates[resource];
  const isFinancial = resource === "payables" || resource === "receivables";
  const isStock = resource === "products";

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me").then((response) => response.json()).then((data) => {
      const required = isFinancial ? ["financeiro.criar", "administrador.total", "usuarios.administrar"] : isStock ? ["estoque.criar", "administrador.total", "usuarios.administrar"] : ["administrador.total", "usuarios.administrar"];
      if (active) setAllowed(data.user?.permissions?.some((permission: string) => required.includes(permission)) || false);
    }).catch(() => { if (active) setAllowed(false); });
    return () => { active = false; };
  }, [isFinancial, isStock]);

  function downloadTemplate() {
    const sheet = XLSX.utils.aoa_to_sheet([[...template.columns]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Modelo");
    const notes = [
      ["Preencha a aba Modelo. Datas: DD/MM/AAAA. Valores: formato brasileiro (ex.: 1.234,56)."],
      ["A importação cria somente registros novos; duplicatas são ignoradas. Revise a prévia antes de confirmar."],
      [resource === "members" ? "Membros: informe CPF ou, sem CPF, nascimento ou telefone/WhatsApp. Classificações separadas por | devem existir no sistema." : ""],
      [resource === "receivables" || resource === "payables" ? "Contas: apenas abertas, sem pagamentos parciais. Categoria e data de emissão são obrigatórias." : ""],
      [resource === "activities" ? "Atividades: exemplos de categoria: EVENTO, GIRA, REUNIAO, OBRIGACAO ou CURSO; exemplos de status: AGENDADO, FINALIZADO ou CANCELADO." : ""],
      [resource === "sales" ? "Vendas: referência única obrigatória. Importação apenas histórica, sem movimentar estoque ou caixa." : ""],
      [resource === "products" ? "Estoque: cria apenas produtos novos. Produtos existentes, suas quantidades e preços nunca são alterados pela importação. Use Inventário para ajustar quantidades após conferir a contagem." : ""],
    ].filter((row) => row[0]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(notes), "Instruções");
    XLSX.writeFile(workbook, template.fileName);
  }

  async function requestImport(data: Record<string, unknown>[], previewOnly: boolean): Promise<Preview> {
    const response = await fetch(`/api/spreadsheets/${resource}/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: data, preview: previewOnly }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Falha ao importar a planilha.");
    return result as Preview;
  }

  async function readFile(file: File) {
    setBusy(true);
    setMessage("");
    setPreview(null);
    setRows([]);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo muito grande (máximo 10 MB).");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("A planilha está vazia.");
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (parsed.length < 1 || parsed.length > 5000) throw new Error("Use uma planilha com 1 a 5.000 linhas.");
      const check = await requestImport(parsed, true);
      setRows(parsed);
      setPreview(check);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview || preview.errors.length || !preview.ready || busy) return;
    setBusy(true);
    try {
      const result = await requestImport(rows, false);
      setMessage(`${result.created ?? 0} registro(s) criado(s); ${result.duplicate} duplicado(s) ignorado(s).`);
      setPreview(null);
      setRows([]);
      if (inputRef.current) inputRef.current.value = "";
      if (onImported) onImported();
      else window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar os registros.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed && !isFinancial && !isStock) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={downloadTemplate} className="rounded-full border border-[#E9E1D2] px-4 py-2 text-sm font-medium">Baixar modelo</button>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || allowed !== true} title={allowed === false ? `É necessária a permissão ${isStock ? "estoque.criar" : "financeiro.criar"} para importar.` : undefined} className="rounded-full border border-[#E9E1D2] px-4 py-2 text-sm font-medium disabled:opacity-50">{resource === "payables" ? "Importar contas a pagar" : resource === "receivables" ? "Importar contas a receber" : resource === "products" ? "Importar estoque" : "Importar planilha"}</button>
      {allowed === false && <span className="text-xs text-slate-500">Importação requer permissão para criar {isStock ? "produtos" : "lançamentos financeiros"}.</span>}
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
      {busy && <span className="text-sm text-slate-600">Analisando...</span>}
      {preview && (
        <div role="status" className="w-full rounded-xl border border-[#E9E1D2] bg-white p-3 text-sm text-slate-700">
          <p>{template.label}: {preview.ready} novo(s), {preview.duplicate} duplicado(s), {preview.errors.length} erro(s).</p>
          {preview.errors.slice(0, 10).map((error) => <p key={error.line} className="text-red-700">Linha {error.line}: {error.reason}</p>)}
          {preview.errors.length > 10 && <p>Há mais {preview.errors.length - 10} erro(s).</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || !!preview.errors.length || !preview.ready} onClick={() => void confirm()} className="rounded-full bg-[#2F5BFF] px-4 py-2 font-semibold text-white disabled:opacity-50">Confirmar importação</button>
            <button type="button" onClick={() => { setPreview(null); setRows([]); }} className="rounded-full border px-4 py-2">Cancelar</button>
          </div>
        </div>
      )}
      {message && <span role="status" className="w-full text-sm text-slate-700">{message}</span>}
    </div>
  );
}
