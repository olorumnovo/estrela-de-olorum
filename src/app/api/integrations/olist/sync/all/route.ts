import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { syncOlistPayables, syncOlistReceivables } from "@/lib/olist/financial";
import { syncOlistProducts } from "@/lib/olist/products";
import { ApiResponse } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const [products, payables, receivables] = await Promise.all([
      syncOlistProducts(user.templeId),
      syncOlistPayables(user.templeId),
      syncOlistReceivables(user.templeId),
    ]);

    return ApiResponse.success({
      success: true,
      syncedAt: new Date().toISOString(),
      modules: {
        products,
        payables,
        receivables,
      },
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
