import jwt from "jsonwebtoken";

function getJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET não configurado.");
  }

  return jwtSecret;
}

const OLIST_CLIENT_ID = process.env.OLIST_CLIENT_ID;
const OLIST_CLIENT_SECRET = process.env.OLIST_CLIENT_SECRET;
const OLIST_REDIRECT_URI = process.env.OLIST_REDIRECT_URI;
const OLIST_AUTH_BASE_URL =
  process.env.OLIST_AUTH_BASE_URL ??
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect";

type OlistOAuthState = {
  templeId: string;
  userId: string;
};

export function assertOlistEnv() {
  if (!OLIST_CLIENT_ID || !OLIST_CLIENT_SECRET || !OLIST_REDIRECT_URI) {
    throw new Error(
      "Configure OLIST_CLIENT_ID, OLIST_CLIENT_SECRET e OLIST_REDIRECT_URI."
    );
  }

  return {
    clientId: OLIST_CLIENT_ID,
    clientSecret: OLIST_CLIENT_SECRET,
    redirectUri: OLIST_REDIRECT_URI,
    authBaseUrl: OLIST_AUTH_BASE_URL,
  };
}

export function createOlistStateToken(payload: OlistOAuthState) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "15m",
  });
}

export function verifyOlistStateToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as OlistOAuthState;
}

export function buildOlistAuthorizationUrl(payload: OlistOAuthState) {
  const { clientId, redirectUri, authBaseUrl } = assertOlistEnv();
  const state = createOlistStateToken(payload);
  const url = new URL(`${authBaseUrl}/auth`);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeAuthorizationCode(code: string) {
  const { clientId, clientSecret, redirectUri, authBaseUrl } = assertOlistEnv();

  const response = await fetch(`${authBaseUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error_description || data?.error || "Falha ao autenticar com a Olist.");
  }

  return data as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
    refresh_expires_in?: number;
  };
}

export async function refreshOlistAccessToken(refreshToken: string) {
  const { clientId, clientSecret, authBaseUrl } = assertOlistEnv();

  const response = await fetch(`${authBaseUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "Falha ao renovar token da Olist."
    );
  }

  return data as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
    refresh_expires_in?: number;
  };
}
