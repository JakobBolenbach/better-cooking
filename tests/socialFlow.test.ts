import { describe, expect, it } from "vitest";
import {
  instagramEmbedUrl,
  captionIsRecipe,
  fallbackAfter,
  postId,
  socialHeaders,
  socialPlan,
  socialPageUrl,
  socialRoute,
  socialText,
} from "../src/socialFlow";
import type { Processor, Ready } from "../src/processor";
import { detectSource } from "../src/source";
import { recipeFromText } from "../src/textRecipe";
import { missingRecipeHint } from "../src/caption";

const none: Ready = { claude: false, github: false, ai: false };
const route = (kind: Parameters<typeof socialRoute>[0], chosen: Processor, ready: Partial<Ready> = {}) =>
  socialRoute(kind, chosen, { ...none, ...ready });

describe("socialRoute", () => {
  it("reads social media locally with the offline rules when nothing is set up", () => {
    expect(route("instagram", "auto")).toEqual({ via: "local", ai: false, fallback: null });
    expect(route("tiktok", "none", { claude: true, ai: true })).toEqual({ via: "local", ai: false, fallback: null });
    expect(route("pinterest", "auto")).toEqual({ via: "local", ai: false, fallback: null });
  });
  it("uses the own AI for the text when it is set up, but not for none", () => {
    expect(route("youtube", "ai", { ai: true })).toEqual({ via: "local", ai: true, fallback: null });
    expect(route("youtube", "auto", { ai: true })).toEqual({ via: "local", ai: true, fallback: null });
    expect(route("youtube", "ai")).toEqual({ via: "local", ai: false, fallback: null });
  });
  it("lets Automatic fall back to a set up processor, Claude before GitHub", () => {
    expect(route("instagram", "auto", { claude: true, github: true })).toMatchObject({
      via: "local",
      fallback: "claude",
    });
    expect(route("instagram", "auto", { github: true })).toMatchObject({ fallback: "github" });
    expect(route("instagram", "ai", { claude: true, ai: true })).toMatchObject({ fallback: null });
  });
  it("sends to the processor as before when Claude or GitHub were chosen on purpose", () => {
    expect(route("instagram", "claude", { claude: true })).toEqual({ via: "processor", processor: "claude" });
    expect(route("tiktok", "github", { claude: true })).toEqual({ via: "processor", processor: null });
  });
  it("gives Facebook to a processor or says to paste the text", () => {
    expect(route("facebook", "auto")).toEqual({ via: "facebook" });
    expect(route("facebook", "ai", { ai: true })).toEqual({ via: "facebook" });
    expect(route("facebook", "auto", { github: true })).toEqual({ via: "processor", processor: "github" });
  });
  it("is not for websites and text", () => {
    expect(route("webseite", "auto")).toBeNull();
    expect(route("text", "none")).toBeNull();
  });
});

const recipe = (ingredients: string[], steps: string[]) =>
  ({ title: "x", ingredients, steps: steps.map((text) => ({ text })), images: [] }) as never;

describe("plan", () => {
  const page = { text: "x", links: ["https://a.example/r", "https://localhost/x", "https://b.example/r"] };
  it("follows the links of a post that has no recipe in its caption, public addresses only, then the text", () => {
    expect(socialPlan(page, undefined)).toEqual({ links: ["https://a.example/r", "https://b.example/r"], text: true });
    expect(socialPlan(page, recipe(["1 Ei"], []))).toMatchObject({
      links: ["https://a.example/r", "https://b.example/r"],
    });
    expect(socialPlan({ text: "", links: ["https://a.example/r"] }, undefined)).toEqual({
      links: ["https://a.example/r"],
      text: false,
    });
  });
  it("follows no link when the caption holds ingredients and steps", () => {
    expect(captionIsRecipe(recipe(["1 Ei"], ["Braten."]))).toBe(true);
    expect(socialPlan(page, recipe(["1 Ei"], ["Braten."]))).toEqual({ links: [], text: true });
  });
  it("tries at most three links", () => {
    const many = { text: "", links: ["a", "b", "c", "d"].map((h) => `https://${h}.example/`) };
    expect(socialPlan(many, undefined).links).toHaveLength(3);
  });
  it("puts a video title in front of the text", () => {
    expect(socialText({ text: "Zutaten", title: "Suppe" })).toBe("Suppe\n\nZutaten");
    expect(socialText({ text: "Zutaten" })).toBe("Zutaten");
  });
});

