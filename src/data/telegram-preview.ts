import "server-only";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { articles, candidates } from "@/db/schema";
import { newsroomBotToken } from "@/server/telegram/api";
import { linkedEditor } from "@/server/telegram/links";
import { readTicket, UUID } from "@/server/telegram/webapp";

/**
 * A draft for the newsroom bot's Mini App preview (/tg/preview/[id]). No Basic
 * Auth here: the ticket from /api/telegram/webapp names the Telegram user and
 * the editor, and the link between them must still hold.
 */
export async function getMiniAppPreview(id: string, ticket: string | null) {
  await connection();
  const token = newsroomBotToken();
  if (!token || !UUID.test(id)) return { state: "denied" as const };
  const t = readTicket(ticket, token);
  if (!t || t.candidateId !== id.toLowerCase()) return { state: "signin" as const };
  const linked = await linkedEditor(db, t.tgUserId);
  if (!linked || linked.me.id !== t.staffId) return { state: "denied" as const };

  const c = await db.query.candidates.findFirst({ where: eq(candidates.id, t.candidateId), with: { story: { columns: { title: true } } } });
  if (!c) return { state: "missing" as const };
  const article = c.articleId
    ? await db.query.articles.findFirst({
        where: eq(articles.id, c.articleId),
        columns: { slug: true, status: true, byline: true },
        with: { editor: { columns: { name: true } } },
      })
    : null;
  return {
    state: "ok" as const,
    viewer: linked.me.name,
    candidate: {
      id: c.id,
      status: c.status,
      mode: c.mode,
      beat: c.beat,
      draft: c.draft,
      generator: c.generator,
      updatedAt: c.updatedAt.toISOString(),
      storyTitle: c.story?.title ?? null,
      article: article ? { slug: article.slug, status: article.status, byline: article.byline, editorName: article.editor?.name ?? null } : null,
    },
  };
}
