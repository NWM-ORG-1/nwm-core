import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseChannelInfo, parseChannelPage } from "@/ingest/adapters/social/telegram";
import { parseHandles, socialSlug } from "@/ingest/social-handles";
import { CHANNEL_PAGE, CONTACT_PAGE } from "../fixtures/telegram-pages";

/* fixtures — fictional channels and accounts, apart from the recorded page */

describe("pasted channels and accounts", () => {
  it("reads Telegram links, @names and bare names; turns away invites, private posts and other sites", () => {
    const r = parseHandles(
      "telegram",
      `https://t.me/itest_flash_one
t.me/s/Itest_Flash_Two?before=5, @itest_flash_three
https://t.me/itest_flash_four/123  tg://resolve?domain=itest_flash_five
https://t.me/+AbCdEfGh https://t.me/joinchat/AAAA https://t.me/c/1234/56 https://x.com/someone bad-name @abc ITEST_FLASH_ONE`,
    );
    assert.deepEqual(r.names, ["itest_flash_one", "Itest_Flash_Two", "itest_flash_three", "itest_flash_four", "itest_flash_five"]);
    assert.deepEqual(
      r.rejected.map((x) => x.input),
      ["https://t.me/+AbCdEfGh", "https://t.me/joinchat/AAAA", "https://t.me/c/1234/56", "https://x.com/someone", "bad-name", "@abc"],
    );
    assert.match(r.rejected[0].reason, /초대 링크/);
    assert.match(r.rejected[2].reason, /비공개 채널/);
    assert.match(r.rejected[3].reason, /텔레그램 주소가 아닙니다/);
  });

  it("reads X profile and post links, keeps the spelling, drops reserved paths", () => {
    const r = parseHandles("x", "https://x.com/OpenAI https://twitter.com/SECGov/status/123 @Upbit_Official, mobile.twitter.com/itest_x_one? x.com/home https://x.com/i/lists/1 toolongname_1234567 openai https://t.me/abc");
    assert.deepEqual(r.names, ["OpenAI", "SECGov", "Upbit_Official", "itest_x_one"]);
    assert.deepEqual(
      r.rejected.map((x) => x.input),
      ["x.com/home", "https://x.com/i/lists/1", "toolongname_1234567", "https://t.me/abc"],
    );
  });

  it("stops at the batch size and names slugs the source list accepts", () => {
    const r = parseHandles("x", "a1 a2 a3 a4", 3);
    assert.deepEqual(r.names, ["a1", "a2", "a3"]);
    assert.match(r.rejected[0].reason, /3개까지/);
    assert.equal(socialSlug("telegram", "Itest_Flash_Two"), "tg-itest-flash-two");
    assert.equal(socialSlug("x", "Upbit_Official"), "x-upbit-official");
    assert.match(socialSlug("telegram", "a".repeat(32)), /^[a-z0-9][a-z0-9-]{1,60}$/);
  });
});

describe("Telegram channel card", () => {
  it("reads title, @name, subscribers and description from the t.me/s header", () => {
    assert.deepEqual(parseChannelInfo(CHANNEL_PAGE), {
      title: "가상코인속보 & 시황",
      username: "Itest_Flash_One",
      subscribers: 30_600,
      description: "가상 채널입니다. 시황을 빠르게 전합니다.",
    });
    assert.equal(parseChannelPage(CHANNEL_PAGE, "Itest_Flash_One").messages.length, 2);
  });

  it("falls back to the page title when the card is missing, and finds no messages on a contact page", () => {
    const recorded = readFileSync(new URL("../fixtures/telegram-channel.html", import.meta.url), "utf8");
    assert.equal(parseChannelInfo(recorded).title, "COINNESS News Feed (코인니스)");
    assert.equal(parseChannelPage(CONTACT_PAGE, "itest_nobody_here").messages.length, 0);
  });
});
