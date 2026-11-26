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
import { firstExternalLink, jsonAfter, metaContent, tidyText } from "../src/socialText";
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
    expect(page.link).toBe("https://www.example.org/linsensuppe");
  });
  it("reads the German prefix with an en dash and typographic quotes", () => {
    const de = parseInstagramPage(fx("instagram-post-de.html"))!;
    expect(de.text).toBe("Brot ohne Kneten: 500 g Mehl, 400 ml Wasser, 1 TL Salz.");
    expect(de.author).toBe("testkueche");
    expect(de.link).toBeUndefined();
  });
  it("keeps a caption without prefix and a dash inside the caption", () => {
    const html = '<meta property="og:description" content="Mehl - Wasser am Morgen: 500 g" />';
    expect(parseInstagramPage(html)?.text).toBe("Mehl - Wasser am Morgen: 500 g");
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
    expect(page.link).toBe("https://beispiel.example/pfannkuchen");
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
  it("skips the platform's own links", () => {
    expect(p.link).toBe("https://www.example.org/tomatensauce");
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
  it("gives the outbound link of the pin", () => {
    expect(parsePinterest(fx("pinterest.html"))).toEqual({
      text: "",
      link: "https://www.example.org/stuffed-shells/?utm_medium=social&utm_source=pinterest",
    });
  });
  it("gives null without an outbound link", () => {
    expect(parsePinterest('{"link":"https://www.pinterest.com/pin/2/"}')).toBeNull();
    expect(parsePinterest("<html></html>")).toBeNull();
  });
  it("has no reader for Facebook or other kinds", () => {
    expect(parseSocialPage("facebook", fx("instagram-post.html"))).toBeNull();
    expect(parseSocialPage("webseite", "<html></html>")).toBeNull();
  });
});

describe("helpers", () => {
  it("finds the first link that is not the platform's own, as http(s) only", () => {
    const t =
      "Siehe instagram.com/x und https://www.instagram.com/y, dann www.kochen.example/r1. Oder http://a.example/b";
    expect(firstExternalLink(t, "instagram")).toBe("https://www.kochen.example/r1");
    expect(firstExternalLink("https://youtu.be/x https://a.example/p?q=1)", "youtube")).toBe("https://a.example/p?q=1");
    expect(firstExternalLink("javascript:alert(1) ftp://a.example/x obsidian://open", "instagram")).toBeUndefined();
    expect(firstExternalLink("kein Link, nur 1.5 kg", "tiktok")).toBeUndefined();
    expect(firstExternalLink("https://l.instagram.com/?u=1 und https://a.example", "instagram")).toBe(
      "https://a.example/",
    );
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
