import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

import { parseArticle } from "./publish.mjs";
import { renderMarkdown } from "./markdown.mjs";

describe("parseArticle", () => {
  it("reads front matter and body", () => {
    const post = parseArticle('---\nslug: my-post\ntitle: "A \\"quoted\\" title"\ndescription: Short\ntags: a, b ,c\n---\n\n## Hi\n');
    expect(post).toMatchObject({
      slug: "my-post", title: 'A "quoted" title', description: "Short",
      category: "general", tags: ["a", "b", "c"], audience: "general", body_md: "## Hi\n",
    });
  });
  it("refuses a missing field or a slug that is not kebab-case", () => {
    expect(() => parseArticle("no front matter")).toThrow(/front matter/);
    expect(() => parseArticle("---\nslug: x\ntitle: t\n---\nbody")).toThrow(/description/);
    expect(() => parseArticle("---\nslug: Bad Slug\ntitle: t\ndescription: d\n---\nbody")).toThrow(/kebab/);
  });
});

describe("content/blog articles", () => {
  const dir = new URL("../../content/blog/", import.meta.url);
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    it(`${name} parses, matches its filename and renders`, () => {
      const post = parseArticle(readFileSync(new URL(name, dir), "utf8"));
      expect(`${post.slug}.md`).toBe(name);
      expect(post.description.length).toBeLessThanOrEqual(170);
      expect(renderMarkdown(post.body_md)).toContain("<h2");
    });
  }
});
