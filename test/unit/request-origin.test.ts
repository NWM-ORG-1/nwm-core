import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestOriginAllowed } from "@/server/request-origin";

const req = (h: Record<string, string>) => requestOriginAllowed(new Headers(h));
const nav = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };

describe("newsroom request origin", () => {
  it("lets our own pages, typed URLs and non-browser clients through", () => {
    assert.equal(req({}), true);
    assert.equal(req({ "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", origin: "https://newweb.media", "next-action": "abc" }), true);
    assert.equal(req({ "sec-fetch-site": "none", ...nav }), true);
  });

  it("opens a page from a link on another site", () => {
    assert.equal(req({ "sec-fetch-site": "cross-site", ...nav }), true);
    assert.equal(req({ "sec-fetch-site": "same-site", ...nav }), true);
  });

  it("refuses anything from another site that could change data", () => {
    // auto-submitted form posting a Server Action (no JS: a navigation, but with Origin)
    assert.equal(req({ "sec-fetch-site": "cross-site", ...nav, origin: "https://evil.example" }), false);
    // Server Action called with fetch
    assert.equal(req({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty", origin: "https://evil.example", "next-action": "abc" }), false);
    assert.equal(req({ "sec-fetch-site": "cross-site", ...nav, "next-action": "abc" }), false);
    assert.equal(req({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }), false);
    // framed by another site
    assert.equal(req({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }), false);
  });
});
