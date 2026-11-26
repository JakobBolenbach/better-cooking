// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findRecipeMicrodata } from "../src/microdata";
import { recipeFromSchema } from "../src/schemaorg";

const page = `<!doctype html><html><body>
<div itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Grandma's apple cake</h1>
  <img itemprop="image" src="/img/cake.jpg" alt="">
  <span itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">Test Kitchen</span></span>
  <meta itemprop="prepTime" content="PT20M"><time itemprop="totalTime" datetime="PT1H10M">70 min</time>
  <p itemprop="description">Moist and <b>simple</b>.</p>
  <span itemprop="recipeYield">12 pieces</span>
  <ul>
    <li itemprop="recipeIngredient">200 g flour</li>
    <li itemprop="recipeIngredient">3 apples</li>
    <li itemprop="ingredients">ignored old name</li>
  </ul>
  <ol itemprop="recipeInstructions">
    <li itemprop="step" itemscope itemtype="https://schema.org/HowToStep"><span itemprop="text">Mix.</span></li>
  </ol>
  <div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
    <span itemprop="name">Bake</span><span itemprop="text">Bake for 40 minutes.</span>
  </div>
  <script>window.hacked = true</script>
</div>
</body></html>`;

describe("findRecipeMicrodata", () => {
  it("reads a recipe like JSON-LD", () => {
    const r = recipeFromSchema(findRecipeMicrodata(page)!, "https://example.org/cake");
    expect(r).toMatchObject({
      title: "Grandma's apple cake",
      author: "Test Kitchen",
      description: "Moist and simple.",
      result: "12 pieces",
      timeActive: 20,
      timeTotal: 70,
      ingredients: ["200 g flour", "3 apples"],
      images: ["https://example.org/img/cake.jpg"],
    });
    expect(r.steps.map((s) => s.text)).toContain("Bake for 40 minutes.");
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it("reads the old vocabulary and ignores pages without a recipe", () => {
    const old = `<div itemscope itemtype="http://schema.org/Recipe"><span itemprop="name">Soup</span><span itemprop="ingredients">1 l water</span></div>`;
    expect(findRecipeMicrodata(old)?.recipeIngredient).toBe("1 l water");
    expect(findRecipeMicrodata("<div itemscope itemtype='https://schema.org/Person'></div>")).toBeNull();
  });
});
