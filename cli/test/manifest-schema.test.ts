import { describe, expect, it } from "vitest";
import { ManifestValidationError, validateManifest } from "../src/manifest-schema.js";

const SHA = "a".repeat(64);
const COMMIT = "b".repeat(40);

function goodManifest() {
  return {
    manifestVersion: 1,
    release: { tag: "v1.0.0", commit: COMMIT, builtAt: "2026-01-01T00:00:00Z" },
    targets: [
      { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
      { id: "cursor", label: "Cursor", installRoot: ".", projectScoped: true },
    ],
    shimTemplates: [
      { id: "cursor-file-shim", sha256: SHA, managedByHeader: "# managed-by: ai-skills" },
    ],
    components: [
      {
        id: "rule.agents",
        type: "rule",
        source: "AGENTS.md",
        sha256: SHA,
        installs: { claude: { dest: "AGENTS.md" } },
      },
      {
        id: "rule.claude",
        type: "rule",
        source: "CLAUDE.md",
        sha256: SHA,
        installs: { claude: { dest: "CLAUDE.md" } },
        dependsOn: ["rule.agents"],
      },
      {
        id: "skill.weak-spots",
        type: "skill",
        source: "skills/weak-spots/SKILL.md",
        sha256: SHA,
        installs: {
          claude: { dest: ".claude/skills/weak-spots/SKILL.md" },
          cursor: { dest: ".cursor/rules/100-skill-weak-spots.mdc", shim: "cursor-file-shim" },
        },
      },
    ],
    bundles: [
      {
        id: "rules-core",
        label: "Core rules",
        description: "Cross-tool agent rules.",
        components: ["rule.agents", "rule.claude"],
      },
    ],
  };
}

type GoodManifest = ReturnType<typeof goodManifest>;
type GoodComponent = GoodManifest["components"][number];
type GoodBundle = GoodManifest["bundles"][number];

function comp(m: GoodManifest, i: number): GoodComponent {
  const c = m.components[i];
  if (!c) throw new Error(`fixture missing component at index ${i}`);
  return c;
}
function bundle(m: GoodManifest, i: number): GoodBundle {
  const b = m.bundles[i];
  if (!b) throw new Error(`fixture missing bundle at index ${i}`);
  return b;
}

function expectInvalid(mut: (m: ReturnType<typeof goodManifest>) => void, pathFragment: string): void {
  const m = goodManifest();
  mut(m);
  try {
    validateManifest(m);
    throw new Error("expected validation to fail");
  } catch (err) {
    expect(err).toBeInstanceOf(ManifestValidationError);
    expect((err as ManifestValidationError).path).toContain(pathFragment);
  }
}

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(() => validateManifest(goodManifest())).not.toThrow();
  });

  it("rejects missing manifestVersion", () => {
    expectInvalid((m) => {
      delete (m as { manifestVersion?: number }).manifestVersion;
    }, "$.manifestVersion");
  });

  it("rejects bad release commit (not 40 hex)", () => {
    expectInvalid((m) => {
      m.release.commit = "deadbeef";
    }, "$.release.commit");
  });

  it("rejects bad sha (not 64 hex)", () => {
    expectInvalid((m) => {
      comp(m, 0).sha256 = "abc";
    }, "$.components[0].sha256");
  });

  it("rejects dest with traversal '..'", () => {
    expectInvalid((m) => {
      comp(m, 0).installs.claude!.dest = "../evil.md";
    }, "$.components[0].installs.claude.dest");
  });

  it("rejects absolute dest", () => {
    expectInvalid((m) => {
      comp(m, 0).installs.claude!.dest = "/etc/passwd";
    }, "$.components[0].installs.claude.dest");
  });

  it("rejects Windows-absolute dest", () => {
    expectInvalid((m) => {
      comp(m, 0).installs.claude!.dest = "C:/Windows/System32/evil.md";
    }, "$.components[0].installs.claude.dest");
  });

  it("rejects case-insensitive dest collision within a target", () => {
    expectInvalid((m) => {
      m.components.push({
        id: "rule.duplicate",
        type: "rule",
        source: "OTHER.md",
        sha256: SHA,
        installs: { claude: { dest: "agents.md" } }, // collides with AGENTS.md on case-insensitive FS
      });
    }, "$.components[3].installs.claude.dest");
  });

  it("rejects dependency on unknown id", () => {
    expectInvalid((m) => {
      comp(m, 1).dependsOn = ["rule.does-not-exist"];
    }, "dependsOn");
  });

  it("rejects dependency cycles", () => {
    expectInvalid((m) => {
      comp(m, 0).dependsOn = ["rule.claude"];
      comp(m, 1).dependsOn = ["rule.agents"];
    }, "dependsOn");
  });

  it("rejects unknown shim template reference", () => {
    expectInvalid((m) => {
      comp(m, 2).installs.cursor!.shim = "no-such-shim";
    }, "$.components[2].installs.cursor.shim");
  });

  it("rejects unknown target reference in installs", () => {
    expectInvalid((m) => {
      (comp(m, 0).installs as Record<string, unknown>)["windsurf"] = { dest: "x.md" };
    }, "$.components[0].installs.windsurf");
  });

  it("rejects alias target that is not a current component", () => {
    expectInvalid((m) => {
      (m as Record<string, unknown>)["aliases"] = { "skill.old": "skill.gone" };
    }, "aliases");
  });

  it("rejects alias source still present as a current component", () => {
    expectInvalid((m) => {
      (m as Record<string, unknown>)["aliases"] = { "rule.agents": "rule.claude" };
    }, "aliases");
  });

  it("rejects bundle referencing an unknown component", () => {
    expectInvalid((m) => {
      bundle(m, 0).components.push("skill.missing");
    }, "$.bundles[0].components[2]");
  });

  it("rejects unknown component type", () => {
    expectInvalid((m) => {
      (comp(m, 0) as { type: string }).type = "widget";
    }, "$.components[0].type");
  });

  it("accepts the reserved 'stack' component type", () => {
    const m = goodManifest();
    m.components.push({
      id: "stack.python",
      type: "stack" as const,
      source: "stacks/python.md",
      sha256: SHA,
      installs: { claude: { dest: "stacks/python.md" } },
    });
    expect(() => validateManifest(m)).not.toThrow();
  });

  it("rejects empty components array? — components MAY be empty (allowed)", () => {
    const m = goodManifest();
    m.components = [];
    m.bundles = [];
    // Empty components is allowed; only targets array is required to be non-empty.
    expect(() => validateManifest(m)).not.toThrow();
  });

  it("rejects empty targets array", () => {
    expectInvalid((m) => {
      m.targets = [];
    }, "$.targets");
  });
});
