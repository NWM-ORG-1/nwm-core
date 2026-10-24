import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG } from "@/ingest/catalog";
import { FIRSTHAND } from "@/ingest/catalog/firsthand";
import { WATCH } from "@/ingest/catalog/watch";
import { validateConfig } from "@/ingest/execute";
import { getAdapter } from "@/ingest/registry";

describe("source catalog", () => {
  it("has unique slugs the source list accepts", () => {
    const slugs = CATALOG.map((e) => e.slug);
    assert.deepEqual(
      slugs.filter((s, i) => slugs.indexOf(s) !== i),
      [],
      "duplicate slugs",
    );
    for (const s of slugs) assert.match(s, /^[a-z0-9][a-z0-9-]{1,60}$/, s);
  });

  it("gives every source a known adapter and a config its schema accepts (the worker refuses to start otherwise)", () => {
    for (const e of CATALOG) {
      assert.ok(getAdapter(e.adapter), `${e.slug}: unknown adapter ${e.adapter}`);
      const v = validateConfig(e.adapter, e.config);
      assert.ok(v.ok, `${e.slug}: ${v.ok ? "" : v.message}`);
    }
  });

  it("feeds read only recent posts and say why a paused one waits", () => {
    for (const e of FIRSTHAND) {
      if (e.adapter === "rss") assert.match(e.url ?? "", /^https:\/\//, e.slug);
      if (e.status === "paused") assert.ok(e.note, `${e.slug}: a paused source needs a note`);
      const days = (e.config as { maxAgeDays?: number }).maxAgeDays;
      if (e.adapter === "rss") assert.ok(days !== undefined && days <= 40, `${e.slug}: maxAgeDays`);
    }
    assert.ok(!CATALOG.some((e) => e.slug !== "fed-press" && /federalreserve\.gov\/feeds\/press_(all|monetary|enforcement)/.test(e.url ?? "") && e.slug !== "fed-press"), "the Fed's all-press feed already covers its parts");
  });

  it("watches pages politely: https, robots.txt kept, hours apart for documents, recent rows only for lists", () => {
    for (const e of WATCH) {
      const c = e.config as { mode?: string; respectRobots?: boolean; maxAgeDays?: number };
      if (e.url) assert.match(e.url, /^https:\/\//, e.slug);
      assert.notEqual(c.respectRobots, false, `${e.slug}: robots.txt`);
      if (e.adapter === "page.watch" && c.mode !== "links") assert.ok((e.pollIntervalSec ?? 0) >= 3 * 3600, `${e.slug}: a document a few times a day`);
      if (e.adapter === "json.list" || c.mode === "links") assert.ok(c.maxAgeDays !== undefined && c.maxAgeDays <= 7, `${e.slug}: maxAgeDays`);
    }
  });
});
