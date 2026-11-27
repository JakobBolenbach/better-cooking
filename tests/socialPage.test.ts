import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseInstagramEmbed,
  parseInstagramPage,
  parsePinterest,
  parseSocialPage,
  parseTiktok,
  parseYoutube,
} from "../src/socialPage";
import { externalLinks, jsonAfter, metaContent, tidyText } from "../src/socialText";
import { INSTAGRAM_PREFIX } from "../src/caption";
import { isRedirectLink } from "../src/shortLinks";
import { recipeFromText } from "../src/textRecipe";

const fx = (n: string) => readFileSync(new URL(`./fixtures/social/${n}`, import.meta.url), "utf8");

describe("Instagram post page", () => {
  const page = parseInstagramPage(fx("instagram-post.html"))!;
  it("cuts the prefix and the quotes, decodes entities, keeps line breaks", () => {
    expect(page.text.startsWith("Linsensuppe fuer zwei\n\nZutaten:\n200 g rote Linsen")).toBe(true);
    expect(page.text).toContain("1. Zwiebel anschwitzen & Linsen zugeben.");
    expect(page.text.endsWith("#suppe")).toBe(true);
    expect(page.text).not.toContain("likes");
    expect(page.author).toBe("testkueche");
  });
  it("gives the image with decoded entities and the first link without trailing punctuation", () => {
    expect(page.image).toBe("https://scontent.cdninstagram.com/v/t51.0-15/example.jpg?stp=cmp1&oe=0&_nc_sid=1");
    expect(page.links).toEqual(["https://www.example.org/linsensuppe"]);
  });
  it("reads the German prefix with an en dash and typographic quotes", () => {
    const de = parseInstagramPage(fx("instagram-post-de.html"))!;
    expect(de.text).toBe("Brot ohne Kneten: 500 g Mehl, 400 ml Wasser, 1 TL Salz.");
    expect(de.author).toBe("testkueche");
    expect(de.links).toBeUndefined();
  });
  it("keeps a caption without prefix and a dash inside the caption", () => {
    const html =
      '<meta property="og:url" content="https://www.instagram.com/p/AbC1/" /><meta property="og:description" content="Mehl - Wasser am Morgen: 500 g" />';
    expect(parseInstagramPage(html, "AbC1")?.text).toBe("Mehl - Wasser am Morgen: 500 g");
  });
  it("treats a quote followed by a period as the end of the caption", () => {
    const p = parseInstagramPage(fx("instagram-post-period.html"), "AbCd_1")!;
    expect(p.text).toBe("Tomatensauce: 400 g Tomaten, 1 Knoblauchzehe, Salz.");
  });
  it("does not take the generic tags of a login wall or of another post for a caption", () => {
    expect(parseInstagramPage(fx("instagram-login-wall.html"), "AbCd_1")).toBeNull();
    expect(parseInstagramPage(fx("instagram-login-wall.html"))).toBeNull();
    const noPrefix = fx("instagram-post-period.html").replace("7 likes, 0 comments - testkueche on May 2, 2026: ", "");
    expect(parseInstagramPage(noPrefix, "OtherCode")).toBeNull();
    expect(parseSocialPage("instagram", fx("instagram-login-wall.html"), "AbCd_1")).toBeNull();
  });
  it("gives null for a page without caption or for broken HTML", () => {
    expect(parseInstagramPage("<html><body>login</body></html>")).toBeNull();
    expect(parseInstagramPage('<meta property="og:description" content="')).toBeNull();
    expect(
      parseInstagramPage('<meta property="og:description" content="12 likes - u on May 1, 2026: &quot;&quot;" />'),
    ).toBeNull();
  });
});

