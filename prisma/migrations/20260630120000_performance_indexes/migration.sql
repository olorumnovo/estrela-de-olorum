CREATE INDEX IF NOT EXISTS "Member_temple_deleted_status_idx"
  ON "Member" ("templeId", "deletedAt", "status");

CREATE INDEX IF NOT EXISTS "Member_temple_deleted_created_idx"
  ON "Member" ("templeId", "deletedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Member_temple_deleted_name_idx"
  ON "Member" ("templeId", "deletedAt", "nome");

CREATE INDEX IF NOT EXISTS "MonthlyFee_temple_deleted_status_idx"
  ON "MonthlyFee" ("templeId", "deletedAt", "status");

CREATE INDEX IF NOT EXISTS "MonthlyFee_temple_deleted_status_member_idx"
  ON "MonthlyFee" ("templeId", "deletedAt", "status", "memberId");

CREATE INDEX IF NOT EXISTS "FinancialTransaction_temple_deleted_tipo_idx"
  ON "FinancialTransaction" ("templeId", "deletedAt", "tipo");

CREATE INDEX IF NOT EXISTS "Sale_temple_created_idx"
  ON "Sale" ("templeId", "createdAt");

CREATE INDEX IF NOT EXISTS "Schedule_temple_deleted_inicio_idx"
  ON "Schedule" ("templeId", "deletedAt", "inicio");

CREATE INDEX IF NOT EXISTS "Notification_temple_created_idx"
  ON "Notification" ("templeId", "createdAt");

CREATE INDEX IF NOT EXISTS "UserRole_user_idx"
  ON "UserRole" ("userId");
