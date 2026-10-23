import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("home: hero, five things, live river, footer legal fields", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("TOP STORY")).toBeVisible();
    await expect(page.getByRole("heading", { name: "주요 뉴스", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "실시간", exact: true })).toBeVisible();
    const footer = page.locator("footer");
    for (const label of ["제호", "상호", "등록번호", "발행인", "편집인", "사업자등록번호", "청소년보호책임자", "개인정보보호책임자"]) {
      await expect(footer.getByText(label, { exact: true })).toBeVisible();
    }
    // ticker values arrive from /api/pulse
    await expect(page.getByRole("region", { name: "시장 지표" }).getByText("원/달러").first()).toBeVisible();
  });

  test("article: smart-brevity blocks, credit line, article info", async ({ page }) => {
    await page.goto("/");
    await page.locator("article a[href^='/a/']").first().click();
    await expect(page).toHaveURL(/\/a\/\d{6}-[a-z2-9]{6}$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("요약", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "왜 중요한가" })).toBeVisible();
    // AI involvement stays in the newsroom (AI_DISCLOSURE off): no badge, no AI meta, no /policy/ai
    await expect(page.locator("a[href='/policy/ai']")).toHaveCount(0);
    await expect(page.locator('meta[name="nwm:ai-involvement"]')).toHaveCount(0);
    await expect(page.locator("summary", { hasText: "기사 정보" })).toBeVisible();
    expect((await page.request.get("/policy/ai")).status()).toBe(404);
  });

  test("sentiment dashboard renders the index and asset table", async ({ page }) => {
    await page.goto("/sentiment");
    await expect(page.getByRole("heading", { name: "NWM 투자심리지수" })).toBeVisible();
    await expect(page.getByRole("img", { name: /심리 점수/ }).first()).toBeVisible();
    await expect(page.locator("table").first()).toContainText("비트코인");
  });

  test("story page shows a timeline", async ({ page }) => {
    await page.goto("/s/hanbit-hbm-next");
    await expect(page.getByText("STORY")).toBeVisible();
    expect(await page.locator("main ol > li").count()).toBeGreaterThan(1);
  });

  test("search supports 초성 queries", async ({ page }) => {
    await page.goto("/search?q=" + encodeURIComponent("ㅎㅂㅂㄷ"));
    await expect(page.locator("main a[href^='/a/']").first()).toContainText("한빛");
  });

  test("unknown article is a 404 page", async ({ page }) => {
    const res = await page.goto("/a/000000-zzzzzz");
    await expect(page.getByText("페이지를 찾을 수 없습니다")).toBeVisible();
    expect([200, 404]).toContain(res?.status());
  });
});
