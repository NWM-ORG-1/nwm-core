import { expect, test, type Browser, type Locator } from "@playwright/test";
import postgres from "postgres";

/**
 * Newsroom flow against the shared database: auth → editor profile → promote two
 * inbox items → edit + checks → publish → public pages → 정정 → unpublish.
 * Everything the run creates is deleted again in afterAll.
 *
 * The server must accept the configured Basic credentials on /admin. Under
 * `next start` that needs ADMIN_USERS (and E2E_ADMIN_USER / E2E_ADMIN_PASS);
 * admin / nwm-dev is a `next dev` fallback only. A production server without
 * ADMIN_USERS has no newsroom by design (503), so the group is skipped there:
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/newsroom.spec.ts
 */

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://nwm:nwm@127.0.0.1:5432/nwm";
const ADMIN_LOGIN = process.env.E2E_ADMIN_USER ?? "admin";
const INTERNAL_SECRET = process.env.E2E_INTERNAL_SECRET ?? "dev-internal-secret";
/** First-login accounts are named 편집국; publishCandidate refuses AI articles signed by that placeholder. */
const PLACEHOLDER = "편집국";
const EDITOR = "테스트편집";
/** server actions (and the router refresh after them) */
const SLOW = { timeout: 20_000 };

const stamp = Date.now();
const run = {
  title: `E2E 검증 기사 ${stamp}`,
  note: `E2E 검증 정정 ${stamp}: 시그널 문구를 바로잡았습니다.`,
  startedAt: null as Date | null,
  items: [] as Array<{ id: string; title: string }>,
  profileSaved: false,
  candidateId: null as string | null,
  articleId: null as string | null,
  slug: null as string | null,
  beat: null as string | null,
};

let sql: postgres.Sql | undefined;
function db() {
  if (!sql) throw new Error("no database connection");
  return sql;
}

/**
 * Waits until React has hydrated a control. Typing into a controlled field before that
 * can be partly undone when hydration re-applies the server value (seen under `next dev`,
 * where hydration takes a few seconds).
 */
