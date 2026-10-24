import { after, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { T } from "@/lib/cache-tags";
import { SITE } from "@/lib/site";
import { cdnPurge, invalidateFromRoute, refreshInBackground } from "@/server/invalidate";
import { newsroomBotToken, telegramClient, validWebhookSecret } from "@/server/telegram/api";
import { handleUpdate, type TgUpdate } from "@/server/telegram/bot";
import { botReviser } from "@/server/telegram/revise";

/**
 * Webhook for the newsroom bot (registered from 뉴스룸 → 설정 → 텔레그램).
 * Telegram signs each call with the secret derived from the bot token.
 * Publishing runs in the request, so the site's caches are refreshed here;
 * slow AI edits run after the response.
 */

/** update_ids already handled: Telegram resends an update it thinks failed */
const seen = new Set<number>();

export async function POST(req: NextRequest) {
  const token = newsroomBotToken();
  const tg = telegramClient(token);
  if (!token || !tg) return new Response(null, { status: 404 });
  if (!validWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"), token)) return new Response(null, { status: 401 });

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update || typeof update.update_id !== "number" || seen.has(update.update_id)) return new Response(null, { status: 200 });
  seen.add(update.update_id);
  if (seen.size > 500) seen.delete(seen.values().next().value!);

  try {
    const later = await handleUpdate(
      {
        db,
        tg,
        site: SITE.url,
        published: (r) => {
          invalidateFromRoute(r.tags);
          refreshInBackground([T.rel]);
          after(() => cdnPurge(r.paths));
        },
        revise: botReviser(),
      },
      update,
    );
    if (later) after(later);
  } catch (e) {
    console.error("[telegram] update failed:", e instanceof Error ? e.message : e);
  }
  // always 200: a retried publish must never run twice
  return new Response(null, { status: 200 });
}
