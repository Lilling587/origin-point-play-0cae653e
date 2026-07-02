// Server-only helpers for the vMix broadcast integration.
// Scrape a team's roster from the swehockey team-roster page. The page groups
// every team in the competition under its own anchor; extract the section for
// the requested team and pull player rows.

import type { Season } from "./seasons.config";

const STATS_BASE_URL = "https://stats.swehockey.se";

export type VmixPlayer = {
  number: number | null;
  name: string;
  position: string | null;
  line: number | null;
  starter?: boolean;
};

export type VmixLineup = {
  team: string;
  goalies: VmixPlayer[];
  skaters: VmixPlayer[];
  coach: string | null;
  notes: string | null;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&aring;/g, "å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Aring;/g, "Å")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTds(row: string): string[] {
  const cells: string[] = [];
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(row)) !== null) {
    cells.push(stripTags(m[1]));
  }
  return cells;
}

/**
 * Scrape roster HTML for a single team from the season's competition roster
 * page. Returns a best-effort lineup (players may be missing lines/positions —
 * the admin editor lets you fill those in before publishing).
 */
export async function scrapeTeamRoster(
  teamName: string,
  season: Season,
): Promise<VmixLineup> {
  const url = `${STATS_BASE_URL}/Teams/Info/TeamRoster/${season.competitionId}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
  const html = await res.text();

  // Locate the team block. The page renders `<h3>TeamName</h3>` (or similar
  // heading) followed by a table of players. We look for the first occurrence
  // of the team name and take everything up to the next team heading.
  const escapedName = teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(
    `<h[1-6][^>]*>\\s*(?:<[^>]+>\\s*)*${escapedName}\\s*(?:<[^>]+>\\s*)*<\\/h[1-6]>`,
    "i",
  );
  const startMatch = headingRe.exec(html);
  let block: string;
  if (startMatch) {
    const startIdx = startMatch.index;
    const rest = html.slice(startIdx + startMatch[0].length);
    const nextHeading = rest.search(/<h[1-6][^>]*>/i);
    block = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  } else {
    // Fallback: search near an anchor with the team name.
    const anchorRe = new RegExp(
      `${escapedName}[\\s\\S]{0,20000}?<\\/table>`,
      "i",
    );
    const m = anchorRe.exec(html);
    if (!m) {
      return {
        team: teamName,
        goalies: [],
        skaters: [],
        coach: null,
        notes: null,
      };
    }
    block = m[0];
  }

  const goalies: VmixPlayer[] = [];
  const skaters: VmixPlayer[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(block)) !== null) {
    const cells = extractTds(rm[1]);
    if (cells.length < 2) continue;

    // Common swehockey roster layouts:
    //   [number, name, position, ...] or [name, position, birth, ...]
    let number: number | null = null;
    let name = "";
    let position: string | null = null;

    const firstNum = Number(cells[0].replace(/\D/g, ""));
    if (Number.isFinite(firstNum) && firstNum > 0 && firstNum < 100 && cells[0].trim().length <= 3) {
      number = firstNum;
      name = cells[1];
      position = cells[2] ?? null;
    } else {
      name = cells[0];
      position = cells[1] ?? null;
    }

    if (!name || name.length < 2) continue;
    if (/^(nr|name|namn|pos|position|player|spelare)$/i.test(name)) continue;

    const posUpper = (position ?? "").toUpperCase().trim();
    const isGoalie = /^(G|GK|MV|GOALIE|MÅLVAKT|GOALKEEPER)$/i.test(posUpper);
    const player: VmixPlayer = {
      number,
      name: name.trim(),
      position: position ? position.trim() : null,
      line: null,
    };
    if (isGoalie) goalies.push(player);
    else skaters.push(player);
  }

  // Deduplicate by name+number (roster tables occasionally repeat headers).
  const dedup = (list: VmixPlayer[]) => {
    const seen = new Set<string>();
    return list.filter((p) => {
      const key = `${p.number ?? ""}:${p.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  return {
    team: teamName,
    goalies: dedup(goalies),
    skaters: dedup(skaters),
    coach: null,
    notes: null,
  };
}
