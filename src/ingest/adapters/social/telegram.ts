import { parse } from "node-html-parser";
import { z } from "zod";
import { passesKeywords } from "../../classify";
import { clip, htmlToText, parseCount, parseDate } from "../../text";
import { ConfigError, defineAdapter, type IngestItem, type SocialPostIn } from "../../types";

/**
 * Telegram channels the editors chose.
 *  - telegram.channel: the public web preview (t.me/s/<channel>), no account needed
 *  - telegram.bot: channels where our bot was added as an admin (consent built in)
 * Telegram's terms forbid using channel content for AI/ML without consent, so
 * LLM scoring stays off unless the source records the operator's consent.
 */

const output = z.array(z.enum(["items", "posts"])).min(1).default(["items"]);

const channelConfig = z.object({
  channel: z.string().regex(/^[A-Za-z0-9_]{4,64}$/),
  output,
  /** the channel operator agreed in writing to AI analysis (sentiment scoring) */
  llmConsent: z.boolean().default(false),
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  maxPages: z.number().int().min(1).max(5).default(2),
  weight: z.number().min(0).max(1).default(0.45),
});

export interface TgMessage {
  id: number;
  text: string;
  date?: Date;
  views?: number;
  forwardedFrom?: string;
  link: string;
}

/** Exported for fixtures: t.me/s HTML → messages (oldest first, as on the page). */
export function parseChannelPage(html: string, channel: string): { messages: TgMessage[]; before?: number } {
  const root = parse(html);
  const messages: TgMessage[] = [];
  for (const el of root.querySelectorAll(".tgme_widget_message[data-post]")) {
    const post = el.getAttribute("data-post") ?? "";
    const id = Number(post.split("/")[1]);
    if (!Number.isFinite(id)) continue;
    const textEl = el.querySelector(".tgme_widget_message_text");
    const text = textEl ? htmlToText(textEl.innerHTML) : "";
    const time = el.querySelector(".tgme_widget_message_date time")?.getAttribute("datetime");
    messages.push({
      id,
      text,
      date: parseDate(time) ?? undefined,
      views: parseCount(el.querySelector(".tgme_widget_message_views")?.textContent),
      forwardedFrom: el.querySelector(".tgme_widget_message_forwarded_from_name")?.textContent.trim() || undefined,
      link: `https://t.me/${channel}/${id}`,
    });
  }
  const before = Number(root.querySelector(".tme_messages_more[data-before]")?.getAttribute("data-before"));
  return { messages, before: Number.isFinite(before) ? before : undefined };
}

function toOutputs(msgs: TgMessage[], channel: string, c: { output: Array<"items" | "posts">; include?: string[]; exclude?: string[]; weight: number }, now: Date) {
  const items: IngestItem[] = [];
  const posts: SocialPostIn[] = [];
  for (const m of msgs) {
    if (!m.text) continue; // media without caption
    if (!passesKeywords(m.text, c.include, c.exclude)) continue;
    const [first, ...rest] = m.text.split("\n").filter((l) => l.trim());
    const title = clip(first.replace(/^\[(.+)\]$/, "$1"), 140);
    if (c.output.includes("items")) {
      items.push({
        externalId: String(m.id),
        url: m.link,
        title,
        summary: clip(rest.join(" "), 600),
        publishedAt: m.date ?? null,
        weight: c.weight,
        payload: { channel, views: m.views, ...(m.forwardedFrom ? { forwardedFrom: m.forwardedFrom } : {}) },
      });
    }
    if (c.output.includes("posts")) {
      posts.push({ externalId: String(m.id), url: m.link, author: channel, text: clip(m.text, 1500), postedAt: m.date ?? now, engagement: { views: m.views } });
    }
  }
  return { items, posts };
}

export const telegramChannelAdapter = defineAdapter({
  key: "telegram.channel",
  label: "텔레그램 공개 채널",
  description: "t.me/s 공개 미리보기로 채널 글을 읽습니다(계정 불필요). 뉴스 채널은 인박스로, 센티먼트용은 posts로. AI 채점은 운영자 동의(llmConsent)가 있을 때만.",
  kind: "scrape",
  group: "social",
  configSchema: channelConfig,
  configExample: { channel: "coinnesskr", output: ["items"], llmConsent: false, maxPages: 2, weight: 0.45 },
  defaultPollSec: 120,
  async run(ctx) {
    const c = ctx.config;
    const lastId = Number(ctx.state.lastId ?? 0);
    let page = parseChannelPage(await ctx.http.text(`https://t.me/s/${c.channel}`, { timeoutMs: 20_000 }), c.channel);
    if (!page.messages.length) throw new Error(`no messages on t.me/s/${c.channel} (private channel or preview disabled?)`);
    const all = [...page.messages];
    // walk back while the whole page is new (bounded)
    for (let p = 1; p < c.maxPages && lastId && page.before && Math.min(...page.messages.map((m) => m.id)) > lastId; p++) {
      page = parseChannelPage(await ctx.http.text(`https://t.me/s/${c.channel}?before=${page.before}`, { timeoutMs: 20_000 }), c.channel);
      all.unshift(...page.messages);
    }
    const fresh = all.filter((m) => m.id > lastId);
    const { items, posts } = toOutputs(lastId ? fresh : all, c.channel, c, ctx.now);
    const newest = Math.max(lastId, ...all.map((m) => m.id));
    return { items, posts, state: { lastId: newest }, note: `${fresh.length} new (last ${newest})` };
  },
});

