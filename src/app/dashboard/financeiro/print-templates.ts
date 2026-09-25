export type TransactionPrintDataResponse = {
  transaction?: {
    id: string;
    descricao?: string | null;
    centroCusto?: string | null;
    issuedAt?: string | null;
    competencia?: string | null;
    vencimento?: string | null;
    pagamentoEm?: string | null;
    valor?: number | string | null;
    amountPaid?: number | string | null;
    rawStatus?: string | null;
    status?: string | null;
    documentNumber?: string | null;
    metodo?: string | null;
    paymentReference?: string | null;
  } | null;
  issuer?: {
    nome?: string | null;
    cnpj?: string | null;
    ie?: string | null;
    endereco?: string | null;
    cidadeEstadoCep?: string | null;
    telefone?: string | null;
    email?: string | null;
    website?: string | null;
  } | null;
  customer?: {
    nome?: string | null;
    cpf?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cep?: string | null;
  } | null;
};

function escapePrintHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function dateOnly(value: unknown) {
  if (!value) return "-";
  const textValue = String(value);
  const match = textValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(textValue));
}

function numberValue(value: unknown) {
  return Number(value || 0);
}

const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const TEENS = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function numberToWordsBelowThousand(value: number): string {
  if (value === 0) return "";
  if (value === 100) return "cem";
  if (value < 10) return UNITS[value];
  if (value < 20) return TEENS[value - 10];

  const hundreds = Math.floor(value / 100);
  const remainderAfterHundreds = value % 100;

  if (value < 100) {
    const tens = Math.floor(value / 10);
    const unit = value % 10;
    return unit ? `${TENS[tens]} e ${UNITS[unit]}` : TENS[tens];
  }

  const hundredText = HUNDREDS[hundreds];

  if (!remainderAfterHundreds) return hundredText;
  return `${hundredText} e ${numberToWordsBelowThousand(remainderAfterHundreds)}`;
}

