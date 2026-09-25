-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ScheduleType" AS ENUM ('GIRA', 'ATENDIMENTO', 'CONSULTA', 'REUNIAO', 'CURSO', 'EVENTO');

-- CreateEnum
CREATE TYPE "public"."ScheduleStatus" AS ENUM ('AGENDADO', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('PIX', 'DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "public"."StockMovementType" AS ENUM ('ENTRY', 'EXIT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "public"."Temple" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "logo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Temple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "telefone" TEXT,
    "foto" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "ultimoLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Permission" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "public"."RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "public"."Member" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeEspiritual" TEXT,
    "cpf" TEXT,
    "rg" TEXT,
    "nascimento" TIMESTAMP(3),
    "genero" "public"."Gender",
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "cep" TEXT,
    "endereco" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "profissao" TEXT,
    "funcao" TEXT,
    "foto" TEXT,
    "observacoes" TEXT,
    "status" "public"."MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemberAttachment" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "tipo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Schedule" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "public"."ScheduleType" NOT NULL,
    "status" "public"."ScheduleStatus" NOT NULL DEFAULT 'AGENDADO',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Attendance" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "presente" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialCategory" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialTransaction" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "public"."TransactionType" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "metodo" "public"."PaymentMethod",
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "vencimento" TIMESTAMP(3),
    "pagamentoEm" TIMESTAMP(3),
    "comprovante" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MonthlyFee" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "referencia" TIMESTAMP(3),
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "pagamentoEm" TIMESTAMP(3),
    "metodo" "public"."PaymentMethod",
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "sku" TEXT,
    "codigoBarras" TEXT,
    "categoria" TEXT,
    "precoCusto" DECIMAL(10,2),
    "precoVenda" DECIMAL(10,2) NOT NULL,
    "estoque" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estoqueMinimo" DECIMAL(10,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tipo" "public"."StockMovementType" NOT NULL,
    "quantidade" DECIMAL(10,2) NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sale" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "metodo" "public"."PaymentMethod",
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantidade" DECIMAL(10,2) NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "userId" TEXT,
    "tabela" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "ip" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Setting" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Temple_slug_key" ON "public"."Temple"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_templeId_idx" ON "public"."User"("templeId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_templeId_nome_key" ON "public"."Role"("templeId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_templeId_chave_key" ON "public"."Permission"("templeId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "Member_cpf_key" ON "public"."Member"("cpf");

-- CreateIndex
CREATE INDEX "Member_templeId_idx" ON "public"."Member"("templeId");

-- CreateIndex
CREATE INDEX "MemberAttachment_memberId_idx" ON "public"."MemberAttachment"("memberId");

-- CreateIndex
CREATE INDEX "Schedule_templeId_idx" ON "public"."Schedule"("templeId");

-- CreateIndex
CREATE INDEX "Attendance_scheduleId_idx" ON "public"."Attendance"("scheduleId");

-- CreateIndex
CREATE INDEX "Attendance_memberId_idx" ON "public"."Attendance"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_scheduleId_memberId_key" ON "public"."Attendance"("scheduleId", "memberId");

-- CreateIndex
CREATE INDEX "FinancialCategory_templeId_idx" ON "public"."FinancialCategory"("templeId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_templeId_nome_key" ON "public"."FinancialCategory"("templeId", "nome");

-- CreateIndex
CREATE INDEX "FinancialTransaction_templeId_idx" ON "public"."FinancialTransaction"("templeId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_categoryId_idx" ON "public"."FinancialTransaction"("categoryId");

-- CreateIndex
CREATE INDEX "MonthlyFee_templeId_idx" ON "public"."MonthlyFee"("templeId");

-- CreateIndex
CREATE INDEX "MonthlyFee_memberId_idx" ON "public"."MonthlyFee"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyFee_memberId_competencia_key" ON "public"."MonthlyFee"("memberId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "public"."Product"("sku");

-- CreateIndex
CREATE INDEX "Product_templeId_idx" ON "public"."Product"("templeId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "public"."StockMovement"("productId");

-- CreateIndex
CREATE INDEX "Sale_templeId_idx" ON "public"."Sale"("templeId");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "public"."SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "public"."SaleItem"("productId");

-- CreateIndex
CREATE INDEX "Notification_templeId_idx" ON "public"."Notification"("templeId");

-- CreateIndex
CREATE INDEX "AuditLog_templeId_idx" ON "public"."AuditLog"("templeId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_templeId_chave_key" ON "public"."Setting"("templeId", "chave");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Role" ADD CONSTRAINT "Role_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Permission" ADD CONSTRAINT "Permission_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "public"."Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Member" ADD CONSTRAINT "Member_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemberAttachment" ADD CONSTRAINT "MemberAttachment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Schedule" ADD CONSTRAINT "Schedule_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialCategory" ADD CONSTRAINT "FinancialCategory_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MonthlyFee" ADD CONSTRAINT "MonthlyFee_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MonthlyFee" ADD CONSTRAINT "MonthlyFee_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Setting" ADD CONSTRAINT "Setting_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
