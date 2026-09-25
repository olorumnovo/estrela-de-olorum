import { getOlistConnection, saveOlistTokens } from "./settings";
import { refreshOlistAccessToken } from "./oauth";

const OLIST_API_BASE_URL =
  process.env.OLIST_API_BASE_URL ?? "https://erp.tiny.com.br/public-api/v3";

type OlistRequestOptions = {
  searchParams?: Record<string, string | number | undefined>;
};

function isExpired(dateValue: string | null, toleranceMs = 60_000) {
  if (!dateValue) {
    return true;
  }

  const expiresAt = new Date(dateValue).getTime();

  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + toleranceMs;
}

async function resolveAccessToken(templeId: string) {
  const connection = await getOlistConnection(templeId);

  if (!connection.accessToken) {
    throw new Error("A conta Olist não está conectada neste templo.");
  }

  if (!isExpired(connection.accessTokenExpiresAt)) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw new Error("O token da Olist expirou e não há refresh token salvo.");
  }

  const refreshed = await refreshOlistAccessToken(connection.refreshToken);

  await saveOlistTokens(templeId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? connection.refreshToken,
    tokenType: refreshed.token_type,
    scope: refreshed.scope,
    expiresIn: refreshed.expires_in,
    refreshExpiresIn: refreshed.refresh_expires_in,
    rawTokenResponse: refreshed,
  });

  return refreshed.access_token;
}

async function forceRefreshAccessToken(templeId: string) {
  const connection = await getOlistConnection(templeId);

  if (!connection.refreshToken) {
    throw new Error("A conta Olist precisa ser reconectada para renovar o token.");
  }

  const refreshed = await refreshOlistAccessToken(connection.refreshToken);

  await saveOlistTokens(templeId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? connection.refreshToken,
    tokenType: refreshed.token_type,
    scope: refreshed.scope,
    expiresIn: refreshed.expires_in,
    refreshExpiresIn: refreshed.refresh_expires_in,
    rawTokenResponse: refreshed,
  });

  return refreshed.access_token;
}

export async function olistRequest<T>(
  templeId: string,
  path: string,
  options?: OlistRequestOptions,
  retryAttempt = 0
) {
  const accessToken = await resolveAccessToken(templeId);
  const url = new URL(`${OLIST_API_BASE_URL}${path}`);

  if (options?.searchParams) {
    Object.entries(options.searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401 && retryAttempt === 0) {
    await forceRefreshAccessToken(templeId);

    return olistRequest<T>(templeId, path, options, 1);
  }

  const rawBody = await response.text();
  let data: unknown = null;

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch (error) {
      if (retryAttempt < 3) {
        return olistRequest<T>(templeId, path, options, retryAttempt + 1);
      }

      throw error;
    }
  } else if (retryAttempt < 3) {
    return olistRequest<T>(templeId, path, options, retryAttempt + 1);
  }

  if (!response.ok) {
    if (retryAttempt < 3) {
      return olistRequest<T>(templeId, path, options, retryAttempt + 1);
    }

    throw new Error(
      (typeof data === "object" && data && "mensagem" in data && typeof data.mensagem === "string"
        ? data.mensagem
        : typeof data === "object" && data && "message" in data && typeof data.message === "string"
          ? data.message
          : "Erro ao consultar a API da Olist.")
    );
  }

  return data as T;
}
