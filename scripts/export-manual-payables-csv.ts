import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

const PAGE_LABELS = {
  Todas: "TODAS",
  "em  aberto": "EM_ABERTO",
  emitidas: "EMITIDAS",
  pagas: "PAGAS",
  Atrasadas: "ATRASADAS",
} as const;

type ManualPage = (typeof PAGE_LABELS)[keyof typeof PAGE_LABELS];

type RawRow = {
  ID: string | number;
  Fornecedor: string;
  "Data Emissão": string;
  "Data Vencimento": string;
  "Data Liquidação": string;
  "Valor documento": string | number;
  Saldo: string | number;
  Situação: string;
  "Número documento": string;
  Categoria: string;
  Histórico: string;
  Pago: string | number;
  Competência: string;
  "Forma Pagamento": string;
  "Chave PIX/Código boleto": string;
};

type NormalizedRow = {
  externalId: string;
  supplier: string;
  issuedAt: string;
  dueDate: string;
  paidAt: string;
  amount: number;
  balance: number;
  rawStatus: string;
  documentNumber: string;
  categoryName: string;
  history: string;
  amountPaid: number;
  competence: string;
  paymentMethodLabel: string;
  paymentReference: string;
  sourcePage: ManualPage;
  sourceFile: string;
};

function parsePtBrDateToIso(value: string | undefined) {
  if (!value || !value.trim()) {
    return "";
  }

  const [day, month, year] = value.split("/");
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function parseNumber(value: string | number | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return 0;
  }

  const normalized = String(value)
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(row: RawRow, sourcePage: ManualPage, sourceFile: string) {
  const externalId = String(row.ID || "").trim();
  const supplier = String(row.Fornecedor || "").trim();

  if (!externalId || !supplier) {
    return null;
  }

  return {
    externalId,
    supplier,
    issuedAt: parsePtBrDateToIso(String(row["Data Emissão"] || "")),
    dueDate: parsePtBrDateToIso(String(row["Data Vencimento"] || "")),
    paidAt: parsePtBrDateToIso(String(row["Data Liquidação"] || "")),
    amount: parseNumber(row["Valor documento"]),
    balance: parseNumber(row.Saldo),
    rawStatus: String(row.Situação || "").trim(),
    documentNumber: String(row["Número documento"] || "").trim(),
    categoryName: String(row.Categoria || "").trim() || "Sem categoria",
    history: String(row.Histórico || "").trim(),
    amountPaid: parseNumber(row.Pago),
    competence: parsePtBrDateToIso(String(row.Competência || "")),
    paymentMethodLabel: String(row["Forma Pagamento"] || "").trim(),
    paymentReference: String(row["Chave PIX/Código boleto"] || "").trim(),
    sourcePage,
    sourceFile,
  } satisfies NormalizedRow;
}

function csvEscape(value: string | number) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replaceAll('"', '""')}"`;
}

async function main() {
  const baseDir =
    process.argv[2] ||
    path.resolve(process.cwd(), "../Contas/Contas a Pagar");
  const outputFile = process.argv[3] || path.resolve(process.cwd(), ".tmp-manual-payables.csv");

  const rows: NormalizedRow[] = [];

  for (const [folderName, pageLabel] of Object.entries(PAGE_LABELS)) {
    const folderPath = path.join(baseDir, folderName);
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => file.toLowerCase().endsWith(".xls"))
      .sort();

    for (const fileName of files) {
      const absolutePath = path.join(folderPath, fileName);
      const workbook = XLSX.readFile(absolutePath, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: "" });

      data.forEach((row) => {
        const normalized = normalizeRow(
          row,
          pageLabel,
          path.relative(process.cwd(), absolutePath)
        );

        if (normalized) {
          rows.push(normalized);
        }
      });
    }
  }

  const grouped = new Map<string, NormalizedRow[]>();
  rows.forEach((row) => {
    const current = grouped.get(row.externalId) ?? [];
    current.push(row);
    grouped.set(row.externalId, current);
  });

  const header = [
    "external_id",
    "supplier",
    "issued_at",
    "due_date",
    "paid_at",
    "amount",
    "balance",
    "raw_status",
    "document_number",
    "category_name",
    "history",
    "amount_paid",
    "competence",
    "payment_method_label",
    "payment_reference",
    "source_pages",
    "source_files",
  ];

  const lines = [header.join(",")];

  for (const [externalId, entries] of grouped) {
    const latest = [...entries].sort((a, b) => {
      if (a.issuedAt !== b.issuedAt) {
        return a.issuedAt.localeCompare(b.issuedAt);
      }

      return a.sourceFile.localeCompare(b.sourceFile);
    })[entries.length - 1];

    const sourcePages = [...new Set(entries.map((entry) => entry.sourcePage))].join("|");
    const sourceFiles = [...new Set(entries.map((entry) => entry.sourceFile))].join("|");

    lines.push(
      [
        csvEscape(externalId),
        csvEscape(latest.supplier),
        csvEscape(latest.issuedAt),
        csvEscape(latest.dueDate),
        csvEscape(latest.paidAt),
        csvEscape(latest.amount),
        csvEscape(latest.balance),
        csvEscape(latest.rawStatus),
        csvEscape(latest.documentNumber),
        csvEscape(latest.categoryName),
        csvEscape(latest.history),
        csvEscape(latest.amountPaid),
        csvEscape(latest.competence),
        csvEscape(latest.paymentMethodLabel),
        csvEscape(latest.paymentReference),
        csvEscape(sourcePages),
        csvEscape(sourceFiles),
      ].join(",")
    );
  }

  fs.writeFileSync(outputFile, lines.join("\n"));

  console.log(
    JSON.stringify(
      {
        outputFile,
        rowsRead: rows.length,
        uniqueEntries: grouped.size,
      },
      null,
      2
    )
  );
}

main();
