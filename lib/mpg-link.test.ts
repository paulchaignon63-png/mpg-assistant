import { describe, expect, it } from "vitest";
import { buildFormationBody } from "./mpg-link";

describe("buildFormationBody", () => {
  it("place les joueurs aux numéros attendus par MPG", () => {
    const starters = [
      { id: "g1", position: "G" as const },
      ...["d1", "d2", "d3"].map((id) => ({ id, position: "D" as const })),
      ...["m1", "m2", "m3", "m4"].map((id) => ({ id, position: "M" as const })),
      ...["a1", "a2", "a3"].map((id) => ({ id, position: "A" as const })),
    ];
    const bench = [
      { id: "d4", position: "D" as const },
      { id: "m5", position: "M" as const },
      { id: "m6", position: "M" as const },
      { id: "a4", position: "A" as const },
      { id: "g2", position: "G" as const },
    ];
    const body = buildFormationBody(
      { formation: 343, starters, bench, captainId: "a1", tacticalSubs: [{ outId: "a3", inId: "a4", threshold: 5 }] },
      (id) => `mpg_championship_player_${id}`
    );
    const pitch = body.playersOnPitch as Record<string, string | null>;
    expect(body.composition).toBe("343");
    expect(pitch["1"]).toBe("mpg_championship_player_g1");
    expect(pitch["2"]).toBe("mpg_championship_player_d1");
    expect(pitch["5"]).toBe("mpg_championship_player_m1");
    expect(pitch["11"]).toBe("mpg_championship_player_a3");
    expect(pitch["12"]).toBe("mpg_championship_player_d4");
    expect(pitch["13"]).toBeNull();
    expect(pitch["14"]).toBe("mpg_championship_player_m5");
    expect(pitch["16"]).toBe("mpg_championship_player_a4");
    expect(pitch["18"]).toBe("mpg_championship_player_g2");
    expect(body.captain).toBe("mpg_championship_player_a1");
    expect(body.tacticalSubs).toEqual([
      { rating: 5, subId: "mpg_championship_player_a4", starterId: "mpg_championship_player_a3" },
    ]);
  });
});
