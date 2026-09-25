"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Download, Printer, X } from "lucide-react";
import * as XLSX from "xlsx";

import { exportRowsToXlsx } from "@/lib/export-xlsx";
import { normalizeSearchText } from "@/lib/search";

type Product = { id: string; nome: string; sku?: string | null; categoria?: string | null; estoque: string | number };

function parsedCount(value: string) {
  const raw = value.trim().replace(",", ".");
  return /^\d{1,8}(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export default function StockInventory() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me").then((response) => response.json()).then((data) => {
      if (active) setAllowed(data.user?.permissions?.some((permission: string) => ["estoque.editar", "administrador.total", "usuarios.administrar"].includes(permission)) || false);
    }).catch(() => { if (active) setAllowed(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => products.filter((product) =>
    normalizeSearchText(`${product.nome} ${product.sku || ""} ${product.categoria || ""}`).includes(normalizeSearchText(search))
  ), [products, search]);
  const counted = useMemo(() => products.filter((product) => (counts[product.id] ?? "").trim() !== ""), [products, counts]);
  const invalid = useMemo(() => counted.filter((product) => parsedCount(counts[product.id]) === null), [counted, counts]);
  const changes = useMemo(() => counted.filter((product) => {
    const value = parsedCount(counts[product.id]);
    return value !== null && value !== Number(product.estoque);
  }), [counted, counts]);

  async function start() {
    setOpen(true);
    setLoading(true);
    setReview(false);
    setProducts([]);
    setCounts({});
    setSearch("");
    setNote("");
    setError("");
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result)) throw new Error(result?.message || "Não foi possível carregar os produtos.");
      setProducts(result as Product[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o estoque.");
    } finally {
      setLoading(false);
    }
  }

  function exportSheet() {
    exportRowsToXlsx(products.map((product) => ({
      "ID do produto": product.id, Código: product.sku || "", Produto: product.nome, Categoria: product.categoria || "",
      "Estoque no sistema": Number(product.estoque), "Contagem física": counts[product.id] || "",
    })), `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`, "Inventário");
  }

  async function importSheet(file: File) {
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo muito grande (máximo 10 MB).");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("A planilha está vazia.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      const byId = new Map(products.map((product) => [product.id, product]));
      const next: Record<string, string> = {};
      for (const [index, row] of rows.entries()) {
        const value = String(row["Contagem física"] ?? "").trim();
        if (!value) continue;
        const id = String(row["ID do produto"] ?? "").trim();
        const product = byId.get(id);
        if (!product) throw new Error(`Linha ${index + 2}: produto não encontrado. Use a ficha exportada pelo Inventário.`);
        if (Object.hasOwn(next, id)) throw new Error(`Linha ${index + 2}: produto duplicado na planilha.`);
        if (parsedCount(value) === null) throw new Error(`Linha ${index + 2}: contagem física inválida.`);
        const sheetStock = parsedCount(String(row["Estoque no sistema"] ?? ""));
        if (sheetStock === null || sheetStock !== Number(product.estoque)) throw new Error(`Linha ${index + 2}: saldo de ${product.nome} mudou. Exporte uma ficha atualizada.`);
        next[id] = value;
      }
      if (!Object.keys(next).length) throw new Error("Preencha a coluna Contagem física para importar a ficha.");
      setCounts(next);
      setReview(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler a ficha de inventário.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function printSheet() {
    const popup = window.open("", "_blank");
    if (!popup) { setError("Permita pop-ups para imprimir a ficha de inventário."); return; }
    const rows = products.map((product) => `<tr><td>${escapeHtml(product.sku)}</td><td>${escapeHtml(product.nome)}</td><td>${escapeHtml(product.categoria)}</td><td>${escapeHtml(product.estoque)}</td><td></td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Inventário do estoque</title><style>body{font-family:Arial,sans-serif;margin:24px}h1{font-size:22px}p{color:#555}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #aaa;padding:8px;text-align:left}th{background:#eee}@page{size:landscape;margin:12mm}</style></head><body><h1>Inventário do estoque</h1><p>${new Date().toLocaleString("pt-BR")} • ${products.length} produto(s)</p><table><thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Estoque no sistema</th><th>Contagem física</th></tr></thead><tbody>${rows}</tbody></table><script>window.addEventListener("load",()=>window.print());<\/script></body></html>`);
    popup.document.close();
  }

  async function confirm() {
    if (busy || invalid.length || changes.length < 1 || changes.length > 250) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/products/inventory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: changes.map((product) => ({ productId: product.id, expectedStock: String(product.estoque), countedStock: counts[product.id] })),
          observacao: note,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível salvar o inventário.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar o inventário.");
      setReview(false);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" onClick={() => void start()} disabled={allowed !== true} title={allowed === false ? "É necessária a permissão estoque.editar para ajustar inventário." : undefined} className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm font-semibold text-[#1D1B18] disabled:opacity-50"><ClipboardList size={17} /> Inventário</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Inventário do estoque">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div><h2 className="text-xl font-semibold">Inventário do estoque</h2><p className="mt-1 text-sm text-slate-600">Informe apenas as contagens realizadas. Campos vazios não alteram produtos.</p></div>
          <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Fechar inventário" className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <button type="button" onClick={exportSheet} disabled={loading || !products.length} className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm disabled:opacity-50"><Download size={16} /> Exportar ficha</button>
          <button type="button" onClick={() => importRef.current?.click()} disabled={loading || !products.length || busy} className="rounded-full border px-3 py-2 text-sm disabled:opacity-50">Importar contagem</button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSheet(file); }} />
          <button type="button" onClick={printSheet} disabled={loading || !products.length} className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm disabled:opacity-50"><Printer size={16} /> Imprimir ficha</button>
          {!review && <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto ou código" className="min-w-48 flex-1 rounded-lg border px-3 py-2 text-sm" />}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {loading ? <p>Carregando produtos...</p> : review ? <>
            <p className="mb-3 text-sm font-medium">Revisão: {changes.length} saldo(s) serão ajustados. Confira antes de confirmar.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Produto</th><th className="p-2 text-right">Sistema</th><th className="p-2 text-right">Contagem</th><th className="p-2 text-right">Diferença</th></tr></thead><tbody>{changes.map((product) => <tr key={product.id} className="border-b"><td className="p-2">{product.nome}</td><td className="p-2 text-right">{String(product.estoque)}</td><td className="p-2 text-right">{counts[product.id]}</td><td className="p-2 text-right">{(Number(parsedCount(counts[product.id])) - Number(product.estoque)).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div>
            <label className="mt-4 block text-sm">Observação (opcional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border p-2" rows={2} /></label>
          </> : <>
            <div className="mb-3 text-sm text-slate-600">{counted.length} contado(s) • {changes.length} diferença(s) • {invalid.length} valor(es) inválido(s)</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Produto</th><th className="p-2">Código</th><th className="p-2 text-right">Sistema</th><th className="p-2 text-right">Contagem física</th></tr></thead><tbody>{visible.map((product) => <tr key={product.id} className="border-b"><td className="p-2">{product.nome}</td><td className="p-2">{product.sku || "—"}</td><td className="p-2 text-right">{String(product.estoque)}</td><td className="p-2 text-right"><input inputMode="decimal" value={counts[product.id] ?? ""} onChange={(event) => setCounts((current) => ({ ...current, [product.id]: event.target.value }))} placeholder="Não contado" aria-label={`Contagem física de ${product.nome}`} className="w-32 rounded-lg border px-2 py-1.5 text-right" /></td></tr>)}</tbody></table></div>
          </>}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
          <button type="button" onClick={() => review ? setReview(false) : setOpen(false)} disabled={busy} className="rounded-full border px-4 py-2 text-sm">{review ? "Voltar à contagem" : "Cancelar"}</button>
          {review ? <button type="button" onClick={() => void confirm()} disabled={busy} className="rounded-full bg-[#2F5BFF] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Salvando..." : "Confirmar ajustes"}</button> : <button type="button" onClick={() => setReview(true)} disabled={loading || !!invalid.length || !changes.length || changes.length > 250} className="rounded-full bg-[#2F5BFF] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Revisar diferenças</button>}
          {changes.length > 250 && <span className="w-full text-right text-xs text-red-700">Ajuste até 250 produtos por vez.</span>}
        </div>
      </div>
    </div>}
  </>;
}
