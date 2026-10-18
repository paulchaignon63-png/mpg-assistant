import { describe, expect, it } from "vitest";
import { shortName } from "./names";

describe("shortName", () => {
  it("garde les particules du nom de famille", () => {
    expect(shortName("Jeffrey de Lange")).toBe("de Lange");
    expect(shortName("Branco van den Boomen")).toBe("van den Boomen");
    expect(shortName("Amine El Ouazzani")).toBe("El Ouazzani");
    expect(shortName("Wissam Ben Yedder")).toBe("Ben Yedder");
  });

  it("ne prend jamais le prénom pour une particule", () => {
    expect(shortName("Ben White")).toBe("White");
    expect(shortName("Achraf Hakimi")).toBe("Hakimi");
  });

  it("gère les noms à un mot et les valeurs vides", () => {
    expect(shortName("Alexsandro")).toBe("Alexsandro");
    expect(shortName("")).toBe("");
    expect(shortName(undefined)).toBe("");
  });
});
