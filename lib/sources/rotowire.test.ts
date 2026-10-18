import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRotowire } from "./rotowire";

describe("parseRotowire", () => {
  const html = readFileSync(path.join(__dirname, "__fixtures__", "rotowire-ligue1.html"), "utf8");
  const matches = parseRotowire(html);

  it("lit les deux équipes et leurs 11", () => {
    expect(matches.length).toBe(2);
    expect(matches[0].home.team).toBe("Angers");
    expect(matches[0].away.team).toBe("Marseille");
    expect(matches[0].home.starters).toHaveLength(11);
    expect(matches[0].away.starters).toContain("Amine Gouiri");
  });

  it("sépare les absents des titulaires", () => {
    const all = matches.flatMap((m) => [m.home, m.away]);
    for (const t of all) {
      for (const a of t.absences) expect(t.starters).not.toContain(a.name);
    }
  });

  it("repère une compo officielle", () => {
    expect(matches[0].home.confirmed).toBe(true);
  });
});
