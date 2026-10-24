import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fill, getPath, parseTime } from "@/ingest/adapters/generic/json-list";
import { ConfigError } from "@/ingest/types";
import { NOW, run, source, type Route } from "../helpers";

/* fixtures — a fictional exchange's notice API and a fictional registry */

const robots: Route = { match: /robots\.txt$/, body: "User-agent: *\nDisallow: /private/", headers: { "content-type": "text/plain" } };

const notices = (rows: Array<{ id: number; title: string; at: string; category?: string }>) =>
  JSON.stringify({ success: true, data: { total_pages: 1, notices: rows.map((r) => ({ id: r.id, title: r.title, first_listed_at: r.at, category: r.category ?? "거래" })) } });

const exchange = source({
  adapter: "json.list",
  url: "https://api.exchange.example/api/v1/announcements?page=1",
  config: {
    itemsPath: "data.notices",
    fields: { id: "id", title: "title", url: "https://exchange.example/notice?id={id}", summary: "category", time: "first_listed_at" },
    where: [{ field: "category", equals: "거래" }],
  },
});

describe("json.list helpers", () => {
  it("reads dotted paths into objects and arrays, and fills templates", () => {
    const row = { id: 7, org: { name: "LGAI-EXAONE" }, tags: ["a", "b"], list: [{ x: 1 }] };
    assert.equal(getPath(row, "list.0.x"), 1);
    assert.equal(getPath(row, ""), row);
    assert.equal(fill("{org.name}/{id}", row), "LGAI-EXAONE/7");
    assert.equal(fill("tags", row), "a, b");
    assert.equal(fill("https://hub.example/{model}", { model: "Org/Model 2" }, true), "https://hub.example/Org/Model%202");
  });

  it("reads Unix seconds and milliseconds, ISO dates, and zone-less Korean times as KST", () => {
    assert.equal(parseTime(1792750820000, NOW)?.toISOString(), new Date(1792750820000).toISOString());
    assert.equal(parseTime("1792750820", NOW)?.toISOString(), new Date(1792750820000).toISOString());
    assert.equal(parseTime("2026-10-21T11:35:00+09:00", NOW)?.toISOString(), "2026-10-21T02:35:00.000Z");
    assert.equal(parseTime("2026-10-21 11:55:00", NOW)?.toISOString(), "2026-10-21T02:55:00.000Z");
    assert.equal(parseTime("2026-10-20", NOW)?.toISOString(), "2026-10-19T15:00:00.000Z");
    assert.equal(parseTime(NOW.getTime() + 30 * 86_400_000, NOW), undefined, "far future is not a posting time");
  });
});

describe("json.list", () => {
  it("files recent rows from the list, with links from a template and the notice time", async () => {
    const r = await run(exchange, [
      robots,
      {
        match: /api\.exchange\.example/,
        body: notices([
          { id: 103, title: "가상코인(VRT) KRW 마켓 디지털 자산 추가", at: "2026-10-21T11:35:00+09:00" },
          { id: 102, title: "점검 안내", at: "2026-10-21T09:00:00+09:00", category: "서비스" },
          { id: 90, title: "지난달 상장 안내", at: "2026-09-01T10:00:00+09:00" },
        ]),
      },
    ]);
    assert.deepEqual(
      r.result.items!.map((i) => [i.externalId, i.title, i.url, i.summary, i.publishedAt?.toISOString()]),
      [["103", "가상코인(VRT) KRW 마켓 디지털 자산 추가", "https://exchange.example/notice?id=103", "거래", "2026-10-21T02:35:00.000Z"]],
    );
    assert.equal(r.result.note, "3행 중 1건");
  });

  it("files a row without a time when it first appears, never on the first run", async () => {
    const undated = source({ adapter: "json.list", url: "https://registry.example/models", config: { fields: { id: "id", title: "새 모델: {id}", url: "https://registry.example/{id}" } } });
    const first = await run(undated, [robots, { match: /registry\.example\/models/, body: JSON.stringify([{ id: "lab/model-a" }]) }]);
    assert.deepEqual(first.result.items, []);
    const later = new Date(NOW.getTime() + 600_000);
    const next = await run({ ...undated, state: first.state }, [robots, { match: /registry\.example\/models/, body: JSON.stringify([{ id: "lab/model-b" }, { id: "lab/model-a" }]) }], { now: later });
    assert.deepEqual(
      next.result.items!.map((i) => [i.title, i.url, i.publishedAt?.toISOString()]),
      [["새 모델: lab/model-b", "https://registry.example/lab/model-b", later.toISOString()]],
    );
  });

  it("sends a free key from the environment and keeps it out of notes and errors", async () => {
    const keyed = source({
      adapter: "json.list",
      url: "https://apis.example.go.kr/svc/list?type=json",
      config: { itemsPath: "response.items", fields: { id: "id", title: "title" }, key: { env: "DATA_GO_KR_KEY", query: "serviceKey" } },
    });
    await assert.rejects(run(keyed, [robots]), (e) => e instanceof ConfigError && /키 필요: DATA_GO_KR_KEY/.test(e.message));
    const calls: string[] = [];
    await assert.rejects(
      run(keyed, [robots, { match: /apis\.example\.go\.kr\/svc/, body: "<html>SERVICE KEY IS NOT REGISTERED</html>" }], { env: { DATA_GO_KR_KEY: "s3cret" }, calls }),
      (e) => e instanceof Error && !e.message.includes("s3cret") && /invalid JSON from apis\.example\.go\.kr/.test(e.message),
    );
    assert.ok(calls.some((c) => c.includes("serviceKey=s3cret")));
  });

  it("says where it looked when the list is not there", async () => {
    await assert.rejects(run({ ...exchange, config: { ...exchange.config, itemsPath: "data.items" } }, [robots, { match: /api\.exchange\.example/, body: notices([]) }]), /목록이 없습니다 \(itemsPath: "data\.items"\)/);
  });

  it("checks robots.txt for the API path unless an agreement is recorded", async () => {
    await assert.rejects(run(exchange, [{ ...robots, body: "User-agent: *\nDisallow: /api/" }]), /robots\.txt가 이 경로를 막고 있습니다/);
  });
});
