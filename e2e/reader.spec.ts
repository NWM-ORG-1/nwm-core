import { expect, test } from "@playwright/test";

test.describe("reading flow", () => {
  test("next/prev follow the list the reader came from (J/K)", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow is desktop");
    await page.goto("/latest");
    const links = page.locator("main ol a[data-row-link]");
    await expect(links.nth(4)).toBeVisible();
    const hrefs = await links.evaluateAll((els) => els.slice(0, 6).map((e) => e.getAttribute("href")));
    await links.nth(2).click();
    await expect(page).toHaveURL(new RegExp(`${hrefs[2]}$`));
    await expect(page.getByRole("navigation", { name: "이전·다음 기사" })).toContainText("최신 기사");
    const dock = page.getByRole("navigation", { name: "이전·다음 기사" });
    await expect(dock).toContainText("3/");
    await page.keyboard.press("j");
    await expect(page).toHaveURL(new RegExp(`${hrefs[3]}$`));
    await expect(dock).toContainText("4/");
    await page.keyboard.press("k");
    await expect(page).toHaveURL(new RegExp(`${hrefs[2]}$`));
  });

  test("swipe left on mobile goes to the next article in the queue", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch swipe is mobile");
    await page.goto("/latest");
    const links = page.locator("main ol a[data-row-link]");
    const hrefs = await links.evaluateAll((els) => els.slice(0, 4).map((e) => e.getAttribute("href")));
    await links.nth(1).click();
    await expect(page).toHaveURL(new RegExp(`${hrefs[1]}$`));
    const box = await page.locator("article[aria-labelledby='article-title']").boundingBox();
    if (!box) throw new Error("no article");
    const y = box.y + 260;
    // synthesize a horizontal touch swipe via pointer events
    await page.evaluate(
      async ({ y, w }) => {
        const el = document.elementFromPoint(w * 0.7, y)!;
        const fire = (type: string, x: number) =>
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
        fire("pointerdown", w * 0.8);
        for (let i = 1; i <= 6; i++) {
          fire("pointermove", w * 0.8 - i * 30);
          await new Promise((r) => setTimeout(r, 16));
        }
        fire("pointerup", w * 0.8 - 180);
      },
      { y, w: page.viewportSize()!.width },
    );
    await expect(page).toHaveURL(new RegExp(`${hrefs[2]}$`));
  });

  test("read state and since-last-visit divider", async ({ page, context }) => {
    // simulate a previous session 3 hours ago
    await context.addInitScript(() => {
      if (!sessionStorage.getItem("nwm:session")) {
        localStorage.setItem("nwm:visit", JSON.stringify({ prev: 0, current: Date.now() - 3 * 3600_000 }));
      }
    });
    await page.goto("/latest");
    await expect(page.getByRole("separator", { name: "마지막 방문 이전 기사" })).toBeVisible();
    const first = page.locator("main ol a[data-row-link]").first();
    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator("#article-title")).toBeVisible();
    // reaching the end of the article marks it read on-device
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const slug = href!.slice(3);
    await expect
      .poll(() => page.evaluate((s) => JSON.parse(localStorage.getItem("nwm:read") || "{}")[s]?.done === true, slug), { timeout: 10_000 })
      .toBe(true);
    await page.goBack();
    await expect(page.locator(`li[data-read="true"] a[href="${href}"]`)).toHaveCount(1);
  });
});
