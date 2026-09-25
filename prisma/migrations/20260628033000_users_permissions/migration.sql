-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- AlterTable
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "cpf" TEXT,
ADD COLUMN IF NOT EXISTS "cargo" TEXT,
ADD COLUMN IF NOT EXISTS "observacoes" TEXT,
ADD COLUMN IF NOT EXISTS "senhaAlteradaEm" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "bloqueadoEm" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "bloqueadoMotivo" TEXT,
ADD COLUMN IF NOT EXISTS "deveTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "tentativasLogin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "ultimoIp" TEXT,
ADD COLUMN IF NOT EXISTS "ultimoUserAgent" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Permission"
ADD COLUMN IF NOT EXISTS "codigo" TEXT,
ADD COLUMN IF NOT EXISTS "nome" TEXT,
ADD COLUMN IF NOT EXISTS "modulo" TEXT,
ADD COLUMN IF NOT EXISTS "acao" TEXT;

UPDATE "Permission"
SET
  "codigo" = COALESCE("codigo", "chave"),
  "nome" = COALESCE("nome", initcap(replace("chave", '.', ' '))),
  "modulo" = COALESCE("modulo", split_part("chave", '.', 1)),
  "acao" = COALESCE("acao", split_part("chave", '.', 2))
WHERE "codigo" IS NULL OR "nome" IS NULL OR "modulo" IS NULL OR "acao" IS NULL;

-- AlterTable UserRole from composite PK to id PK while preserving uniqueness.
ALTER TABLE "UserRole" ADD COLUMN IF NOT EXISTS "id" TEXT;
UPDATE "UserRole" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "UserRole" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "UserRole" DROP CONSTRAINT IF EXISTS "UserRole_pkey";
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id");

-- AlterTable RolePermission from composite PK to id PK while preserving uniqueness.
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "id" TEXT;
UPDATE "RolePermission" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "RolePermission" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_pkey";
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserPermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSession" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoginLog" (
  "id" TEXT NOT NULL,
  "templeId" TEXT,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserAuditLog" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "userId" TEXT,
  "actorUserId" TEXT,
  "acao" TEXT NOT NULL,
  "descricao" TEXT,
  "valorAnterior" JSONB,
  "valorNovo" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_cpf_idx" ON "User"("cpf");
CREATE INDEX IF NOT EXISTS "Permission_templeId_idx" ON "Permission"("templeId");
CREATE INDEX IF NOT EXISTS "Permission_modulo_idx" ON "Permission"("modulo");
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_templeId_codigo_key" ON "Permission"("templeId", "codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");
CREATE INDEX IF NOT EXISTS "UserRole_userId_idx" ON "UserRole"("userId");
CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx" ON "RolePermission"("roleId");
CREATE INDEX IF NOT EXISTS "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_permissionId_key" ON "UserPermission"("userId", "permissionId");
CREATE INDEX IF NOT EXISTS "UserPermission_userId_idx" ON "UserPermission"("userId");
CREATE INDEX IF NOT EXISTS "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_token_key" ON "UserSession"("token");
CREATE INDEX IF NOT EXISTS "UserSession_templeId_idx" ON "UserSession"("templeId");
CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX IF NOT EXISTS "UserSession_token_idx" ON "UserSession"("token");
CREATE INDEX IF NOT EXISTS "LoginLog_templeId_idx" ON "LoginLog"("templeId");
CREATE INDEX IF NOT EXISTS "LoginLog_userId_idx" ON "LoginLog"("userId");
CREATE INDEX IF NOT EXISTS "LoginLog_email_idx" ON "LoginLog"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "UserAuditLog_templeId_idx" ON "UserAuditLog"("templeId");
CREATE INDEX IF NOT EXISTS "UserAuditLog_userId_idx" ON "UserAuditLog"("userId");
CREATE INDEX IF NOT EXISTS "UserAuditLog_actorUserId_idx" ON "UserAuditLog"("actorUserId");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoginLog" ADD CONSTRAINT "LoginLog_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoginLog" ADD CONSTRAINT "LoginLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