async function hydrated(control: Locator) {
  await expect
    .poll(() => control.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps$"))), { timeout: 20_000 })
    .toBe(true);
  return control;
}

/** A reader: fresh context, no Basic credentials. */
async function reader(browser: Browser) {
  const context = await browser.newContext({ httpCredentials: undefined });
  return { context, page: await context.newPage() };
}

test.describe.serial("newsroom", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeAll(async ({ playwright }, testInfo) => {
    const { baseURL, httpCredentials } = testInfo.project.use;
    const api = await playwright.request.newContext({ baseURL, httpCredentials });
    const status = (await api.get("/admin", { maxRedirects: 0 })).status();
    await api.dispose();
    test.skip(status === 503, "this server has no newsroom configured (next start without ADMIN_USERS) — run against next dev or set ADMIN_USERS");

    sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
    run.startedAt = (await db()<{ now: Date }[]>`select now() as now`)[0].now;
    // Two new items from usable sources (not signal-only, licence reviewed, commercial use, tier 1–2).
    // Verbatim-OK sources first: the mock draft lifts their sentences. Same beat: one beat page.
    const rows = await db()<{ id: string; title: string; beat: string | null; verbatim: boolean }[]>`
      select i.id, i.title, i.beat_guess as beat, coalesce(s.lic_verbatim_ok, false) as verbatim
        from feed_items i join feed_sources s on s.id = i.source_id
       where i.status = 'new' and not s.signal_only and s.lic_reviewed_at is not null
         and s.lic_commercial_ok is true and s.trust_tier <= 2
       order by coalesce(s.lic_verbatim_ok, false) desc, s.trust_tier, i.fetched_at desc`;
    const [first] = rows;
    const second = rows.find((r) => r !== first && r.beat === first.beat && r.verbatim === first.verbatim) ?? rows.find((r) => r !== first);
    if (!first || !second) throw new Error("need two new feed items from licence-reviewed sources (reseed: npm run db:seed)");
    run.items = [first, second].map(({ id, title }) => ({ id, title }));
  });

  test.afterAll(async ({ playwright }, testInfo) => {
    if (!sql) return;
    try {
      const slugs = await cleanup(sql);
      if (!slugs.length && !run.profileSaved && !run.candidateId) return;
      // Let the public site forget the test article (and the temporary editor name).
      const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
      const res = await api.post("/api/internal/revalidate", {
        headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
        data: { tags: ["feed", "rel", "editors", "corrections", "site", ...slugs.map((s) => `a:${s}`)] },
      });
      await api.dispose();
      expect(res.status(), "revalidate after cleanup").toBe(200);
    } finally {
      await sql.end({ timeout: 5 });
      sql = undefined;
    }
  });

  test("auth: /admin needs valid Basic credentials, internal routes a bearer token", async ({ page, browser, request }) => {
    const ok = await page.goto("/admin");
    expect(ok?.status(), "the configured credentials must get in — `next start` needs ADMIN_USERS").toBe(200);

    for (const [who, httpCredentials] of [
      ["wrong credentials", { username: ADMIN_LOGIN, password: "wrong-password" }],
      ["no credentials", undefined],
    ] as const) {
      const context = await browser.newContext({ httpCredentials });
      const res = await (await context.newPage()).goto("/admin");
      expect(res?.status(), who).toBe(401);
      await context.close();
    }

    expect((await request.post("/api/internal/revalidate", { data: { tags: ["feed"] } })).status()).toBe(401);
    const wrongBearer = await request.post("/api/internal/revalidate", { data: { tags: ["feed"] }, headers: { authorization: "Bearer wrong" } });
    expect(wrongBearer.status()).toBe(401);
  });

  test("profile: the editor signs with a real name", async ({ page }) => {
    await page.goto("/admin/settings");
    const form = page.getByRole("form", { name: /내 편집자 프로필/ });
    await (await hydrated(form.getByLabel("이름", { exact: true }))).fill(EDITOR);
    await form.getByLabel("직함", { exact: true }).fill("E2E 검증 데스크");
    run.profileSaved = true;
    await form.getByRole("button", { name: "프로필 저장" }).click();
    await expect(form.getByRole("status")).toHaveText("프로필을 저장했습니다.", SLOW);
  });

  test("promote: two inbox items become one candidate", async ({ page }) => {
    await page.goto("/admin/feeds");
    for (const item of run.items) await (await hydrated(page.getByRole("checkbox", { name: `선택: ${item.title}`, exact: true }))).check();
    const bar = page.getByRole("region", { name: "선택한 항목 작업" });
    await expect(bar).toContainText("2건 선택");
    await bar.getByRole("button", { name: "묶어서 1건으로 승격" }).click();
    await expect(bar.getByRole("status")).toContainText("후보 1건을 만들었습니다.", SLOW);

    const link = bar.getByRole("link", { name: /^후보\s*#[0-9a-f]{6}/ });
    const href = await link.getAttribute("href");
    run.candidateId = href?.match(/^\/admin\/candidates\/([0-9a-f-]{36})$/)?.[1] ?? null;
    expect(run.candidateId, `candidate link ${href}`).not.toBeNull();
    const linked = await db()<{ id: string }[]>`select feed_item_id as id from candidate_items where candidate_id = ${run.candidateId!}`;
    expect(linked.map((r) => r.id).sort()).toEqual(run.items.map((i) => i.id).sort());
    run.beat = (await db()<{ beat: string }[]>`select beat from candidates where id = ${run.candidateId!}`)[0].beat;

    await link.click();
    await expect(page).toHaveURL(new RegExp(`/admin/candidates/${run.candidateId}$`));
    await expect(page.getByRole("textbox", { name: /^제목/ })).toBeVisible();
  });

  test("edit: new title is autosaved, checks run, legal confirmed", async ({ page }) => {
    await page.goto(`/admin/candidates/${run.candidateId}`);
    await (await hydrated(page.getByRole("textbox", { name: /^제목/ }))).fill(run.title);
    // autosave fires 1.5 s after the last edit
    const changed = page.getByText("변경됨", { exact: true });
    await expect(changed).toBeVisible();
    await expect(changed).toBeHidden(SLOW);
    await expect(page.getByText("저장됨")).toBeVisible(SLOW);
    await expect
      .poll(async () => (await db()<{ t: string }[]>`select draft->>'title' as t from candidates where id = ${run.candidateId!}`)[0]?.t)
      .toBe(run.title);

    await page.getByRole("tab", { name: /^체크리스트/ }).click();
    const checks = page.getByRole("tabpanel", { name: /^체크리스트/ });
    await checks.getByRole("button", { name: /체크 실행|다시 실행/ }).click();
    await expect(checks.getByText(/마지막 실행/)).toBeVisible(SLOW);

    // the legal sign-off is manual and only valid for the draft it was given for: last
    const legal = checks.getByRole("checkbox", { name: /직접 확인했습니다/ });
    if (!(await legal.isChecked())) await legal.check();
    await expect(checks.locator('li[data-check="legal"]')).toContainText(`${EDITOR} 확인`, SLOW);
    await expect(legal).toBeEnabled();
  });

  test("publish: 발행, with a logged override only if blocking checks remain", async ({ page, request }) => {
    // Cache the lists first, so the public step proves on-demand invalidation.
    for (const path of ["/", "/latest", `/${run.beat}`]) expect((await request.get(path)).status(), path).toBe(200);

    await page.goto(`/admin/candidates/${run.candidateId}`);
    await (await hydrated(page.getByRole("tab", { name: "발행", exact: true }))).click();
    const panel = page.getByRole("tabpanel", { name: "발행", exact: true });
    await panel.getByRole("button", { name: "지금 발행" }).click();

    const done = panel.getByText("발행됨", { exact: true });
    const blocked = panel.getByText("필수 체크 미통과로 발행이 멈췄습니다");
    const failed = panel.locator("p[role=alert]");
    await expect(done.or(blocked).or(failed).first()).toBeVisible(SLOW);
    expect(await failed.isVisible() ? await failed.innerText() : null, "publish error").toBeNull();
    if (await blocked.isVisible()) {
      const reasons = await panel.getByRole("alert").locator("li").allInnerTexts();
      test.info().annotations.push({ type: "override", description: reasons.join(" / ") });
      await panel.getByLabel(/넘기는 사유/).fill("E2E 검증용 기사 — 실행 직후 삭제");
      await panel.getByRole("button", { name: "사유를 남기고 발행" }).click();
      await expect(done).toBeVisible(SLOW);
    }

    const href = await panel.getByRole("link", { name: /기사 보기/ }).getAttribute("href");
    run.slug = href?.match(/^\/a\/(\d{6}-[a-z2-9]{6})$/)?.[1] ?? null;
    expect(run.slug, `article link ${href}`).not.toBeNull();
    const [article] = await db()<{ id: string; title: string; status: string; beat: string }[]>`
      select id, title, status, beat from articles where slug = ${run.slug!}`;
    run.articleId = article.id;
    expect(article).toMatchObject({ title: run.title, status: "published", beat: run.beat });
  });

  test("public: a reader sees it at once — lists, beat page, article with the AI label", async ({ browser }) => {
    const { context, page } = await reader(browser);
    for (const path of ["/", "/latest", `/${run.beat}`]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: run.title }).first(), path).toHaveAttribute("href", `/a/${run.slug}`);
    }
    const res = await page.goto(`/a/${run.slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("#article-title")).toHaveText(run.title);
    const article = page.locator("article[aria-labelledby='article-title']");
    await expect(article.getByRole("link", { name: `AI 초안 · ${EDITOR} 검수` }).first()).toBeVisible();
    await expect(page.locator('meta[name="nwm:ai-label"]')).toHaveAttribute("content", `AI 초안 · ${EDITOR} 검수`);
    await context.close();
  });

  test("correction: a 정정 note on the article and on /corrections", async ({ page, browser, request }) => {
    for (const path of [`/a/${run.slug}`, "/corrections"]) expect((await request.get(path)).status(), path).toBe(200);

    await page.goto(`/admin/articles/${run.articleId}`);
    const form = page.locator("#revise");
    const dek = await hydrated(form.getByLabel(/시그널/));
    await dek.fill(`${(await dek.inputValue()).trim()} (정정)`);
    await form.getByLabel(/수정 사유/).fill("E2E 검증 — 시그널 정정");
    await form.getByLabel(/정정 종류/).selectOption("correction");
    await form.getByLabel(/공개 정정문/).fill(run.note);
    await form.getByRole("button", { name: /정정 게시/ }).click();
    await expect(form.getByText("정정을 게시했습니다.")).toBeVisible(SLOW);

    const { context, page: pub } = await reader(browser);
    await pub.goto(`/a/${run.slug}`);
    await expect(pub.getByRole("region", { name: "정정 이력" })).toContainText(run.note);
    await pub.goto("/corrections");
    const entry = pub.locator("main li").filter({ hasText: run.note });
    await expect(entry.getByRole("link", { name: run.title })).toHaveAttribute("href", `/a/${run.slug}`);
    await context.close();
  });

  test("unpublish: the article is gone for readers", async ({ page, browser }) => {
    await page.goto(`/admin/articles/${run.articleId}`);
    page.once("dialog", (d) => d.accept("E2E 검증 종료"));
    await (await hydrated(page.getByRole("button", { name: "비공개 전환" }))).click();
    await expect(page.getByRole("button", { name: "다시 공개" })).toBeVisible(SLOW);

    const { context, page: pub } = await reader(browser);
    const res = await pub.goto(`/a/${run.slug}`);
    await expect(pub.getByText("신호를 찾지 못했습니다")).toBeVisible();
    await expect(pub.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    // `next dev` streams the page, so its status is already 200 when notFound() runs; production answers 404.
    const dev = (await pub.locator("nextjs-portal").count()) > 0;
    if (!dev) expect(res?.status()).toBe(404);
    await pub.goto("/latest");
    await expect(pub.locator(`a[href="/a/${run.slug}"]`)).toHaveCount(0);
    await context.close();
  });
});

/**
 * Deletes what this run created and puts the rest back; returns the deleted article slugs.
 * Scoped to this run's rows so a concurrent session's data is left alone.
 */
async function cleanup(q: postgres.Sql): Promise<string[]> {
  const since = run.startedAt;
  if (!since) return [];
  const itemIds = run.items.map((i) => i.id);
  // candidates made from this run's items, also when the run stopped before the editor opened
  const candidates = new Set<string>(run.candidateId ? [run.candidateId] : []);
  if (itemIds.length) {
    const rows = await q<{ id: string }[]>`
      select distinct c.id from candidates c join candidate_items ci on ci.candidate_id = c.id
       where ci.feed_item_id in ${q(itemIds)} and c.created_at >= ${since}`;
    for (const r of rows) candidates.add(r.id);
  }
  const candidateIds = [...candidates];
  const articles = await q<{ id: string; slug: string }[]>`
    select id, slug from articles
     where title = ${run.title}
        or ${run.articleId ? q`id = ${run.articleId}` : q`false`}
        or ${candidateIds.length ? q`candidate_id in ${q(candidateIds)}` : q`false`}`;
  const articleIds = articles.map((a) => a.id);
  const entityIds = [...articleIds, ...candidateIds, ...itemIds];
  const admin = (await q<{ id: string }[]>`select id from staff where login = ${ADMIN_LOGIN}`)[0];

  await q.begin(async (tx) => {
    if (articleIds.length) {
      await tx`delete from correction_requests where article_id in ${tx(articleIds)}`;
      await tx`delete from article_corrections where article_id in ${tx(articleIds)}`;
      await tx`delete from article_revisions where article_id in ${tx(articleIds)}`;
      await tx`delete from article_stats_daily where article_id in ${tx(articleIds)}`;
      await tx`delete from articles where id in ${tx(articleIds)}`;
    }
    if (candidateIds.length) {
      await tx`delete from candidate_items where candidate_id in ${tx(candidateIds)}`;
      await tx`delete from candidates where id in ${tx(candidateIds)}`;
    }
    if (itemIds.length) await tx`update feed_items set status = 'new' where id in ${tx(itemIds)} and status = 'promoted'`;
    await tx`
      delete from activity_log
       where at >= ${since}
         and (${entityIds.length ? tx`entity_id in ${tx(entityIds)}` : tx`false`}
              or ${admin ? tx`(entity_type = 'settings' and entity_id = 'profile' and actor_id = ${admin.id})` : tx`false`})`;
    if (run.profileSaved) {
      // keep the slug; the profile action also rewrote bylines of articles this account authored
      await tx`update staff set name = ${PLACEHOLDER}, title = ${PLACEHOLDER} where login = ${ADMIN_LOGIN}`;
      if (admin) await tx`update articles set byline = ${`글 · ${PLACEHOLDER}`} where author_id = ${admin.id} and byline = ${`글 · ${EDITOR}`}`;
    }
  });
  return articles.map((a) => a.slug);
}