const botConfig = z.object({
  /** channel usernames (without @) or numeric ids to accept; empty = every channel the bot is in */
  channels: z.array(z.string().regex(/^(-?\d+|[A-Za-z0-9_]{4,64})$/)).max(200).default([]),
  output,
  /** adding our bot as admin is the operator's consent; set false to keep posts out of LLM scoring */
  llmConsent: z.boolean().default(true),
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  weight: z.number().min(0).max(1).default(0.45),
});

interface TgUpdate {
  update_id: number;
  channel_post?: { message_id: number; date: number; text?: string; caption?: string; chat: { id: number; username?: string; title?: string } };
}

export const telegramBotAdapter = defineAdapter({
  key: "telegram.bot",
  label: "텔레그램 봇 (동의 채널)",
  description: "운영자가 우리 봇을 관리자로 추가한 채널의 글을 Bot API(getUpdates)로 받습니다. 비공개 채널도 가능하며 동의가 전제입니다.",
  kind: "api",
  group: "social",
  configSchema: botConfig,
  configExample: { channels: [], output: ["items", "posts"], llmConsent: true, weight: 0.45 },
  envVars: [{ name: "TELEGRAM_BOT_TOKEN", required: true, help: "@BotFather에서 받은 봇 토큰" }],
  defaultPollSec: 60,
  async run(ctx) {
    const c = ctx.config;
    const token = ctx.secret("TELEGRAM_BOT_TOKEN")!;
    const offset = Number(ctx.state.offset ?? 0);
    const data = await ctx.http.json<{ ok: boolean; description?: string; error_code?: number; result?: TgUpdate[] }>(
      `https://api.telegram.org/bot${token}/getUpdates?timeout=0&limit=100${offset ? `&offset=${offset}` : ""}&allowed_updates=${encodeURIComponent('["channel_post"]')}`,
      { okStatuses: [401, 409] },
    );
    if (!data.ok) {
      if (data.error_code === 401) throw new ConfigError("텔레그램 봇 토큰이 올바르지 않습니다");
      if (data.error_code === 409) throw new ConfigError("이 봇에 웹훅이 설정돼 있어 getUpdates를 쓸 수 없습니다 (deleteWebhook 필요)");
      throw new Error(`telegram: ${data.description ?? "error"}`);
    }
    const allow = new Set(c.channels.map((x) => x.toLowerCase()));
    const byChannel = new Map<string, TgMessage[]>();
    let maxUpdate = offset - 1;
    for (const u of data.result ?? []) {
      maxUpdate = Math.max(maxUpdate, u.update_id);
      const p = u.channel_post;
      if (!p) continue;
      const name = p.chat.username ?? String(p.chat.id);
      if (allow.size && !allow.has(name.toLowerCase()) && !allow.has(String(p.chat.id))) continue;
      const text = (p.text ?? p.caption ?? "").trim();
      const list = byChannel.get(name) ?? [];
      list.push({ id: p.message_id, text, date: new Date(p.date * 1000), link: p.chat.username ? `https://t.me/${p.chat.username}/${p.message_id}` : `https://t.me/c/${String(p.chat.id).replace(/^-100/, "")}/${p.message_id}` });
      byChannel.set(name, list);
    }
    const items: IngestItem[] = [];
    const posts: SocialPostIn[] = [];
    for (const [name, msgs] of byChannel) {
      const out = toOutputs(msgs, name, c, ctx.now);
      // ids are per channel: prefix them
      items.push(...out.items.map((i) => ({ ...i, externalId: `${name}/${i.externalId}` })));
      posts.push(...out.posts.map((p) => ({ ...p, externalId: `${name}/${p.externalId}` })));
    }
    return { items, posts, state: { offset: maxUpdate + 1 }, note: `${data.result?.length ?? 0} updates from ${byChannel.size} channels` };
  },
});
