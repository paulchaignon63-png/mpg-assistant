/**
 * Compos probables et officielles RotoWire (page publique, lisible depuis un
 * serveur, contrairement à Sofascore qui bloque les IP de datacenter).
 *
 * Pour chaque match : les 11 annoncés de chaque équipe, le statut
 * (« Expected » ou « Confirmed »), et les absents signalés (OUT / QUES).
 */

import * as cheerio from "cheerio";

const LEAGUE_CODES: Record<string, string> = {
  "1": "FRAN",
  "2": "EPL",
  "3": "LIGA",
  "5": "SERI",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export interface TeamLineup {
  team: string;
  confirmed: boolean;
  starters: string[];
  /** Absents annoncés : OUT = forfait, QUES = incertain. */
  absences: Array<{ name: string; status: "out" | "doubtful" }>;
}

export interface RotowireMatch {
  home: TeamLineup;
  away: TeamLineup;
}

export function rotowireSupported(championshipId: string): boolean {
  return championshipId in LEAGUE_CODES;
}

export function parseRotowire(html: string): RotowireMatch[] {
  const $ = cheerio.load(html);
  const out: RotowireMatch[] = [];
  $(".lineup").each((_, el) => {
    const box = $(el);
    const teams = box.find(".lineup__mteam").map((__, t) => $(t).text().trim().replace(/\s+/g, " ")).get();
    const lists = box.find(".lineup__list");
    if (teams.length < 2 || lists.length < 2) return;
    const read = (i: number): TeamLineup => {
      const list = lists.eq(i);
      const confirmed = list.find(".lineup__status").hasClass("is-confirmed") ||
        /confirmed/i.test(list.find(".lineup__status").text());
      const starters: string[] = [];
      const absences: TeamLineup["absences"] = [];
      list.find(".lineup__player").each((___, p) => {
        const row = $(p);
        const name = (row.find("a").attr("title") ?? row.find("a").text()).trim();
        if (!name) return;
        const inj = row.find(".lineup__inj").text().trim().toUpperCase();
        if (inj) absences.push({ name, status: inj === "OUT" ? "out" : "doubtful" });
        else if (starters.length < 11) starters.push(name);
      });
      return { team: teams[i], confirmed, starters, absences };
    };
    const home = read(0);
    const away = read(1);
    if (home.starters.length >= 9 && away.starters.length >= 9) out.push({ home, away });
  });
  return out;
}

export async function fetchRotowireLineups(championshipId: string): Promise<RotowireMatch[]> {
  const code = LEAGUE_CODES[championshipId];
  if (!code) return [];
  try {
    const res = await fetch(`https://www.rotowire.com/soccer/lineups.php?league=${code}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      next: { revalidate: 1800 },
    } as RequestInit);
    if (!res.ok) return [];
    return parseRotowire(await res.text());
  } catch {
    return [];
  }
}
