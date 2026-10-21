import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clip, decodeEntities, htmlToText, parseCount, parseDate, parseKstDate } from "@/ingest/text";

const NOW = new Date("2026-10-21T18:00:00Z"); // 22일 03:00 KST

describe("parseKstDate", () => {
  it("reads Korean board formats as KST", () => {
    assert.equal(parseKstDate("2026-10-22 02:49:54")!.toISOString(), "2026-10-21T17:49:54.000Z");
    assert.equal(parseKstDate("26.10.22 03:08:02")!.toISOString(), "2026-10-21T18:08:02.000Z");
    assert.equal(parseKstDate("2026.10.21")!.toISOString(), "2026-10-20T15:00:00.000Z");
    assert.equal(parseKstDate("20261021")!.toISOString(), "2026-10-20T15:00:00.000Z");
  });
  it("puts a bare clock time on today (or yesterday when it would be in the future)", () => {
    assert.equal(parseKstDate("02:49", NOW)!.toISOString(), "2026-10-21T17:49:00.000Z");
    assert.equal(parseKstDate("23:10", NOW)!.toISOString(), "2026-10-21T14:10:00.000Z");
  });
  it("rejects garbage", () => {
    assert.equal(parseKstDate("어제"), undefined);
  });
});

describe("parseDate", () => {
  it("treats a bare ISO date as KST midnight and ignores far-future dates", () => {
    assert.equal(parseDate("2026-10-21", NOW)!.toISOString(), "2026-10-20T15:00:00.000Z");
    assert.equal(parseDate("Tue, 20 Oct 2026 21:00:00 GMT", NOW)!.toISOString(), "2026-10-20T21:00:00.000Z");
    assert.equal(parseDate("2027-01-01T00:00:00Z", NOW), undefined);
  });
});

describe("parseCount", () => {
  it("reads the counts boards and Telegram show", () => {
    assert.equal(parseCount("1,234"), 1234);
    assert.equal(parseCount("12.3K"), 12300);
    assert.equal(parseCount("5.83M"), 5830000);
    assert.equal(parseCount("1.2만"), 12000);
    assert.equal(parseCount("-"), undefined);
  });
});

describe("text helpers", () => {
  it("decodes entities and strips HTML", () => {
    assert.equal(decodeEntities("AT&amp;T &#036;8.5만 &quot;x&quot; &#x1F600;"), 'AT&T $8.5만 "x" 😀');
    assert.equal(htmlToText("<p>첫 줄<br/>둘째 &amp; 셋째</p><script>x()</script>"), "첫 줄\n둘째 & 셋째");
  });
  it("clips at a word boundary", () => {
    assert.equal(clip("alpha beta gamma delta", 15), "alpha beta…");
    assert.equal(clip("short", 12), "short");
  });
});

describe("isPrivateHost", () => {
  it("blocks our own network, allows public hosts", async () => {
    const { isPrivateHost } = await import("@/ingest/http");
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.1", "172.20.0.1", "nwm-web.railway.internal", "[::1]", "fd12:3456::1"]) assert.equal(isPrivateHost(h), true, h);
    for (const h of ["www.sec.gov", "api.upbit.com", "8.8.8.8", "172.32.0.1"]) assert.equal(isPrivateHost(h), false, h);
  });
});
