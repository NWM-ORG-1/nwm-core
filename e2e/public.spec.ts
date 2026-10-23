import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("home: hero, five things, live river, footer legal fields", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("TOP SIGNAL")).toBeVisible();
    await expect(page.getByRole("heading", { name: /지금 알아야 할 \d+가지/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "라이브" })).toBeVisible();
    const footer = page.locator("footer");
    for (const label of ["제호", "상호", "등록번호", "발행인", "편집인", "사업자등록번호", "청소년보호책임자", "개인정보보호책임자"]) {
      await expect(footer.getByText(label, { exact: true })).toBeVisible();
    }
    // ticker values arrive from /api/pulse
    await expect(page.getByRole("region", { name: "시장 지표" }).getByText("비트코인").first()).toBeVisible();
  });

  test("article: smart-brevity blocks, AI label with named editor, provenance", async ({ page }) => {
    await page.goto("/");
    await page.locator("article a[href^='/a/']").first().click();
    await expect(page).toHaveURL(/\/a\/\d{6}-[a-z2-9]{6}$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("시그널", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "왜 중요한가" })).toBeVisible();
    // every article carries an AI involvement label; AI drafts name the editor
    await expect(page.locator("a[href='/policy/ai']").first()).toContainText(/AI 초안|자동 생성|AI 보조|기자 작성/);
    await expect(page.locator('meta[name="nwm:ai-involvement"]')).toHaveCount(1);
    await expect(page.getByText("이 기사는 이렇게 만들어졌습니다")).toBeVisible();
  });

  test("sentiment dashboard renders the index and asset table", async ({ page }) => {
    await page.goto("/sentiment");
    await expect(page.getByRole("heading", { name: "NWM 센티먼트 인덱스" })).toBeVisible();
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
    await expect(page.getByText("신호를 찾지 못했습니다")).toBeVisible();
    expect([200, 404]).toContain(res?.status());
  });
});
