export const permissionModules = [
  "dashboard",
  "membros",
  "usuarios",
  "configuracoes",
  "agenda",
  "atendimentos",
  "financeiro",
  "mensalidades",
  "estoque",
  "pdv",
  "relatorios",
  "notificacoes",
  "auditoria",
];

export const permissionActions = [
  "visualizar",
  "criar",
  "editar",
  "excluir",
  "exportar",
  "imprimir",
  "aprovar",
  "cancelar",
  "receber",
  "pagar",
  "administrar",
];

const matrixActions = [
  "visualizar",
  "criar",
  "editar",
  "excluir",
  "exportar",
  "administrar",
];

export const defaultPermissions = permissionModules.flatMap((modulo) =>
  matrixActions.map((acao) => ({
    codigo: `${modulo}.${acao}`,
    chave: `${modulo}.${acao}`,
    nome: `${modulo} ${acao}`,
    descricao: `Permite ${acao} em ${modulo}.`,
    modulo,
    acao,
  }))
);

export const criticalPermissions = [
  {
    codigo: "usuarios.administrar",
    chave: "usuarios.administrar",
    nome: "Administrar usuários",
    descricao: "Permite administrar usuários, perfis, permissões, sessões e auditoria.",
    modulo: "usuarios",
    acao: "administrar",
  },
  {
    codigo: "configuracoes.administrar",
    chave: "configuracoes.administrar",
    nome: "Administrar configurações",
    descricao: "Permite administrar as configurações do sistema.",
    modulo: "configuracoes",
    acao: "administrar",
  },
  {
    codigo: "administrador.total",
    chave: "administrador.total",
    nome: "Acesso total",
    descricao: "Permissão total do sistema.",
    modulo: "usuarios",
    acao: "administrar",
  },
];

export const seededPermissions = [
  ...defaultPermissions,
  ...criticalPermissions,
].filter(
  (permission, index, list) =>
    list.findIndex((item) => item.codigo === permission.codigo) === index
);

export const defaultRoles = [
  "Administrador",
  "Gestor",
  "Operador",
  "Financeiro",
  "Atendimento",
  "Estoque",
  "PDV",
  "Somente leitura",
];
