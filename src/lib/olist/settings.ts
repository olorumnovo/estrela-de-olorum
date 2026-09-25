import { prisma } from "@/lib/prisma";

const OLIST_SETTING_KEYS = {
  accessToken: "olist.access_token",
  refreshToken: "olist.refresh_token",
  tokenType: "olist.token_type",
  accessTokenExpiresAt: "olist.access_token_expires_at",
  refreshTokenExpiresAt: "olist.refresh_token_expires_at",
  scope: "olist.scope",
  rawTokenResponse: "olist.raw_token_response",
  lastProductsSyncAt: "olist.last_products_sync_at",
} as const;

export type OlistConnection = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  rawTokenResponse: string | null;
  lastProductsSyncAt: string | null;
};

async function getTempleSettings(templeId: string, keys: string[]) {
  const settings = await prisma.setting.findMany({
    where: {
      templeId,
      chave: {
        in: keys,
      },
    },
    select: {
      chave: true,
      valor: true,
    },
  });

  return new Map(settings.map((setting) => [setting.chave, setting.valor]));
}

export async function getOlistConnection(templeId: string): Promise<OlistConnection> {
  const values = await getTempleSettings(templeId, Object.values(OLIST_SETTING_KEYS));

  return {
    accessToken: values.get(OLIST_SETTING_KEYS.accessToken) ?? null,
    refreshToken: values.get(OLIST_SETTING_KEYS.refreshToken) ?? null,
    tokenType: values.get(OLIST_SETTING_KEYS.tokenType) ?? null,
    scope: values.get(OLIST_SETTING_KEYS.scope) ?? null,
    accessTokenExpiresAt:
      values.get(OLIST_SETTING_KEYS.accessTokenExpiresAt) ?? null,
    refreshTokenExpiresAt:
      values.get(OLIST_SETTING_KEYS.refreshTokenExpiresAt) ?? null,
    rawTokenResponse: values.get(OLIST_SETTING_KEYS.rawTokenResponse) ?? null,
    lastProductsSyncAt: values.get(OLIST_SETTING_KEYS.lastProductsSyncAt) ?? null,
  };
}

export async function saveOlistTokens(
  templeId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    expiresIn?: number;
    refreshExpiresIn?: number;
    rawTokenResponse?: unknown;
  }
) {
  const now = Date.now();
  const accessTokenExpiresAt =
    typeof tokens.expiresIn === "number"
      ? new Date(now + tokens.expiresIn * 1000).toISOString()
      : null;
  const refreshTokenExpiresAt =
    typeof tokens.refreshExpiresIn === "number"
      ? new Date(now + tokens.refreshExpiresIn * 1000).toISOString()
      : null;

  const entries: Array<{ chave: string; valor: string | null }> = [
    { chave: OLIST_SETTING_KEYS.accessToken, valor: tokens.accessToken },
    {
      chave: OLIST_SETTING_KEYS.refreshToken,
      valor: tokens.refreshToken ?? null,
    },
    {
      chave: OLIST_SETTING_KEYS.tokenType,
      valor: tokens.tokenType ?? "Bearer",
    },
    {
      chave: OLIST_SETTING_KEYS.scope,
      valor: tokens.scope ?? null,
    },
    {
      chave: OLIST_SETTING_KEYS.accessTokenExpiresAt,
      valor: accessTokenExpiresAt,
    },
    {
      chave: OLIST_SETTING_KEYS.refreshTokenExpiresAt,
      valor: refreshTokenExpiresAt,
    },
    {
      chave: OLIST_SETTING_KEYS.rawTokenResponse,
      valor:
        tokens.rawTokenResponse === undefined
          ? null
          : JSON.stringify(tokens.rawTokenResponse),
    },
  ];

  await Promise.all(
    entries.map(({ chave, valor }) =>
      prisma.setting.upsert({
        where: {
          templeId_chave: {
            templeId,
            chave,
          },
        },
        update: {
          valor,
        },
        create: {
          templeId,
          chave,
          valor,
        },
      })
    )
  );
}

export async function markOlistProductsSync(templeId: string) {
  await prisma.setting.upsert({
    where: {
      templeId_chave: {
        templeId,
        chave: OLIST_SETTING_KEYS.lastProductsSyncAt,
      },
    },
    update: {
      valor: new Date().toISOString(),
    },
    create: {
      templeId,
      chave: OLIST_SETTING_KEYS.lastProductsSyncAt,
      valor: new Date().toISOString(),
    },
  });
}