describe("Instagram embed page", () => {
  const page = parseInstagramEmbed(fx("instagram-embed.html"))!;
  it("keeps the caption with its line breaks and leaves out user and comments", () => {
    expect(page.text).toBe(
      "Pfannkuchen\n\nZutaten:\n250 g Mehl\n500 ml Milch & 3 Eier\nMehr unter https://beispiel.example/pfannkuchen",
    );
    expect(page.author).toBe("testkueche");
    expect(page.image).toBe("https://scontent.cdninstagram.com/v/embed.jpg?a=1&b=2");
    expect(page.links).toEqual(["https://beispiel.example/pfannkuchen"]);
  });
  it("is used by parseSocialPage when the post page has no caption", () => {
    expect(parseSocialPage("instagram", fx("instagram-embed.html"))?.author).toBe("testkueche");
    expect(parseInstagramEmbed("<div>nothing</div>")).toBeNull();
  });
  it("feeds the offline rules with usable lines", () => {
    expect(recipeFromText(page.text)?.ingredients).toContain("250 g Mehl");
  });
});

describe("TikTok", () => {
  it("reads caption, cover and author from the rehydration JSON", () => {
    const p = parseTiktok(fx("tiktok.html"))!;
    expect(p.text).toContain("Kuerbissuppe  500 g Kuerbis");
    expect(p.image).toBe("https://p16.tiktokcdn.com/obj/cover.jpeg?x=1&y=2");
    expect(p.author).toBe("Test Kueche");
  });
  it("accepts the page only for the video that was asked for", () => {
    expect(parseTiktok(fx("tiktok.html"), "1")?.author).toBe("Test Kueche");
    expect(parseTiktok(fx("tiktok.html"), "2")).toBeNull();
  });
  it("reads the old SIGI_STATE format", () => {
    const html = `<script id="SIGI_STATE">{"ItemModule":{"1":{"desc":"Alt","author":"user1"}}}</script>`;
    expect(parseTiktok(html)).toEqual({ text: "Alt", author: "user1" });
  });
  it("gives null for broken or missing JSON", () => {
    expect(parseTiktok('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"a":</script>')).toBeNull();
    expect(parseTiktok("<html></html>")).toBeNull();
  });
});

describe("YouTube", () => {
  const p = parseYoutube(fx("youtube.html"))!;
  it("reads title, description, author and the large image", () => {
    expect(p.title).toBe("Schnelle Tomatensauce");
    expect(p.text.startsWith("Zutaten:\n400 g Tomaten")).toBe(true);
    expect(p.author).toBe("Test Kueche");
    expect(p.image).toBe("https://i.ytimg.com/vi/AAAAAAAAAAA/maxresdefault.jpg");
  });
  it("accepts the page only for the video that was asked for", () => {
    expect(parseYoutube(fx("youtube.html"), "AAAAAAAAAAA")?.title).toBe("Schnelle Tomatensauce");
    expect(parseYoutube(fx("youtube.html"), "BBBBBBBBBBB")).toBeNull();
  });
  it("skips the platform's own links", () => {
    expect(p.links).toEqual(["https://www.example.org/tomatensauce"]);
  });
  it("falls back to the last thumbnail and gives null without video details", () => {
    const html = fx("youtube.html").replace(/<meta[^>]*>/, "");
    expect(parseYoutube(html)?.image).toBe("https://i.ytimg.com/vi/AAAAAAAAAAA/hq720.jpg");
    expect(parseYoutube('<script>var ytInitialPlayerResponse = {"a":')).toBeNull();
    expect(parseYoutube("<html></html>")).toBeNull();
  });
  it("gives null for an empty description without link", () => {
    expect(
      parseYoutube(
        '<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"x","shortDescription":""}};</script>',
      ),
    ).toBeNull();
  });
});

