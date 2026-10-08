import { afterAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { inject } from "./helpers.js";
import { listAllProviders, listProviders } from "../src/providers/index.js";
import {
  fetchFeed,
  fetchTranscript,
  parseDoctorOutput,
  parseFeed,
  probeReach,
  reachChannelKey,
  readWithReach,
  stripVtt,
} from "../src/providers/reach.js";

const DOCTOR_SAMPLE = `Agent Reach 状态
========================================
图例：✅ 可用  [!] 已装但需配置/登录  [X] 未安装

✅ 装好即用：
  [!]  GitHub 仓库和代码 — gh CLI 可执行，但未检测到显式认证配置。运行 \`gh auth
login\` 完成登录；Doctor 不会自动执行 \`gh auth status\`。
  [X]  YouTube 视频和字幕 — yt-dlp 未安装。安装：python -m pip install -U 
"yt-dlp[default]"
  ✅ V2EX 节点、主题与回复 — 公开 API 
可用（热门主题、节点浏览、主题详情、用户信息）
  ✅ RSS/Atom 订阅源 — 可读取 RSS/Atom 源
  [X]  全网语义搜索 — 需要 mcporter + Exa MCP。安装：
  npm install -g mcporter
  mcporter config add exa https://mcp.exa.ai/mcp --scope home
  ✅ 任意网页 — 通过 Jina Reader 读取任意网页（curl https://r.jina.ai/URL）

可选渠道（已安装）：
  ✅ B站视频、字幕和搜索 — B站搜索 API 可达（仅搜索，curl 
直连）。完整功能建议安装 bili-cli：pipx install bilibili-cli 
（当前后端：B站搜索 API）

状态：4/16 个渠道可用`;

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Diggy &amp; Friends</title>
    <item>
      <title>First &amp; foremost</title>
      <link>https://example.com/posts/1?ref=rss&amp;utm=x</link>
      <pubDate>Mon, 02 Jan 2023 15:04:05 GMT</pubDate>
      <description><![CDATA[<p>Hello <strong>world</strong> &amp; everyone</p>]]></description>
    </item>
    <item>
      <title><![CDATA[Second &#8212; dash]]></title>
      <link>https://example.com/posts/2</link>
      <description>Plain &lt;text&gt; here</description>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <entry>
    <title>Entry One</title>
    <link rel="alternate" type="text/html" href="https://example.org/one"/>
    <link rel="self" type="application/atom+xml" href="https://example.org/feed/one"/>
    <updated>2024-05-06T07:08:09Z</updated>
    <summary>Short &amp; sweet</summary>
  </entry>
</feed>`;

const VTT_SAMPLE = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000 align:start position:0%
<c>Hello</c> everyone

00:00:02.000 --> 00:00:04.000
Hello everyone
welcome to <00:00:03.000><c>Diggy</c>

00:00:04.000 --> 00:00:06.000
welcome to Diggy
3

 00:00:06.000 --> 00:00:08.000
This is a new line.`;

const AUTO_VTT_SAMPLE = `WEBVTT
Kind: captions
Language: en

STYLE
::cue {
  background-image: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0));
  color: #fff;
}
::cue(c.color000000) { color: rgb(0,0,0);
}

00:00:00.000 --> 00:00:02.000 align:start position:0%
<c.color00BCE7>The quick brown fox</c>

00:00:02.000 --> 00:00:04.000 align:start position:0%
The quick brown fox

00:00:04.000 --> 00:00:06.000 align:start position:0%
The quick brown fox jumps over the lazy dog

00:00:06.000 --> 00:00:08.000 align:start position:0%
<c.color1367F9>jumps over the lazy dog</c>
And then it ran away &amp; hid.

00:00:08.000 --> 00:00:10.000 align:start position:0%
<v Narrator><00:00:09.000>{\\an8}Stay tuned for more.</v>`;

const PLAIN_VTT_SAMPLE = `WEBVTT

00:00:00.000 --> 00:00:02.000
Good morning everyone.

00:00:02.000 --> 00:00:04.000
Today we build something small.`;

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
}

describe("parseDoctorOutput", () => {
  it("extracts the channel map from a realistic doctor report", () => {
    expect(parseDoctorOutput(DOCTOR_SAMPLE)).toEqual({
      github: false,
      youtube: false,
      v2ex: true,
      rss: true,
      search: false,
      web: true,
      bilibili: true,
    });
  });

  it("strips ANSI colour codes", () => {
    expect(parseDoctorOutput("\u001b[32m✅ Any Web — ok\u001b[0m")).toEqual({ web: true });
  });

  it("returns an empty map for empty or garbage input and never throws", () => {
    expect(parseDoctorOutput("")).toEqual({});
    expect(parseDoctorOutput("nonsense\nrandom text\n  --> arrows")).toEqual({});
    expect(parseDoctorOutput(undefined as unknown as string)).toEqual({});
    expect(parseDoctorOutput(null as unknown as string)).toEqual({});
  });
});

describe("reachChannelKey", () => {
  it("maps both Chinese and English labels to stable keys", () => {
    expect(reachChannelKey("YouTube 视频和字幕")).toBe("youtube");
    expect(reachChannelKey("B站视频、字幕和搜索")).toBe("bilibili");
    expect(reachChannelKey("RSS/Atom 订阅源")).toBe("rss");
    expect(reachChannelKey("某个未知渠道")).toBe("某个未知渠道");
    expect(reachChannelKey("")).toBe("");
  });
});

describe("parseFeed", () => {
  it("parses RSS items with entity decoding and CDATA", () => {
    expect(parseFeed(RSS_SAMPLE)).toEqual([
      {
        title: "First & foremost",
        link: "https://example.com/posts/1?ref=rss&utm=x",
        published: "Mon, 02 Jan 2023 15:04:05 GMT",
        summary: "Hello world & everyone",
      },
      { title: "Second — dash", link: "https://example.com/posts/2", summary: "Plain <text> here" },
    ]);
  });

  it("parses Atom entries with href links", () => {
    expect(parseFeed(ATOM_SAMPLE)).toEqual([
      {
        title: "Entry One",
        link: "https://example.org/one",
        published: "2024-05-06T07:08:09Z",
        summary: "Short & sweet",
      },
    ]);
  });

  it("returns [] for malformed or empty input and never throws", () => {
    expect(parseFeed("")).toEqual([]);
    expect(parseFeed("<<<not xml at all>>>")).toEqual([]);
    expect(parseFeed(undefined as unknown as string)).toEqual([]);
  });
});

describe("stripVtt", () => {
  it("reduces a WebVTT document to plain prose", () => {
    const text = stripVtt(VTT_SAMPLE);
    expect(text).toBe("Hello everyone\nwelcome to Diggy\nThis is a new line.");
    expect(text).not.toContain("-->");
  });

  it("handles srv-style <text> cues and returns empty for garbage", () => {
    expect(stripVtt('<transcript><text start="0.5">Hi &amp; welcome</text></transcript>')).toBe(
      "Hi & welcome",
    );
    expect(stripVtt("")).toBe("");
    expect(stripVtt(undefined as unknown as string)).toBe("");
  });
});

describe("stripVtt (YouTube auto-captions)", () => {
  const text = stripVtt(AUTO_VTT_SAMPLE);

  it("removes the WEBVTT header, metadata, STYLE block and ::cue CSS", () => {
    for (const forbidden of ["WEBVTT", "STYLE", "::cue", "-->", "rgb(", "<c.", "{\\an"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("keeps each spoken sentence exactly once (rolling repeats collapsed)", () => {
    expect(countOccurrences(text, "The quick brown fox")).toBe(1);
    expect(countOccurrences(text, "jumps over the lazy dog")).toBe(1);
    expect(countOccurrences(text, "Stay tuned for more.")).toBe(1);
    expect(text).toContain("And then it ran away & hid.");
  });

  it("round-trips a plain vtt with no styling", () => {
    expect(stripVtt(PLAIN_VTT_SAMPLE)).toBe(
      "Good morning everyone.\nToday we build something small.",
    );
  });
});

describe("reach helpers respect the offline guard", () => {
  it("never touches the network or throws while offline", async () => {
    await expect(probeReach()).resolves.toMatchObject({ available: false });
    await expect(fetchTranscript("https://youtu.be/dQw4w9WgXcQ")).resolves.toBeUndefined();
    await expect(fetchFeed("https://example.com/feed.xml")).resolves.toBeUndefined();
    await expect(readWithReach("https://example.com")).resolves.toBeUndefined();
  });
});

describe("reach provider registration", () => {
  it("is registered without changing the historical provider summary", () => {
    expect(listProviders().map((provider) => provider.name)).toEqual([
      "firecrawl",
      "crawl4ai",
      "browser-use",
      "python-sidecar",
      "builtin",
    ]);
    expect(listAllProviders().map((provider) => provider.name)).toContain("reach");
  });
});

describe("reach HTTP surface (offline)", () => {
  const app = buildServer();

  afterAll(async () => {
    await app.close();
  });

  it("GET /providers keeps the provider list and adds a reach summary", async () => {
    const response = await inject(app, { method: "GET", url: "/providers" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      providers: { name: string; available: boolean }[];
      reach: { name: string; available: boolean };
    };
    expect(body.providers).toEqual(listProviders());
    expect(body.reach.name).toBe("reach");
    expect(body.reach.available).toBe(false);
  });

  it("GET /reach returns the probe result", async () => {
    const response = await inject(app, { method: "GET", url: "/reach" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ available: false });
  });

  it("GET /transcript validates the url and honours the offline guard", async () => {
    expect((await inject(app, { method: "GET", url: "/transcript" })).statusCode).toBe(400);
    expect((await inject(app, { method: "GET", url: "/transcript?url=not-a-url" })).statusCode).toBe(400);

    const response = await inject(app, {
      method: "GET",
      url: "/transcript?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ&lang=en",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ text: "", source: "yt-dlp", offline: true });
  });

  it("GET /feed validates params and honours the offline guard", async () => {
    expect((await inject(app, { method: "GET", url: "/feed" })).statusCode).toBe(400);
    expect(
      (await inject(app, { method: "GET", url: "/feed?url=https://example.com/feed.xml&max=abc" }))
        .statusCode,
    ).toBe(400);

    const response = await inject(app, {
      method: "GET",
      url: "/feed?url=https%3A%2F%2Fexample.com%2Ffeed.xml&max=5",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ items: [], offline: true });
  });
});