describe("fallback", () => {
  it("falls back to the processor only when there was nothing readable or no recipe", () => {
    expect(fallbackAfter("claude", "noRecipe")).toBe("claude");
    expect(fallbackAfter("github", "unreadable")).toBe("github");
    expect(fallbackAfter("claude", "technical")).toBeNull();
    expect(fallbackAfter("claude", "duplicate")).toBeNull();
    expect(fallbackAfter(null, "noRecipe")).toBeNull();
  });
});

describe("request", () => {
  it("rebuilds the post address from the key, without user prefix and tracking", () => {
    const url = (u: string) => socialPageUrl(detectSource(u));
    expect(url("https://www.instagram.com/user/reel/AbC_1/?igsh=x")).toBe("https://www.instagram.com/p/AbC_1/");
    expect(url("https://www.instagram.com/p/AbC_1/")).toBe("https://www.instagram.com/p/AbC_1/");
    expect(url("https://www.instagram.com/user/")).toBeUndefined();
    expect(instagramEmbedUrl("https://www.instagram.com/p/AbC_1/")).toBe(
      "https://www.instagram.com/p/AbC_1/embed/captioned/",
    );
    expect(url("https://youtu.be/AAAAAAAAAAA")).toBe("https://www.youtube.com/watch?v=AAAAAAAAAAA");
    expect(url("https://m.youtube.com/shorts/AAAAAAAAAAA?si=x")).toBe("https://www.youtube.com/watch?v=AAAAAAAAAAA");
    expect(url("https://www.youtube.com/@kanal")).toBeUndefined();
    expect(url("https://www.tiktok.com/@x/video/1?_r=1")).toBe("https://www.tiktok.com/@x/video/1?_r=1");
    expect(url("https://www.facebook.com/x")).toBeUndefined();
  });
  it("takes the post's ID from the key or the address", () => {
    expect(postId(detectSource("https://www.instagram.com/reel/AbC_1/"))).toBe("AbC_1");
    expect(postId(detectSource("https://www.pinterest.com/pin/214343263514677595/"))).toBe("214343263514677595");
    expect(postId(detectSource("https://www.tiktok.com/@x/video/1"))).toBeUndefined();
  });
  it("sends the mobile browser headers only to Instagram, and never cookies or tokens", () => {
    const ig = socialHeaders("instagram");
    expect(ig["Sec-Fetch-Mode"]).toBe("navigate");
    expect(ig["User-Agent"]).toContain("iPhone");
    expect(Object.keys(socialHeaders("tiktok"))).toEqual(["Accept"]);
    for (const k of ["instagram", "tiktok", "youtube", "pinterest"] as const)
      expect(Object.keys(socialHeaders(k)).map((h) => h.toLowerCase())).not.toContain("cookie");
  });
});

describe("caption rules in the plan (#88)", () => {
  const read = (text: string) => ({ text, links: ["https://a.example/r"] });
  it("does not follow a link when the one-line caption holds ingredients and steps", () => {
    const text =
      "Linsensuppe Zutaten: 200 g rote Linsen, 1 Zwiebel, 500 ml Brühe Zubereitung: 1. Zwiebel anschwitzen. 2. Linsen und Brühe zugeben und 15 Min. kochen.";
    const page = read(text);
    expect(socialPlan(page, recipeFromText(text, { caption: true })).links).toEqual([]);
  });
  it("follows the link when the caption points elsewhere, and names the hint for the end", () => {
    const text = "Die ganze Suppe, Rezept in der Bio! https://a.example/r";
    const rules = recipeFromText(text, { caption: true });
    expect(socialPlan(read(text), rules).links).toEqual(["https://a.example/r"]);
    expect(missingRecipeHint(text, !!rules, false)).toBe("captionInBio");
  });
});
