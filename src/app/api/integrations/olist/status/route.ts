import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { getOlistConnection } from "@/lib/olist/settings";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const connection = await getOlistConnection(user.templeId);

    return ApiResponse.success({
      configured: Boolean(
        process.env.OLIST_CLIENT_ID &&
          process.env.OLIST_CLIENT_SECRET &&
          process.env.OLIST_REDIRECT_URI
      ),
      connected: Boolean(connection.accessToken),
      expiresAt: connection.accessTokenExpiresAt,
      refreshExpiresAt: connection.refreshTokenExpiresAt,
      lastProductsSyncAt: connection.lastProductsSyncAt,
      scope: connection.scope,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

