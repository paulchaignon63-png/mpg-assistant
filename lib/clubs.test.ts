import { describe, expect, it } from "vitest";
import { clubKey, createClubMatcher, sameClub } from "./clubs";

describe("sameClub", () => {
  it("ne confond jamais le PSG et le Paris FC", () => {
    expect(sameClub("Paris", "Paris FC")).toBe(false);
    expect(sameClub("Paris FC", "Paris")).toBe(false);
    expect(sameClub("Paris Saint-Germain", "Paris FC")).toBe(false);
    expect(sameClub("PSG", "Paris")).toBe(true);
    expect(sameClub("Paris SG", "Paris Saint Germain")).toBe(true);
  });

  it("ignore les mots génériques", () => {
    expect(sameClub("RC Lens", "Lens")).toBe(true);
    expect(sameClub("Olympique de Marseille", "Marseille")).toBe(true);
    expect(sameClub("Stade Rennais FC", "Rennes")).toBe(true);
    expect(sameClub("Olympique Lyonnais", "Lyon")).toBe(true);
  });

  it("sépare les homonymes de ville", () => {
    expect(sameClub("Real Madrid", "Atlético Madrid")).toBe(false);
    expect(sameClub("Manchester City", "Manchester United")).toBe(false);
    expect(sameClub("Inter", "AC Milan")).toBe(false);
    expect(sameClub("Real Sociedad", "Real Madrid")).toBe(false);
  });

  it("renvoie faux sur un nom vide", () => {
    expect(sameClub("", "Lens")).toBe(false);
    expect(sameClub(undefined, undefined)).toBe(false);
    expect(clubKey(null)).toBe("");
  });
});

describe("createClubMatcher", () => {
  const l1 = ["Paris", "Paris FC", "Marseille", "Lens", "Brest", "Le Havre", "Lyon"];
  const match = createClubMatcher(l1);

  it("rattache les variantes au bon club", () => {
    expect(match("Paris Saint-Germain")).toBe("Paris");
    expect(match("Paris FC")).toBe("Paris FC");
    expect(match("Stade Brestois 29")).toBe("Brest");
    expect(match("Le Havre AC")).toBe("Le Havre");
    expect(match("RC Lens")).toBe("Lens");
  });

  it("ne rattache pas un club absent de la liste", () => {
    expect(match("Nantes")).toBeUndefined();
    expect(match("Real Madrid")).toBeUndefined();
  });
});
