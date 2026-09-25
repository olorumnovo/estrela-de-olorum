export type ReligiousLookupType =
  | "spiritual-entities"
  | "contact-types"
  | "religious-functions";

export type SpiritualEntityType =
  | "pai-frente"
  | "pai-costas"
  | "mae-frente"
  | "mae-costas";

export type ReligiousLookupConfig = {
  type: ReligiousLookupType;
  slug: string;
  title: string;
  singularTitle: string;
  description: string;
  buttonLabel: string;
  api: string;
  entityType?: SpiritualEntityType;
};

export const religiousLookupConfigs = [
  {
    type: "spiritual-entities",
    slug: "pai-de-frente",
    title: "Pai de Frente",
    singularTitle: "Pai de Frente",
    description:
      "Opções exibidas no select Pai de Frente.",
    buttonLabel: "Novo Pai de Frente",
    api: "/api/spiritual-entities",
    entityType: "pai-frente",
  },
  {
    type: "spiritual-entities",
    slug: "pai-de-costas",
    title: "Pai de Costas",
    singularTitle: "Pai de Costas",
    description:
      "Opções exibidas no select Pai de Costas.",
    buttonLabel: "Novo Pai de Costas",
    api: "/api/spiritual-entities",
    entityType: "pai-costas",
  },
  {
    type: "spiritual-entities",
    slug: "mae-de-frente",
    title: "Mãe de Frente",
    singularTitle: "Mãe de Frente",
    description:
      "Opções exibidas no select Mãe de Frente.",
    buttonLabel: "Nova Mãe de Frente",
    api: "/api/spiritual-entities",
    entityType: "mae-frente",
  },
  {
    type: "spiritual-entities",
    slug: "mae-de-costas",
    title: "Mãe de Costas",
    singularTitle: "Mãe de Costas",
    description:
      "Opções exibidas no select Mãe de Costas.",
    buttonLabel: "Nova Mãe de Costas",
    api: "/api/spiritual-entities",
    entityType: "mae-costas",
  },
] as const satisfies ReligiousLookupConfig[];

export function getReligiousLookupConfig(
  slug: string
) {
  return religiousLookupConfigs.find(
    (config) => config.slug === slug
  );
}
