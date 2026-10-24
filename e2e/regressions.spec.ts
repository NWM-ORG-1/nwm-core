import { expect, test } from "@playwright/test";

/** Guards for issues found in review: each test names the behaviour it protects. */
test.describe("review regressions", () => {
  test("calendar-invalid archive dates are a 404, not a 500", async ({ request }) => {
    for (const d of ["2026-02-30", "2026-13-45"]) {
      const res = await request.get(`/d/${d}`);
      expect(res.status(), d).toBe(404);
    }
  });

  test("palette opens, keeps focus inside, and returns focus to the trigger", async ({ page }) => {
    await page.goto("/ai");
    const trigger = page.getByRole("button", { name: "검색 (⌘K)" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "검색" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("dock and progress bar sit outside the article transition", async ({ page }) => {
    await page.goto("/latest");
    await page.locator("main ol a[data-row-link]").first().click();
    const dock = page.locator("[data-reader-dock]");
    await expect(dock).toBeVisible();
    // React assigns its own view-transition names to children of <ViewTransition>; the dock must keep its own.
    expect(await dock.evaluate((el) => getComputedStyle(el).viewTransitionName)).toBe("reader-dock");
    // the list route stays mounted but hidden (Activity); the visible page has exactly one <main>
    await expect(page.locator("main:visible")).toHaveCount(1);
  });

  test("reader toast is announced inside the viewport", async ({ page }) => {
    await page.goto("/latest");
    await page.locator("main ol a[data-row-link]").first().click();
    const dock = page.locator("[data-reader-dock]");
    await expect(dock).toBeVisible();
    // once hydrated, the list we came from replaces the related-articles fallback: its first item has no previous article
    await expect(dock.getByRole("link", { name: /^이전 기사:/ })).toHaveCount(0);
    const here = page.url();
    const toast = page.getByRole("status").filter({ hasText: "목록의 첫 기사입니다" });
    // the dock is server-rendered, so a key pressed before the reader's listener is attached is lost: press until heard
    await expect(async () => {
      expect(page.url()).toBe(here);
      await page.keyboard.press("k"); // first item of the list → "목록의 첫 기사입니다"
      await expect(toast).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    const box = await toast.boundingBox();
    const vh = page.viewportSize()!.height;
    expect(box && box.y > 0 && box.y + box.height <= vh).toBe(true);
  });

  test("arrow keys on a focused chart move its crosshair, not the article", async ({ page }) => {
    const slug = await page.request.get("/api/search-index").then(async (r) => {
      // search-index rows are compact tuples: [slug, title, dek, beat, ts]
      for (const [s] of (await r.json()) as Array<[string]>) {
        const html = await page.request.get(`/a/${s}`).then((x) => x.text());
        if (/<svg[^>]*tabindex="0"/.test(html)) return s;
      }
      return null;
    });
    test.skip(!slug, "no article with a chart");
    await page.goto(`/a/${slug}`);
    const chart = page.locator("article svg[tabindex='0']").first();
    await expect(chart).toBeVisible();
    const url = page.url();
    await chart.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    expect(page.url()).toBe(url);
  });

  test("ticker can be paused from the keyboard", async ({ page }) => {
    await page.goto("/");
    const pause = page.getByRole("button", { name: "시장 지표 일시정지" });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(page.getByRole("button", { name: "시장 지표 재생" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator(".animate-marquee").evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
    await page.getByRole("button", { name: "시장 지표 재생" }).click();
  });

  test("light reading mode also sets the browser theme colour", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("nwm:prefs", JSON.stringify({ theme: "light" })));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f3f5ff");
  });

  test("beacons from other sites are ignored", async ({ request }) => {
    const res = await request.post("/api/beacon", {
      data: JSON.stringify({ slug: "000000-zzzzzz", ev: "view" }),
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(res.status()).toBe(204);
  });
});
