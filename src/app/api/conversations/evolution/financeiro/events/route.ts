import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { subscribeEvolutionRealtime } from "@/lib/evolution/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({
            success: true,
            channel: "financeiro",
          })}\n\n`
        )
      );

      const unsubscribe = subscribeEvolutionRealtime((payload) => {
        if (payload.channel !== "financeiro" || payload.templeId !== user.templeId) {
          return;
        }

        controller.enqueue(
          encoder.encode(`event: whatsapp\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
