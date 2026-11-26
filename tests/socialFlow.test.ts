import { describe, expect, it } from "vitest";
import {
  instagramEmbedUrl,
  nextSocialStep,
  socialHeaders,
  socialPageUrl,
  socialRoute,
  socialText,
} from "../src/socialFlow";
import type { Processor, Ready } from "../src/processor";

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

describe("next step", () => {
  it("follows a link first, then the text, otherwise nothing", () => {
    expect(nextSocialStep({ text: "x", link: "https://a.example/" })).toEqual({
      do: "website",
      link: "https://a.example/",
    });
    expect(nextSocialStep({ text: "x" })).toEqual({ do: "text" });
    expect(nextSocialStep({ text: "" })).toEqual({ do: "nothing" });
  });
  it("puts a video title in front of the text", () => {
    expect(socialText({ text: "Zutaten", title: "Suppe" })).toBe("Suppe\n\nZutaten");
    expect(socialText({ text: "Zutaten" })).toBe("Zutaten");
  });
});

describe("request", () => {
  it("rebuilds the post address without user prefix and tracking", () => {
    expect(socialPageUrl("instagram", "https://www.instagram.com/user/reel/AbC_1/?igsh=x")).toBe(
      "https://www.instagram.com/reel/AbC_1/",
    );
    expect(socialPageUrl("instagram", "https://www.instagram.com/p/AbC_1/")).toBe("https://www.instagram.com/p/AbC_1/");
    expect(socialPageUrl("instagram", "https://www.instagram.com/user/")).toBeUndefined();
    expect(instagramEmbedUrl("https://www.instagram.com/p/AbC_1/")).toBe(
      "https://www.instagram.com/p/AbC_1/embed/captioned/",
    );
    expect(socialPageUrl("youtube", "https://youtu.be/AAAAAAAAAAA")).toBe(
      "https://www.youtube.com/watch?v=AAAAAAAAAAA",
    );
    expect(socialPageUrl("youtube", "https://m.youtube.com/shorts/AAAAAAAAAAA")).toBe(
      "https://www.youtube.com/shorts/AAAAAAAAAAA",
    );
    expect(socialPageUrl("facebook", "https://www.facebook.com/x")).toBeUndefined();
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
