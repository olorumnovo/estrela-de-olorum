WITH modules(name) AS (
  VALUES
    ('dashboard'),
    ('membros'),
    ('usuarios'),
    ('configuracoes'),
    ('agenda'),
    ('atendimentos'),
    ('financeiro'),
    ('mensalidades'),
    ('estoque'),
    ('pdv'),
    ('relatorios'),
    ('notificacoes'),
    ('auditoria')
),
actions(name) AS (
  VALUES
    ('visualizar'),
    ('criar'),
    ('editar'),
    ('excluir'),
    ('exportar'),
    ('administrar')
),
base_permissions AS (
  SELECT
    (modules.name || '.' || actions.name) AS codigo,
    (modules.name || '.' || actions.name) AS chave,
    (modules.name || ' ' || actions.name) AS nome,
    ('Permite ' || actions.name || ' em ' || modules.name || '.') AS descricao,
    modules.name AS modulo,
    actions.name AS acao
  FROM modules
  CROSS JOIN actions
),
critical_permissions(codigo, chave, nome, descricao, modulo, acao) AS (
  VALUES
    ('usuarios.administrar', 'usuarios.administrar', 'Administrar usuários', 'Permite administrar usuários, perfis, permissões, sessões e auditoria.', 'usuarios', 'administrar'),
    ('configuracoes.administrar', 'configuracoes.administrar', 'Administrar configurações', 'Permite administrar as configurações do sistema.', 'configuracoes', 'administrar'),
    ('administrador.total', 'administrador.total', 'Acesso total', 'Permissão total do sistema.', 'usuarios', 'administrar')
),
all_permissions AS (
  SELECT DISTINCT ON (codigo) *
  FROM (
    SELECT * FROM critical_permissions
    UNION ALL
    SELECT * FROM base_permissions
  ) permissions
  ORDER BY codigo
)
INSERT INTO "Permission" (
  "id",
  "templeId",
  "chave",
  "codigo",
  "nome",
  "descricao",
  "modulo",
  "acao",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "Temple"."id",
  all_permissions.chave,
  all_permissions.codigo,
  all_permissions.nome,
  all_permissions.descricao,
  all_permissions.modulo,
  all_permissions.acao,
  NOW(),
  NOW()
FROM "Temple"
CROSS JOIN all_permissions
ON CONFLICT ("templeId", "codigo") DO UPDATE SET
  "chave" = EXCLUDED."chave",
  "nome" = EXCLUDED."nome",
  "descricao" = EXCLUDED."descricao",
  "modulo" = EXCLUDED."modulo",
  "acao" = EXCLUDED."acao",
  "updatedAt" = NOW();

WITH roles(nome, descricao) AS (
  VALUES
    ('Administrador', 'Perfil Administrador'),
    ('Gestor', 'Perfil Gestor'),
    ('Operador', 'Perfil Operador'),
    ('Financeiro', 'Perfil Financeiro'),
    ('Atendimento', 'Perfil Atendimento'),
    ('Estoque', 'Perfil Estoque'),
    ('Somente leitura', 'Perfil Somente leitura')
)
INSERT INTO "Role" (
  "id",
  "templeId",
  "nome",
  "descricao",
  "ativo",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "Temple"."id",
  roles.nome,
  roles.descricao,
  true,
  NOW(),
  NOW()
FROM "Temple"
CROSS JOIN roles
ON CONFLICT ("templeId", "nome") DO UPDATE SET
  "ativo" = true,
  "updatedAt" = NOW();

INSERT INTO "RolePermission" (
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  "Role"."id",
  "Permission"."id",
  NOW()
FROM "Role"
INNER JOIN "Permission" ON "Permission"."templeId" = "Role"."templeId"
WHERE "Role"."nome" = 'Administrador'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "UserRole" (
  "id",
  "userId",
  "roleId",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  "User"."id",
  "Role"."id",
  NOW()
FROM "User"
INNER JOIN "Role" ON "Role"."templeId" = "User"."templeId" AND "Role"."nome" = 'Administrador'
WHERE
  "User"."deletedAt" IS NULL
  AND "User"."status" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "UserRole" WHERE "UserRole"."userId" = "User"."id"
  )
ON CONFLICT ("userId", "roleId") DO NOTHING;
