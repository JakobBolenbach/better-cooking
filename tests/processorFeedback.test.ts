// The user's feedback (`hinweis`, issue #120) in the requests to Claude and GitHub: only for an improvement job.
import { beforeAll, describe, expect, it } from "vitest";
import { evaluateResponse, githubRequest, jobText, newJob } from "../src/processor";
import { FEEDBACK_MAX } from "../src/feedback";
import { setLanguage } from "../src/i18n";
import { detectSource } from "../src/source";

beforeAll(() => setLanguage("de"));

const e = detectSource("https://www.chefkoch.de/rezepte/1/x.html");
const a = { id: "rz-k3j9x-abc1", input: e.url!, improve: true as const };
const inputs = (req: ReturnType<typeof githubRequest>) =>
  (JSON.parse(req.body) as { inputs: Record<string, string> }).inputs;

describe("hinweis for Claude (job text)", () => {
  it("is sent as the user's text when set", () => {
    const t = JSON.parse(jobText({ ...a, feedback: "Ofen auf 200 °C" }, e)) as Record<string, unknown>;
    expect(t).toMatchObject({ verbessern: true, hinweis: "Ofen auf 200 °C" });
  });
  it("is left out without feedback, with empty feedback and for a normal job", () => {
    expect(JSON.parse(jobText(a, e))).not.toHaveProperty("hinweis");
    expect(JSON.parse(jobText({ ...a, feedback: " \n " }, e))).not.toHaveProperty("hinweis");
    const normal = { id: a.id, input: a.input, feedback: "x" };
    expect(JSON.parse(jobText(normal, e))).not.toHaveProperty("hinweis");
  });
  it("is cleaned and limited even if data.json held something else", () => {
    const t = JSON.parse(jobText({ ...a, feedback: `a\n\u0000b${"c".repeat(2000)}` }, e)) as { hinweis: string };
    expect(t.hinweis.startsWith("a b")).toBe(true);
    expect(t.hinweis).toHaveLength(FEEDBACK_MAX);
  });
});

describe("hinweis for GitHub (workflow input)", () => {
  const req = (x: Parameters<typeof githubRequest>[2]) => githubRequest("o/v", "t", x, e);
  it("is an input string only when set", () => {
    expect(inputs(req({ ...a, feedback: "mehr Salz" }))).toMatchObject({ verbessern: "true", hinweis: "mehr Salz" });
    expect(inputs(req(a))).not.toHaveProperty("hinweis");
    expect(inputs(req({ id: a.id, input: a.input, feedback: "x" }))).not.toHaveProperty("hinweis");
  });
});

describe("the job and its 422", () => {
  it("keeps the feedback in the job", () => {
    expect(newJob({ ...a, feedback: "mehr Salz" }, e, "claude", "d1", undefined, 5)).toMatchObject({
      improve: true,
      feedback: "mehr Salz",
    });
  });
  it("names both inputs when the workflow does not know them", () => {
    const r = evaluateResponse("github", 422, { message: 'Unexpected inputs provided: ["hinweis"]' });
    expect(!r.ok && r.message).toContain("hinweis");
  });
});
