import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foundedYear, LEGAL_FIELDS, legalEnvName, legalFromEnv } from "@/lib/site";

describe("legal imprint from the environment", () => {
  it("reads LEGAL_* first and the earlier SITE_* names as a fallback", () => {
    const env = { LEGAL_PUBLISHER: "발행인A", SITE_PUBLISHER: "발행인B", SITE_COMPANY: "뉴웹미디어", SITE_PUB_DATE: "2026-10-19", SITE_REG_NO: "  " };
    assert.deepEqual(legalFromEnv(env), { publisher: "발행인A", company: "뉴웹미디어", foundedAt: "2026-10-19" });
    const field = (k: string) => LEGAL_FIELDS.find((f) => f.key === k)!;
    assert.equal(legalEnvName(field("publisher"), env), "LEGAL_PUBLISHER");
    assert.equal(legalEnvName(field("company"), env), "SITE_COMPANY");
    assert.equal(legalEnvName(field("regNo"), env), null, "blank values do not count");
  });

  it("prints the year of a full founding date", () => {
    assert.equal(foundedYear("2026-10-19"), "2026");
    assert.equal(foundedYear("2026"), "2026");
    assert.equal(foundedYear("등록 예정"), "등록 예정");
  });
});
