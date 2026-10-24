/**
 * In-process scheduler. Every minute it calls the internal publish-due route
 * (row locks make concurrent runners safe, so a Railway cron service can
 * replace this later without changes) and, when the newsroom bot is set up,
 * the Telegram tick (draft cards and their updates).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SCHEDULER === "off") return;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return;

  const g = globalThis as unknown as { __nwmScheduler?: ReturnType<typeof setInterval> };
  if (g.__nwmScheduler) return;

  const port = process.env.PORT ?? "3000";
  const base = `http://127.0.0.1:${port}/api/internal`;
  const call = (path: string) => fetch(`${base}/${path}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } }).catch(() => {});
  g.__nwmScheduler = setInterval(() => {
    call("publish-due");
    if (process.env.NEWSROOM_TELEGRAM_BOT_TOKEN?.trim()) call("telegram-tick");
  }, 60_000);
}