function integerToPortuguese(value: number): string {
  if (value === 0) return "zero";

  const billions = Math.floor(value / 1_000_000_000);
  const millions = Math.floor((value % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1_000);
  const hundreds = value % 1_000;
  const parts: string[] = [];

  if (billions) {
    parts.push(
      billions === 1 ? "um bilhão" : `${numberToWordsBelowThousand(billions)} bilhões`
    );
  }

  if (millions) {
    parts.push(
      millions === 1 ? "um milhão" : `${numberToWordsBelowThousand(millions)} milhões`
    );
  }

  if (thousands) {
    parts.push(
      thousands === 1 ? "mil" : `${numberToWordsBelowThousand(thousands)} mil`
    );
  }

  if (hundreds) parts.push(numberToWordsBelowThousand(hundreds));

  return parts.join(" e ");
}

function currencyToPortuguese(value: number): string {
  const absolute = Math.abs(Number(value || 0));
  const integer = Math.floor(absolute);
  const cents = Math.round((absolute - integer) * 100);
  const integerText =
    integer === 1 ? "um real" : `${integerToPortuguese(integer)} reais`;

  if (!cents) return integerText;

  const centsText =
    cents === 1 ? "um centavo" : `${integerToPortuguese(cents)} centavos`;

  return `${integerText} e ${centsText}`;
}

function createPrintWindow(title: string) {
  const popup = window.open("", "_blank", "width=960,height=760");

  if (!popup) {
    window.alert("Não foi possível abrir a janela de impressão.");
    return null;
  }

  popup.document.write(`
    <html>
      <head>
        <title>${escapePrintHtml(title)}</title>
        <style>
          @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Plus Jakarta Sans", Arial, sans-serif;
            color: #171717;
            background: #fff;
          }
          .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            font-size: 16px;
          }
          .dot {
            width: 18px;
            height: 18px;
            border-radius: 999px;
            background: #2F5BFF;
            animation: pulse 1s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.35; transform: scale(0.92); }
            50% { opacity: 1; transform: scale(1); }
          }
        </style>
      </head>
      <body>
        <div class="loading">
          <div class="dot"></div>
          <div>Preparando impressão...</div>
        </div>
      </body>
    </html>
  `);
  popup.document.close();
  return popup;
}

function buildPrintableHtml(title: string, bodyHtml: string) {
  return `
    <html>
      <head>
        <title>${escapePrintHtml(title)}</title>
        <script>
          window.addEventListener("load", () => {
            window.setTimeout(() => {
              window.focus();
              window.print();
            }, 350);
          });
        </script>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `;
}

function openPrintWindow(popup: Window, html: string) {
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}

function formatLongDate(dateValue: unknown) {
  if (!dateValue) return "";

  const date = new Date(String(dateValue));

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatReceiptDate(dateValue: unknown) {
  if (!dateValue) return "";

  const date = new Date(String(dateValue));
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  const day = getPart("day");
  const month = getPart("month");
  const year = getPart("year");

  if (!day || !month || !year) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  return `${day} de ${month.charAt(0).toUpperCase()}${month.slice(1)} de ${year}`;
}

async function fetchPrintData(id: string) {
  const response = await fetch(`/api/finance/transactions/${id}/print-data`);
  const data = (await response.json()) as TransactionPrintDataResponse & { message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Não foi possível carregar os dados de impressão.");
  }

  return data;
}

export async function printReceiptTemplate(id: string) {
  const popup = createPrintWindow("Recibo");
  if (!popup) return;

  const data = await fetchPrintData(id);
  const transaction = data.transaction;

  if (!transaction) {
    popup.close();
    throw new Error("Lançamento não encontrado para impressão.");
  }

  const issuer = data.issuer || {};
  const customer = data.customer || {};
  const amount = numberValue(transaction.amountPaid || transaction.valor);
  const issuedAt = new Date();
  const logoUrl = `${window.location.origin}/logo.png`;
  const receivedFrom = [customer.nome || transaction.centroCusto || "-", customer.cpf || ""]
    .filter(Boolean)
    .join(", ");

  openPrintWindow(
    popup,
    buildPrintableHtml(
      "Recibo",
      `
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            @page { size: A4; margin: 0; }
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; margin: 0; color: #111; background: #fff; }
            .page { width: 100%; min-height: 100vh; padding: 32px 50px 28px; box-sizing: border-box; }
            .meta { display:flex; justify-content:space-between; font-size:18px; margin-bottom:26px; }
            .meta .brand { text-align:left; }
            .box { border:1px solid #111; }
            .header { display:grid; grid-template-columns:240px 1fr 250px; align-items:center; min-height:182px; padding:0 18px; }
            .header img { width:126px; display:block; margin:0 auto; }
            .header .title { font-size:31px; font-weight:700; text-align:center; letter-spacing:0.5px; }
            .header .amount { font-size:31px; font-weight:700; text-align:center; }
            .divider { border-top:1px solid #111; }
            .content { min-height:206px; padding:20px 24px 18px; font-size:20px; line-height:1.88; font-weight:700; }
            .footer { min-height:132px; padding:0 18px 10px; display:flex; align-items:flex-end; justify-content:space-between; gap:24px; }
            .signature { width:60%; text-align:center; font-size:18px; margin-bottom:12px; }
            .signature-line { border-top:2px solid #111; padding-top:4px; }
            .small { font-size:16px; }
            .footer-note { margin-top:8px; font-size:14px; text-align:center; width:100%; }
          </style>
          <div class="page">
            <div class="meta">
              <div>${escapePrintHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(issuedAt))}</div>
              <div class="brand">ERP da Olist</div>
            </div>
            <div class="box">
              <div class="header">
                <div><img src="${escapePrintHtml(logoUrl)}" alt="Logo" /></div>
                <div class="title">RECIBO</div>
                <div class="amount">${escapePrintHtml(money(amount))}</div>
              </div>
              <div class="divider"></div>
              <div class="content">
                <div>Recebi(emos) de: ${escapePrintHtml(receivedFrom)}</div>
                <div>a importância de ${escapePrintHtml(currencyToPortuguese(amount).toUpperCase())}</div>
                <div>Referente a ${escapePrintHtml(transaction.descricao || "-")}</div>
              </div>
              <div class="divider"></div>
              <div class="footer">
                <div style="font-size:18px;">São Paulo, ${escapePrintHtml(formatReceiptDate(transaction.pagamentoEm || issuedAt))}</div>
                <div class="signature">
                  <div class="signature-line">${escapePrintHtml(issuer.nome || "")},<br/>${escapePrintHtml(issuer.cnpj || "")}</div>
                </div>
              </div>
              <div class="footer-note">${escapePrintHtml("https://erp.olist.com/contas_receber")}</div>
            </div>
          </div>
      `
    )
  );
}

export async function printDuplicateTemplate(id: string) {
  const popup = createPrintWindow("Duplicata");
  if (!popup) return;

  const data = await fetchPrintData(id);
  const transaction = data.transaction;

  if (!transaction) {
    popup.close();
    throw new Error("Lançamento não encontrado para impressão.");
  }

  const issuer = data.issuer || {};
  const customer = data.customer || {};
  const amount = numberValue(transaction.valor);
  const logoUrl = `${window.location.origin}/logo.png`;
  const enderecoSacado = [customer.endereco, customer.numero].filter(Boolean).join(", ");
  const cidadeEstadoCep = [customer.cidade, customer.estado, customer.cep].filter(Boolean).join(" - ");

  openPrintWindow(
    popup,
    buildPrintableHtml(
      "Duplicata",
      `
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            @page { size: A4; margin: 0; }
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; margin: 0; color: #111; background: #fff; }
            .page { padding: 32px 50px 28px; box-sizing: border-box; min-height: 100vh; }
            .meta { display:flex; justify-content:space-between; font-size:18px; margin-bottom:28px; }
            .box, .rowbox { border:1px solid #111; }
            .header { display:grid; grid-template-columns:338px 1fr; min-height:190px; }
            .logo { display:flex; align-items:center; justify-content:center; border-right:1px solid #111; padding:10px; }
            .logo img { width:118px; }
            .issuer { padding:8px 14px; font-size:16px; line-height:1.22; }
            .info-grid { margin-top:16px; display:grid; grid-template-columns:1.25fr .7fr 1fr 1fr; }
            .info-cell { border-right:1px solid #111; padding:6px 10px; min-height:54px; font-size:16px; }
            .info-cell:last-child { border-right:none; }
            .debtor { margin-top:16px; padding:6px; font-size:16px; line-height:1.44; }
            .debtor-row { display:grid; grid-template-columns:190px 1fr; }
            .extenso { margin-top:18px; display:grid; grid-template-columns:220px 1fr; min-height:88px; }
            .extenso > div { padding:12px 10px; font-size:18px; }
            .extenso .label { border-right:1px solid #111; display:flex; align-items:center; }
            .ack { margin-top:18px; padding:8px; font-size:18px; line-height:1.45; }
            .sign { margin-top:18px; display:grid; grid-template-columns:1fr 2.8fr; min-height:98px; }
            .sign > div { padding:8px 10px; position:relative; }
            .sign > div:first-child { border-right:1px solid #111; }
            .line { position:absolute; left:40px; right:40px; bottom:28px; border-top:2px solid #111; text-align:center; padding-top:4px; font-size:16px; }
            .foot-url { margin-top:6px; text-align:center; font-size:14px; }
          </style>
          <div class="page">
            <div class="meta">
              <div>${escapePrintHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date()))}</div>
              <div>Duplicata</div>
            </div>

            <div class="box header">
              <div class="logo"><img src="${escapePrintHtml(logoUrl)}" alt="Logo" /></div>
              <div class="issuer">
                <div style="font-weight:700; text-transform:uppercase;">${escapePrintHtml(issuer.nome || "")}</div>
                <div>CNPJ: ${escapePrintHtml(issuer.cnpj || "")}</div>
                <div>IE: ${escapePrintHtml(issuer.ie || "")}</div>
                <div>${escapePrintHtml(issuer.endereco || "")}</div>
                <div>${escapePrintHtml(issuer.cidadeEstadoCep || "")}</div>
                <div>Fone: ${escapePrintHtml(issuer.telefone || "")}</div>
                <div>${escapePrintHtml(issuer.email || "")}</div>
                <div>${escapePrintHtml(issuer.website || "")}</div>
              </div>
            </div>

            <div class="rowbox info-grid">
              <div class="info-cell">Duplicata Nº<br/>${escapePrintHtml(transaction.documentNumber || "-")}</div>
              <div class="info-cell">Valor<br/>${escapePrintHtml(money(amount).replace("R$", "").trim())}</div>
              <div class="info-cell">Emissão<br/>${escapePrintHtml(dateOnly(transaction.issuedAt))}</div>
              <div class="info-cell">Vencimento<br/>${escapePrintHtml(dateOnly(transaction.vencimento))}</div>
            </div>

            <div class="rowbox debtor">
              <div class="debtor-row"><div>Nome do sacado:</div><div><strong>${escapePrintHtml(customer.nome || transaction.centroCusto || "-")}</strong></div></div>
              <div class="debtor-row"><div>Endereço:</div><div>${escapePrintHtml(enderecoSacado)}</div></div>
              <div class="debtor-row"><div>Complemento:</div><div>${escapePrintHtml(customer.complemento || "")}</div></div>
              <div class="debtor-row"><div>Bairro:</div><div>${escapePrintHtml(customer.bairro || "")}</div></div>
              <div class="debtor-row"><div>Cidade - Estado - Cep:</div><div>${escapePrintHtml(cidadeEstadoCep)}</div></div>
              <div class="debtor-row"><div>Praça de pagamento:</div><div>${escapePrintHtml(customer.cidade || "SÃO PAULO")}</div></div>
              <div class="debtor-row"><div>CPF/CNPJ:</div><div>${escapePrintHtml(customer.cpf || "")}</div></div>
            </div>

            <div class="rowbox extenso">
              <div class="label">Valor por extenso</div>
              <div>${escapePrintHtml(currencyToPortuguese(amount).toUpperCase())}</div>
            </div>

            <div class="rowbox ack">
              Reconheço(emos) a exatidão desta duplicata de venda mercantil que pagarei(mos) a ${escapePrintHtml(
                issuer.nome || ""
              )}, ou a sua ordem na praça e vencimentos acima indicados.
            </div>

            <div class="rowbox sign">
              <div><div class="line">_____/_____/________<br/>Data do aceite</div></div>
              <div><div class="line">${escapePrintHtml(customer.nome || transaction.centroCusto || "-")}</div></div>
            </div>
            <div class="foot-url">${escapePrintHtml("https://erp.olist.com/relatorios/duplicata.impressao.php")}</div>
          </div>
      `
    )
  );
}
