import { describe, expect, it } from "vitest";

import { SkillLoader, createMemorySkillSource, createSkillLoaderFromMarkdown, parseSkillMarkdown } from "./skills.js";

const COMMIT_SKILL = `---
name: commit-messages
description: Write conventional commit messages
tags: git, commit
version: 1
---

Use \`feat(area): …\` and always add the co-author trailer.`;

const SEARCH_SKILL = `# Web search
How to search well for the user.`;

describe("parseSkillMarkdown", () => {
  it("reads frontmatter and body", () => {
    const skill = parseSkillMarkdown(COMMIT_SKILL);
    expect(skill.name).toBe("commit-messages");
    expect(skill.description).toBe("Write conventional commit messages");
    expect(skill.tags).toEqual(["git", "commit"]);
    expect(skill.version).toBe("1");
    expect(skill.body).toContain("co-author trailer");
  });

  it("falls back to the first heading for the name", () => {
    expect(parseSkillMarkdown(SEARCH_SKILL).name).toBe("Web search");
  });
});

describe("SkillLoader", () => {
  it("lists, loads, and wraps a skill as trusted instructions", async () => {
    const loader = new SkillLoader({ sources: [createMemorySkillSource([parseSkillMarkdown(COMMIT_SKILL)])] });

    expect((await loader.list()).map((skill) => skill.name)).toEqual(["commit-messages"]);

    const prompt = await loader.loadPrompt("commit-messages");
    expect(prompt).toContain("# Skill: commit-messages");
    expect(prompt).toContain("Trusted instructions");
    expect(prompt).toContain("co-author trailer");

    expect(await loader.loadPrompt("missing")).toBeUndefined();
  });

  it("builds a catalog prompt for on-demand selection", async () => {
    const loader = createSkillLoaderFromMarkdown({
      "commit-messages.md": COMMIT_SKILL,
      "web-search.md": SEARCH_SKILL,
    });
    const catalog = await loader.catalogPrompt();
    expect(catalog).toContain("commit-messages");
    expect(catalog).toContain("Web search");
  });

  it("selects skills by keyword overlap", async () => {
    const loader = createSkillLoaderFromMarkdown({
      "commit-messages.md": COMMIT_SKILL,
      "web-search.md": SEARCH_SKILL,
    });
    const selected = await loader.select("help me commit this change", 3);
    expect(selected.map((skill) => skill.name)).toEqual(["commit-messages"]);
    expect(await loader.select("zzz", 3)).toEqual([]);
  });
});