describe("Pinterest and Facebook", () => {
  const link = "https://www.example.org/stuffed-shells/?utm_medium=social&utm_source=pinterest";
  it("gives the outbound link of the pin, not the link of a related pin in the same block", () => {
    expect(parsePinterest(fx("pinterest.html"), "111222333")).toEqual({ text: "", links: [link] });
    expect(parsePinterest(fx("pinterest.html"))).toEqual({ text: "", links: [link] });
  });
  it("takes the pin's number from the loaded page when the address has none (pin.it)", () => {
    expect(parseSocialPage("pinterest", fx("pinterest-short.html"))?.links).toEqual(["https://www.example.org/pasta"]);
  });
  it("reads the pin's number from a canonical address with a title and with the attributes in any order", () => {
    const html = `<link href="https://www.pinterest.com/pin/nudeln--5551/" rel="canonical"/><script>{"id":"5551","link":"https://a.example/n"}</script>`;
    expect(parsePinterest(html)?.links).toEqual(["https://a.example/n"]);
  });
  it("follows no link without a sure pin number or when the number is not in the data", () => {
    const noId = fx("pinterest.html").replace(/<link[^>]*>|<meta[^>]*>/g, "");
    expect(parsePinterest(noId)).toBeNull();
    expect(parsePinterest(fx("pinterest.html"), "999")).toBeNull();
    expect(parsePinterest("<html></html>", "111222333")).toBeNull();
  });
  it("does not follow a pin to a short link or to Pinterest in another country", () => {
    const pin = (l: string) => `<script>{"id":"1","link":"${l}"}</script>`;
    expect(parsePinterest(pin("https://bit.ly/x"), "1")).toBeNull();
    for (const host of ["pinterest.de", "pinterest.at", "pinterest.ch", "pinterest.fr", "pinterest.co.uk"])
      expect(parsePinterest(pin(`https://www.${host}/pin/1/`), "1")).toBeNull();
  });
  it("uses the Instagram prefix pattern of the caption rules, one for both", () => {
    expect(INSTAGRAM_PREFIX.exec("2.310 Likes, 4 Kommentare – testkueche am 3. Mai 2026: x")?.[1]).toBe("testkueche");
    expect(parseInstagramPage(fx("instagram-post-de.html"))?.author).toBe("testkueche");
  });
  it("has no reader for Facebook or other kinds", () => {
    expect(parseSocialPage("facebook", fx("instagram-post.html"))).toBeNull();
    expect(parseSocialPage("webseite", "<html></html>")).toBeNull();
  });
});

describe("helpers", () => {
  it("finds up to three links of other sites, as http(s) only, in order", () => {
    const t =
      "Siehe instagram.com/x und https://www.instagram.com/y, dann www.kochen.example/r1. Oder http://a.example/b";
    expect(externalLinks(t)).toEqual(["https://www.kochen.example/r1", "http://a.example/b"]);
    expect(externalLinks("https://youtu.be/x https://a.example/p?q=1)")).toEqual(["https://a.example/p?q=1"]);
    expect(externalLinks("javascript:alert(1) ftp://a.example/x obsidian://open")).toEqual([]);
    expect(externalLinks("kein Link, nur 1.5 kg")).toEqual([]);
    expect(
      externalLinks("https://a.example/1 https://a.example/1 https://b.example https://c.example https://d.example"),
    ).toEqual(["https://a.example/1", "https://b.example/", "https://c.example/"]);
  });
  it("leaves out the links of all platforms and of short link and bio services", () => {
    const t = [
      "https://l.instagram.com/?u=1",
      "https://www.tiktok.com/@x",
      "https://pinterest.co.uk/pin/1",
      "https://www.facebook.com/x",
      "https://scontent.cdninstagram.com/a.jpg",
      "https://bit.ly/abc",
      "https://linktr.ee/x",
      "https://amzn.to/1",
      "https://later.com/linkinbio/x",
      "https://rezepte.example/suppe",
    ].join(" ");
    expect(externalLinks(t)).toEqual(["https://rezepte.example/suppe"]);
    expect(isRedirectLink("https://www.bit.ly/x")).toBe(true);
    expect(isRedirectLink("https://tap.bio/@x")).toBe(true);
    expect(isRedirectLink("https://later.com/blog")).toBe(false);
    expect(isRedirectLink("kein link")).toBe(true);
  });
  it("reads meta tags with either quote style and the JSON after a marker with braces in strings", () => {
    expect(metaContent("<meta content='A &amp; B' property='og:image'>", "og:image")).toBe("A & B");
    expect(jsonAfter('x = {"a":"}{","b":{"c":1}}; y', "x")).toEqual({ a: "}{", b: { c: 1 } });
    expect(jsonAfter('x["k"] = {"a":1}', "x")).toBeUndefined();
  });
  it("tidies a caption", () => {
    expect(tidyText("a\r\n\r\n\r\n\r\nb ​\n")).toBe("a\n\nb");
  });
});
