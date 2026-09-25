import { NextRequest, NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/errors";
import {
  exchangeAuthorizationCode,
  verifyOlistStateToken,
} from "@/lib/olist/oauth";
import { saveOlistTokens } from "@/lib/olist/settings";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      throw new Error(`A Olist retornou erro na autorização: ${error}`);
    }

    if (!code || !state) {
      return ApiResponse.error("Código de autorização inválido.", 400);
    }

    const payload = verifyOlistStateToken(state);
    const tokens = await exchangeAuthorizationCode(code);

    await saveOlistTokens(payload.templeId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      expiresIn: tokens.expires_in,
      refreshExpiresIn: tokens.refresh_expires_in,
      rawTokenResponse: tokens,
    });

    const redirectUrl = new URL("/", req.url);
    redirectUrl.searchParams.set("olist", "connected");

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

