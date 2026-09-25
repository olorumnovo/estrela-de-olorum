import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import {
  getReceivableWhatsappTemplates,
  receivableWhatsappTemplateKeys,
  ReceivableWhatsappTemplateKind,
} from "@/lib/finance/receivable-whatsapp-templates";
import { prisma } from "@/lib/prisma";
import { CHARGE_AUTOMATION_KEY, getChargeAutomationSetting } from "@/lib/finance/receivable-charge-automation";
import { Prisma } from "@prisma/client";
import { ApiResponse } from "@/lib/response";

const kinds = Object.keys(
  receivableWhatsappTemplateKeys
) as ReceivableWhatsappTemplateKind[];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return ApiResponse.success(
      await getReceivableWhatsappTemplates(user.templeId)
    );
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();

    for (const kind of kinds) {
      if (!String(body[kind] || "").trim()) {
        return ApiResponse.error("Os três modelos de cobrança devem ser preenchidos.");
      }
    }

    await getChargeAutomationSetting(user.templeId);
    const saved = await prisma.$transaction(async (tx) => {
      const state = await tx.setting.findUnique({
        where: { templeId_chave: { templeId: user.templeId, chave: CHARGE_AUTOMATION_KEY } },
      });
      if (JSON.parse(state?.valor || "{}").enabled === true) return false;
      for (const kind of kinds) {
        await tx.setting.upsert({
          where: {
            templeId_chave: {
              templeId: user.templeId,
              chave: receivableWhatsappTemplateKeys[kind],
            },
          },
          create: {
            templeId: user.templeId,
            chave: receivableWhatsappTemplateKeys[kind],
            valor: String(body[kind]),
          },
          update: {
            valor: String(body[kind]),
          },
        });
      }
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!saved) return ApiResponse.error("Pause a cobrança automática antes de editar as mensagens.", 409);

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
