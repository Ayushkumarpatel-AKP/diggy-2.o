/**
 * On-demand skill loader (agentskills.io style).
 *
 * Skills are blocks of *trusted* instructions the brain loads only when a task
 * needs them — they are never all stuffed into the base prompt. The catalog is
 * offered to the model so it can ask for one; {@link SkillLoader.loadPrompt}
 * returns the wrapped instruction block the host then layers in.
 *
 * Markdown format (YAML-ish frontmatter + body):
 *
 * ```
 * ---
 * name: commit-messages
 * description: Write conventional commit messages
 * tags: git, commit
 * ---
 * <instructions>
 * ```
 */
export interface SkillSummary {
  name: string;
  description: string;
  tags: string[];
}

export interface Skill extends SkillSummary {
  body: string;
  version?: string;
  source?: string;
}

/** A place skills come from (a folder, a bundle, an in-memory map). */
export interface SkillSource {
  list(): SkillSummary[] | Promise<SkillSummary[]>;
  load(name: string): Skill | undefined | Promise<Skill | undefined>;
}

export interface SkillLoaderOptions {
  sources?: SkillSource[];
  /** Cap on a loaded body, in characters. Default 12_000. */
  maxBodyChars?: number;
}

/** Parse `--- frontmatter --- body` markdown into a {@link Skill}. */
export function parseSkillMarkdown(text: string, fallbackName = "untitled"): Skill {
  const source = typeof text === "string" ? text : "";
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/.exec(source);
  const frontmatter = match?.[1] ?? "";
  const body = (match?.[2] ?? source).trim();

  const meta = new Map<string, string>();
  for (const line of frontmatter.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    meta.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
  }

  const name = meta.get("name") || firstHeading(body) || fallbackName;
  const description = meta.get("description") ?? "";
  const tags = (meta.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const skill: Skill = { name, description, tags, body };
  const version = meta.get("version");
  if (version) skill.version = version;
  return skill;
}

function firstHeading(body: string): string | undefined {
  const line = body.split(/\r?\n/).find((candidate) => candidate.trim().startsWith("#"));
  return line?.replace(/^#+\s*/, "").trim() || undefined;
}

/** Deduplicating, priority-ordered loader over one or more sources. */
export class SkillLoader {
  private readonly sources: SkillSource[];
  private readonly maxBodyChars: number;

  constructor(options: SkillLoaderOptions = {}) {
    this.sources = [...(options.sources ?? [])];
    this.maxBodyChars = Math.max(1, options.maxBodyChars ?? 12_000);
  }

  /** Add a source (index 0 wins on name collisions). */
  register(source: SkillSource): this {
    this.sources.push(source);
    return this;
  }

  /** All known skills, deduped by name. */
  async list(): Promise<SkillSummary[]> {
    const byName = new Map<string, SkillSummary>();
    for (const source of this.sources) {
      for (const summary of await source.list()) {
        if (summary?.name && !byName.has(summary.name)) {
          byName.set(summary.name, { name: summary.name, description: summary.description ?? "", tags: summary.tags ?? [] });
        }
      }
    }
    return [...byName.values()];
  }

  /** Load a skill body by name (first source that has it wins). */
  async load(name: string): Promise<Skill | undefined> {
    for (const source of this.sources) {
      const skill = await source.load(name);
      if (skill) return { ...skill, body: this.capBody(skill.body) };
    }
    return undefined;
  }

  /** The wrapped, trusted instruction block for a skill. */
  async loadPrompt(name: string): Promise<string | undefined> {
    const skill = await this.load(name);
    if (!skill) return undefined;
    const header = `# Skill: ${skill.name}`;
    const description = skill.description ? `\n${skill.description}` : "";
    return `${header}${description}\n\nTrusted instructions — follow them for this task:\n\n${skill.body}`;
  }

  /** A catalog block the model can browse to request a skill on demand. */
  async catalogPrompt(): Promise<string> {
    const skills = await this.list();
    if (skills.length === 0) return "";
    const lines = skills.map((skill) =>
      skill.description ? `- ${skill.name} — ${skill.description}` : `- ${skill.name}`,
    );
    return ["# Available skills (load one only when the task needs it)", ...lines].join("\n");
  }

  /**
   * Keyword-match a goal against the catalog. Deterministic; returns at most
   * `limit` skills, best match first, and nothing when there is no overlap.
   */
  async select(goal: string, limit = 3): Promise<SkillSummary[]> {
    const words = new Set(
      String(goal ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3),
    );
    if (words.size === 0) return [];
    const scored = (await this.list())
      .map((skill) => {
        const haystack = `${skill.name} ${skill.description} ${skill.tags.join(" ")}`.toLowerCase();
        let score = 0;
        for (const word of words) if (haystack.includes(word)) score += 1;
        return { skill, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
    return scored.slice(0, Math.max(0, limit)).map((entry) => entry.skill);
  }

  private capBody(body: string): string {
    const value = typeof body === "string" ? body : "";
    if (value.length <= this.maxBodyChars) return value;
    return `${value.slice(0, this.maxBodyChars)}\n…[skill truncated]`;
  }
}

/** A source backed by an in-memory array of skills. */
export function createMemorySkillSource(skills: Skill[]): SkillSource {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  return {
    list: () => [...byName.values()].map((skill) => ({ name: skill.name, description: skill.description, tags: skill.tags })),
    load: (name) => byName.get(name),
  };
}

/** Build a loader from a `{ filename: markdown }` map (the shape a bundle gives). */
export function createSkillLoaderFromMarkdown(docs: Record<string, string>, options: SkillLoaderOptions = {}): SkillLoader {
  const skills = Object.entries(docs).map(([name, text]) => {
    const fileName = name.replace(/\.md$/i, "").split(/[\\/]/).pop() ?? name;
    return parseSkillMarkdown(text, fileName);
  });
  return new SkillLoader({ ...options, sources: [createMemorySkillSource(skills), ...(options.sources ?? [])] });
}
