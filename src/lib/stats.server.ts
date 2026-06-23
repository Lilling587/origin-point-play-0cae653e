import Firecrawl from "@mendable/firecrawl-js";
import { generateText } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { BriefingSchema, TeamsSchema, type Briefing } from "./stats.functions";
import { DEFAULT_SEASON, type Season } from "./seasons.config";

async function generateJson<T extends z.ZodTypeAny>(
  model: ReturnType<typeof aiModel>,
  schema: T,
  prompt: string,
): Promise<z.infer<T>> {
  const { text } = await generateText({
    model,
    prompt:
      prompt +
      `\n\nRespond with ONLY valid JSON matching this requirement, no prose, no markdown code fences.`,
  });
  let raw = text.trim();
  // Strip ```json fences if present
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  // Find first {...} or [...] block
  const start = raw.search(/[\[{]/);
  if (start > 0) raw = raw.slice(start);
  try {
    return schema.parse(JSON.parse(raw));
  } catch (e) {
    throw new Error(
      `AI returned data that did not match expected shape: ${(e as Error).message}. Raw start: ${raw.slice(0, 200)}`,
    );
  }
}

// ---------- Clients ----------

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function firecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY_1 || process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");
  return new Firecrawl({ apiKey });
}

function aiModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const gateway = createLovableAiGatewayProvider(key);
  return gateway("google/gemini-2.5-flash");
}

// ---------- Cache ----------

export async function getCached(key: string, ttlMs: number) {
  const { data } = await admin()
    .from("cached_briefings")
    .select("payload, fetched_at")
    .eq("matchup_key", key)
    .maybeSingle();
  if (!data) return null;
  const ageMs = Date.now() - new Date(data.fetched_at as string).getTime();
  if (ageMs > ttlMs) return null;
  return data.payload as unknown;
}

export async function setCached(key: string, payload: unknown) {
  await admin()
    .from("cached_briefings")
    .upsert(
      {
        matchup_key: key,
        payload: payload as object,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "matchup_key" },
    );
}

// ---------- Scrape helpers ----------

const STATS_BASE_URL = "https://stats.swehockey.se";
const LEAGUE_NAME = "Hockeyettan Södra";

type Urls = {
  standings: string;
  schedule: string;
  roster: string;
  scoring: string;
  teamStats: string;
  specialTeams: string;
};

function buildUrls(competitionId: string): Urls {
  return {
    standings: `${STATS_BASE_URL}/ScheduleAndResults/Standings/${competitionId}`,
    schedule: `${STATS_BASE_URL}/ScheduleAndResults/Schedule/${competitionId}`,
    roster: `${STATS_BASE_URL}/Teams/Info/TeamRoster/${competitionId}`,
    scoring: `${STATS_BASE_URL}/Teams/Info/PlayersByTeam/${competitionId}`,
    teamStats: `${STATS_BASE_URL}/Teams/Statistics/ScoringAndGoalkeeping/${competitionId}`,
    specialTeams: `${STATS_BASE_URL}/Teams/Statistics/PowerplayAndPenaltyKilling/${competitionId}`,
  };
}

async function scrapeMd(url: string): Promise<string> {
  const fc = firecrawl();
  const res = await fc.scrape(url, {
    formats: ["markdown"],
    onlyMainContent: true,
  });
  const md =
    (res as { markdown?: string }).markdown ??
    (res as { data?: { markdown?: string } }).data?.markdown ??
    "";
  return md;
}

function extractTeamSection(md: string, teamName: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((line) =>
    line.includes(`| | ${teamName} | ${teamName} |`),
  );
  if (start === -1) return md.slice(0, 10000);

  const end = lines.findIndex(
    (line, index) =>
      index > start && /^\| \| .+ \| .+ \| \[\\\[Top\\\]\]/.test(line),
  );
  return lines.slice(start, end === -1 ? start + 90 : end).join("\n");
}

function extractRowsForTeam(md: string, needles: string[]): string {
  const lower = needles.map((n) => n.toLowerCase()).filter(Boolean);
  const rows = md
    .split("\n")
    .filter((line) => {
      const l = line.toLowerCase();
      return lower.some((n) => l.includes(n));
    });
  return rows.length > 0 ? rows.join("\n") : md.slice(0, 4000);
}

function extractH2HRows(scheduleMd: string, home: string, away: string): string {
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  const rows = scheduleMd
    .split("\n")
    .filter((line) => {
      const l = line.toLowerCase();
      return l.includes(h) && l.includes(a);
    });
  return rows.join("\n") || "(no head-to-head rows found in schedule)";
}

// From the schedule markdown, find the most recent 5 PLAYED games for a team.
// A played game has a score like "3 - 2" in column 5. Sort by date desc.
function extractLastFiveRows(scheduleMd: string, teamName: string): string {
  const needle = teamName.toLowerCase();
  const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/;
  const scoreRe = /\|\s*(\d+)\s*-\s*(\d+)\s*\|/;
  const rows = scheduleMd
    .split("\n")
    .filter((l) => l.toLowerCase().includes(needle) && dateRe.test(l) && scoreRe.test(l))
    .map((l) => ({ line: l, date: (l.match(dateRe) as RegExpMatchArray)[1] }))
    // de-dupe rows with same date+line content
    .filter((v, i, arr) => arr.findIndex((x) => x.line === v.line) === i)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)
    .map((r) => r.line);
  return rows.join("\n") || "(no played games found for this team)";
}

function normalizeScheduleText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLastFiveGames(scheduleMd: string, teamName: string): Briefing["home"]["lastFive"] {
  return extractLastFiveRows(scheduleMd, teamName)
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => {
      const date = line.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? "";
      const cells = line.split("|").slice(1, -1).map(normalizeScheduleText);
      const gameCell = cells.find((cell) => cell.includes(" - ") && !/^\d+\s*-\s*\d+$/.test(cell)) ?? "";
      const scoreCell = cells.find((cell) => /^\d+\s*-\s*\d+$/.test(cell)) ?? "";
      const periodCell = cells.find((cell) => /^\([\d\s,\-]+\)$/.test(cell)) ?? "";
      const teams = gameCell.split(/\s+-\s+/);
      const score = scoreCell.match(/^(\d+)\s*-\s*(\d+)$/);
      if (teams.length !== 2 || !score) return null;

      const [homeTeam, awayTeam] = teams;
      const isHome = homeTeam.toLowerCase() === teamName.toLowerCase();
      const opponent = isHome ? awayTeam : homeTeam;
      const homeGoals = Number(score[1]);
      const awayGoals = Number(score[2]);
      const teamGoals = isHome ? homeGoals : awayGoals;
      const opponentGoals = isHome ? awayGoals : homeGoals;
      const wentBeyondRegulation = (periodCell.match(/\d+\s*-\s*\d+/g) ?? []).length > 3;
      const result: "W" | "T" | "L" | "OTW" | "OTL" =
        teamGoals === opponentGoals
          ? "T"
          : teamGoals > opponentGoals
            ? wentBeyondRegulation
              ? "OTW"
              : "W"
            : wentBeyondRegulation
              ? "OTL"
              : "L";

      return {
        date,
        opponent,
        score: `${teamGoals}-${opponentGoals}`,
        result,
        isHome,
      };
    })
    .filter((game): game is NonNullable<typeof game> => game !== null)
    .slice(0, 5);
}

function parseHeadToHead(
  scheduleMd: string,
  home: string,
  away: string,
): Briefing["headToHead"] {
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  const seen = new Set<string>();
  const out: Briefing["headToHead"] = [];

  for (const line of scheduleMd.split("\n")) {
    if (!line.startsWith("|")) continue;
    const date = line.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (!date) continue;

    const cells = line.split("|").slice(1, -1).map(normalizeScheduleText);
    const gameCell =
      cells.find((cell) => cell.includes(" - ") && !/^\d+\s*-\s*\d+$/.test(cell)) ?? "";
    const scoreCell = cells.find((cell) => /^\d+\s*-\s*\d+$/.test(cell)) ?? "";
    const teams = gameCell.split(/\s+-\s+/);
    if (teams.length !== 2) continue;

    const [homeTeam, awayTeam] = teams;
    const lh = homeTeam.toLowerCase();
    const la = awayTeam.toLowerCase();
    const isH2H = (lh.includes(h) && la.includes(a)) || (lh.includes(a) && la.includes(h));
    if (!isH2H) continue;

    const key = `${date}|${homeTeam}|${awayTeam}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const scoreMatch = scoreCell.match(/^(\d+)\s*-\s*(\d+)$/);
    const score = scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : "";

    out.push({ date, homeTeam, awayTeam, score, gameId: null });
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function enrichH2HWithGameIds(
  h2h: Briefing["headToHead"],
  season: Season,
): Promise<Briefing["headToHead"]> {
  if (h2h.length === 0) return h2h;
  const games = await getScheduleGames(season).catch(() => [] as ScheduleGame[]);
  return h2h.map((g) => {
    const lh = g.homeTeam.toLowerCase();
    const la = g.awayTeam.toLowerCase();
    const match = games.find(
      (s) =>
        s.date === g.date &&
        s.homeTeam.toLowerCase().includes(lh) &&
        s.awayTeam.toLowerCase().includes(la),
    );
    return { ...g, gameId: match?.id ?? null };
  });
}

function parseSpecialTeamsStats(
  specialTeamsMd: string,
  teamCode: string | undefined,
): { powerPlayPct: number | null; penaltyKillPct: number | null } {
  if (!teamCode) return { powerPlayPct: null, penaltyKillPct: null };
  let section: "pp" | "pk" | null = null;
  let powerPlayPct: number | null = null;
  let penaltyKillPct: number | null = null;

  for (const line of specialTeamsMd.split("\n")) {
    if (line.includes("Powerplay Efficiency")) section = "pp";
    if (line.includes("Penalty Killing")) section = "pk";
    if (!line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.replace(/\*\*/g, "").trim());
    if (cells[1]?.toUpperCase() !== teamCode.toUpperCase()) continue;

    const pct = Number(cells[5]?.replace(",", "."));
    if (!Number.isFinite(pct)) continue;
    if (section === "pp") powerPlayPct = pct;
    if (section === "pk") penaltyKillPct = pct;
  }

  return { powerPlayPct, penaltyKillPct };
}

// Fallback: fetch the PP/PK page as raw HTML and parse the rows by matching
// the `<span title="Full Team Name"><strong>CODE</strong></span>` cell. Used
// when the Firecrawl-rendered markdown loses the team code (or is stale) and
// our primary parser returns null for either stat.
async function fetchSpecialTeamsFromHtml(
  urls: Urls,
): Promise<
  Record<string, { powerPlayPct: number | null; penaltyKillPct: number | null }>
> {
  try {
    const res = await fetch(urls.specialTeams, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const result: Record<
      string,
      { powerPlayPct: number | null; penaltyKillPct: number | null }
    > = {};

    // Split into PP and PK halves on the section headers.
    const ppIdx = html.search(/Powerplay Efficiency/i);
    const pkIdx = html.search(/Penalty Killing/i);
    const sections: Array<{ key: "pp" | "pk"; html: string }> = [];
    if (ppIdx !== -1) {
      sections.push({
        key: "pp",
        html: html.slice(ppIdx, pkIdx === -1 ? undefined : pkIdx),
      });
    }
    if (pkIdx !== -1) sections.push({ key: "pk", html: html.slice(pkIdx) });

    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const titleRe = /<span\s+title="([^"]+)"[^>]*>\s*<strong>([^<]+)<\/strong>/i;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    for (const section of sections) {
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(section.html)) !== null) {
        const rowHtml = rowMatch[1];
        const titleMatch = rowHtml.match(titleRe);
        if (!titleMatch) continue;
        const teamName = titleMatch[1].trim();

        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        const cellIter = new RegExp(cellRe);
        while ((cellMatch = cellIter.exec(rowHtml)) !== null) {
          cells.push(
            cellMatch[1]
              .replace(/<[^>]+>/g, "")
              .replace(/&nbsp;|\u00a0/g, " ")
              .trim(),
          );
        }
        // Cells: [rank, code(span), GP, ADV/TimesShort, GF/GA, PCT, time, avg, ...]
        const pct = Number(cells[5]?.replace(",", "."));
        if (!Number.isFinite(pct)) continue;
        const entry = result[teamName] ?? {
          powerPlayPct: null,
          penaltyKillPct: null,
        };
        if (section.key === "pp") entry.powerPlayPct = pct;
        if (section.key === "pk") entry.penaltyKillPct = pct;
        result[teamName] = entry;
      }
    }
    return result;
  } catch (err) {
    console.warn("[specialTeams] HTML fallback failed:", (err as Error).message);
    return {};
  }
}

// Generic helper: extract <td> cell text contents (tags stripped) from a row.
function extractTdCells(rowHtml: string): string[] {
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowHtml)) !== null) {
    cells.push(
      m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return cells;
}

// Fallback: parse the standings page HTML to get position / GP / points per
// team. The page contains multiple historical standings tables; we keep only
// the FIRST occurrence per team name (current season is rendered first).
async function fetchStandingsFromHtml(
  urls: Urls,
): Promise<
  Record<string, { position: number | null; gamesPlayed: number | null; points: number | null }>
> {
  try {
    const res = await fetch(urls.standings, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const result: Record<
      string,
      { position: number | null; gamesPlayed: number | null; points: number | null }
    > = {};
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const cells = extractTdCells(rowMatch[1]);
      if (cells.length < 8) continue;
      const position = Number(cells[0]);
      const name = cells[1];
      const gamesPlayed = Number(cells[2]);
      const points = Number(cells[8]);
      if (!Number.isFinite(position) || !name || !Number.isFinite(gamesPlayed) || !Number.isFinite(points)) continue;
      if (name in result) continue; // keep first (current season) only
      result[name] = { position, gamesPlayed, points };
    }
    return result;
  } catch (err) {
    console.warn("[standings] HTML fallback failed:", (err as Error).message);
    return {};
  }
}

// Fallback: parse the PlayersByTeam page HTML to get the top 5 scorers per
// team. Each team's table is anchored by `<a id="Team Name"> </a>` followed
// by a player table where rows are already sorted by points.
async function fetchTopScorersFromHtml(
  urls: Urls,
): Promise<Record<string, Briefing["home"]["topScorers"]>> {
  try {
    const res = await fetch(urls.scoring, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const result: Record<string, Briefing["home"]["topScorers"]> = {};
    // Split on anchor tags; each chunk after the first belongs to a team.
    const anchorRe = /<a\s+id="([^"]+)">\s*<\/a>/g;
    const anchors: Array<{ name: string; index: number }> = [];
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(html)) !== null) {
      anchors.push({ name: am[1], index: am.index });
    }
    for (let i = 0; i < anchors.length; i++) {
      const start = anchors[i].index;
      const end = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
      const section = html.slice(start, end);
      // Only the scoring table (with name + G + A + TP columns); skip if no players.
      const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      const scorers: Briefing["home"]["topScorers"] = [];
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(section)) !== null) {
        const cells = extractTdCells(rowMatch[1]);
        // Player row: [rank, no, name, pos, GP, G, A, TP, PIM, ...]
        if (cells.length < 9) continue;
        const rank = Number(cells[0]);
        if (!Number.isFinite(rank)) continue;
        const name = cells[2];
        const gp = Number(cells[4]);
        const goals = Number(cells[5]);
        const assists = Number(cells[6]);
        const points = Number(cells[7]);
        if (!name || !Number.isFinite(points)) continue;
        scorers.push({
          name,
          goals: Number.isFinite(goals) ? goals : null,
          assists: Number.isFinite(assists) ? assists : null,
          points,
          gamesPlayed: Number.isFinite(gp) ? gp : null,
        });
        if (scorers.length >= 5) break;
      }
      if (scorers.length > 0) result[anchors[i].name] = scorers;
    }
    return result;
  } catch (err) {
    console.warn("[topScorers] HTML fallback failed:", (err as Error).message);
    return {};
  }
}

// Fallback: parse the PlayersByTeam page HTML to get goalies per team. Each
// team section contains a "Goalkeeping Statistics" subtable after the skater
// table. Columns: Rk, No, Name, GPT, GKD, GPI, MIP, GA, SVS, SOG, SVS%, GAA,
// SO, W, L (15 cells).
async function fetchGoaliesFromHtml(
  urls: Urls,
): Promise<Record<string, Briefing["home"]["goalies"]>> {
  try {
    const res = await fetch(urls.scoring, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const result: Record<string, Briefing["home"]["goalies"]> = {};
    const anchorRe = /<a\s+id="([^"]+)">\s*<\/a>/g;
    const anchors: Array<{ name: string; index: number }> = [];
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(html)) !== null) {
      anchors.push({ name: am[1], index: am.index });
    }
    for (let i = 0; i < anchors.length; i++) {
      const start = anchors[i].index;
      const end = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
      const section = html.slice(start, end);
      const gkIdx = section.search(/Goalkeeping Statistics/i);
      if (gkIdx === -1) continue;
      const gkSection = section.slice(gkIdx);
      const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      const goalies: Briefing["home"]["goalies"] = [];
      let rowMatch: RegExpExecArray | null;
      const parseNum = (raw: string): number | null => {
        if (!raw || raw === "N/A") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };
      while ((rowMatch = rowRe.exec(gkSection)) !== null) {
        const cells = extractTdCells(rowMatch[1]);
        if (cells.length < 15) continue;
        const name = cells[2];
        if (!name) continue;
        const gp = parseNum(cells[5]);
        if (gp == null || gp === 0) continue; // skip dressed-but-unused goalies
        goalies.push({
          name,
          gamesPlayed: gp,
          minutes: cells[6] || null,
          goalsAgainst: parseNum(cells[7]),
          saves: parseNum(cells[8]),
          shotsAgainst: parseNum(cells[9]),
          savePct: parseNum(cells[10]),
          gaa: parseNum(cells[11]),
          shutouts: parseNum(cells[12]),
          wins: parseNum(cells[13]),
          losses: parseNum(cells[14]),
        });
        if (goalies.length >= 5) break;
      }
      if (goalies.length > 0) {
        // Sort by games played desc so primary starter is first.
        goalies.sort((a, b) => (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0));
        result[anchors[i].name] = goalies;
      }
    }
    return result;
  } catch (err) {
    console.warn("[goalies] HTML fallback failed:", (err as Error).message);
    return {};
  }
}

// Parse season penalty-minutes (PIM) per team and most-penalized players from
// the same PlayersByTeam HTML used for top scorers / goalies. Each team
// section's skater table has cells: [rank, no, name, pos, GP, G, A, TP, PIM,...].
async function fetchDisciplineFromHtml(
  urls: Urls,
): Promise<Record<string, NonNullable<Briefing["home"]["discipline"]>>> {
  try {
    const res = await fetch(urls.scoring, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const result: Record<string, NonNullable<Briefing["home"]["discipline"]>> = {};
    const anchorRe = /<a\s+id="([^"]+)">\s*<\/a>/g;
    const anchors: Array<{ name: string; index: number }> = [];
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(html)) !== null) {
      anchors.push({ name: am[1], index: am.index });
    }
    for (let i = 0; i < anchors.length; i++) {
      const start = anchors[i].index;
      const end = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
      let section = html.slice(start, end);
      // Trim away the goalie subtable so we only sum skater PIM.
      const gkIdx = section.search(/Goalkeeping Statistics/i);
      if (gkIdx !== -1) section = section.slice(0, gkIdx);

      const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      let totalPim = 0;
      let maxGp = 0;
      const offenders: Array<{ name: string; pim: number; gamesPlayed: number | null }> = [];
      while ((rowMatch = rowRe.exec(section)) !== null) {
        const cells = extractTdCells(rowMatch[1]);
        if (cells.length < 9) continue;
        const rank = Number(cells[0]);
        if (!Number.isFinite(rank)) continue;
        const name = cells[2];
        const gp = Number(cells[4]);
        const pim = Number(cells[8]);
        if (!name || !Number.isFinite(pim)) continue;
        totalPim += pim;
        if (Number.isFinite(gp) && gp > maxGp) maxGp = gp;
        if (pim > 0) {
          offenders.push({
            name,
            pim,
            gamesPlayed: Number.isFinite(gp) ? gp : null,
          });
        }
      }
      offenders.sort((a, b) => b.pim - a.pim);
      result[anchors[i].name] = {
        totalPim,
        gamesPlayed: maxGp,
        perGame: maxGp > 0 ? totalPim / maxGp : 0,
        topOffenders: offenders.slice(0, 3),
      };
    }
    return result;
  } catch (err) {
    console.warn("[discipline] HTML parse failed:", (err as Error).message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// NOTE ON THIS SECTION (schedule-derived helpers):
//
// fetchLastFiveFromHtml, fetchVenueFormFromHtml, and fetchPeriodGoalsFromHtml
// used to each independently `fetch(urls.schedule)` and re-parse the raw HTML
// from scratch. That meant a single buildBriefing() call could fetch the same
// schedule page 3-4 times (once via Firecrawl markdown, then again here,
// again in venue form, again in period goals, again in the fallback pass).
//
// They've been replaced with pure, synchronous `compute*` functions that
// operate on the already-fetched, memoized `ScheduleGame[]` from
// getScheduleGames(season) (see "Historical depth helpers" below). The
// schedule HTML is now fetched at most once per season per process (cached
// in `scheduleCache`), and every consumer — buildBriefing, the fallback
// pass, and the historical endpoints — shares that single fetch.
//
// The HTTP-fetching versions are kept below, commented out, for reference /
// rollback only. They are no longer called anywhere.
// ---------------------------------------------------------------------------

// Computes the most recent 5 played games per team, derived from already-
// fetched schedule games (see getScheduleGames). No network call.
function computeLastFive(
  games: ScheduleGame[],
  teamNames: string[],
): Record<string, Briefing["home"]["lastFive"]> {
  const result: Record<string, Briefing["home"]["lastFive"]> = {};
  for (const teamName of teamNames) {
    const teamGames = games
      .filter((g) => g.played && (g.homeTeam === teamName || g.awayTeam === teamName))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5)
      .map((g) => {
        const isHome = g.homeTeam === teamName;
        const opponent = isHome ? g.awayTeam : g.homeTeam;
        const teamGoals = (isHome ? g.homeGoals : g.awayGoals) ?? 0;
        const opponentGoals = (isHome ? g.awayGoals : g.homeGoals) ?? 0;
        const wentBeyond = g.periodCount > 3;
        const result: "W" | "T" | "L" | "OTW" | "OTL" =
          teamGoals === opponentGoals
            ? "T"
            : teamGoals > opponentGoals
              ? wentBeyond
                ? "OTW"
                : "W"
              : wentBeyond
                ? "OTL"
                : "L";
        return {
          date: g.date,
          opponent,
          score: `${teamGoals}-${opponentGoals}`,
          result,
          isHome,
        };
      });
    if (teamGames.length > 0) result[teamName] = teamGames;
  }
  return result;
}

// Fetch the team's last N played games (per-team), scrape each game's
// /Game/Events/<id> page, and tally goals + assists for that team's players.
// Returns the top scorer per team over those games.
type HotPlayer = NonNullable<Briefing["home"]["hotPlayer"]>;
async function fetchHotPlayersFromGameLogs(
  urls: Urls,
  teamLookups: Array<{ name: string; code: string | undefined }>,
  recentGames = 5,
): Promise<Record<string, HotPlayer>> {
  try {
    const schedRes = await fetch(urls.schedule, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const schedHtml = await schedRes.text();

    // Parse schedule rows for played games with a /Game/Events/<id> link.
    type Game = { id: string; date: string; homeTeam: string; awayTeam: string };
    const allGames: Game[] = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(schedHtml)) !== null) {
      const raw = rm[1];
      const gidMatch = raw.match(/\/Game\/Events\/(\d+)/);
      if (!gidMatch) continue;
      const text = raw
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "|")
        .replace(/&nbsp;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
      const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const cells = text.split("|").map((s) => s.trim()).filter(Boolean);
      const matchupRe = /^(.+?)\s+-\s+(.+?)$/;
      const scoreRe = /^\d+\s*-\s*\d+$/;
      const matchupCell = cells.find(
        (c) => matchupRe.test(c) && !scoreRe.test(c) && !/\d{4}-\d{2}-\d{2}/.test(c),
      );
      const hasScore = cells.some((c) => scoreRe.test(c));
      if (!dateMatch || !matchupCell || !hasScore) continue;
      const teams = matchupCell.match(matchupRe);
      if (!teams) continue;
      allGames.push({
        id: gidMatch[1],
        date: dateMatch[1],
        homeTeam: teams[1].trim(),
        awayTeam: teams[2].trim(),
      });
    }

    // Per-team recent game ids (most recent first).
    const perTeam = new Map<string, { code: string; games: Game[] }>();
    for (const { name, code } of teamLookups) {
      if (!code) continue;
      const games = allGames
        .filter((g) => g.homeTeam === name || g.awayTeam === name)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, recentGames);
      if (games.length > 0) perTeam.set(name, { code, games });
    }

    // Dedupe + fetch all needed game pages.
    const gameIds = new Set<string>();
    for (const { games } of perTeam.values()) for (const g of games) gameIds.add(g.id);
    const fetchedPages = new Map<string, string>();
    await Promise.all(
      Array.from(gameIds).map(async (id) => {
        try {
          const r = await fetch(`https://stats.swehockey.se/Game/Events/${id}`, {
            headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
          });
          fetchedPages.set(id, await r.text());
        } catch {
          // ignore individual page failures
        }
      }),
    );

    // Parse goal rows out of one event page; return [{teamCode, scorer, assists[]}]
    type GoalEntry = { teamCode: string; scorer: string; assists: string[] };
    const parseGoals = (html: string): GoalEntry[] => {
      const goals: GoalEntry[] = [];
      const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr: RegExpExecArray | null;
      // Player name extraction: "10. Berndtsson, Hampus" -> "Berndtsson, Hampus"
      const namePartRe = /\d+\.\s*([^<(]+?)(?=\s*<|\s*\(|$)/;
      const cleanName = (s: string) =>
        s.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
      while ((tr = trRe.exec(html)) !== null) {
        const row = tr[1];
        if (!/Total goals scored/i.test(row)) continue;
        const cells = row.split(/<\/td>/i);
        if (cells.length < 4) continue;
        // 3rd td = team code; 4th td = scorer + assists spans.
        const teamCodeMatch = cells[2].replace(/<[^>]+>/g, "").trim();
        if (!/^[A-ZÅÄÖ]{2,4}$/.test(teamCodeMatch)) continue;
        const scorerCell = cells[3];
        // Scorer is the first "N. Name" before the tooltip span.
        const beforeSpan = scorerCell.split(/<span/i)[0];
        const scorerM = beforeSpan.match(namePartRe);
        if (!scorerM) continue;
        const scorer = cleanName(scorerM[1]);
        // Assists live in <span><div title="Assists in tournament: N">N. Name</div></span>
        const assists: string[] = [];
        const assistRe = /Assists in tournament[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let am: RegExpExecArray | null;
        while ((am = assistRe.exec(scorerCell)) !== null) {
          const inner = am[1].replace(/<[^>]+>/g, "");
          const nm = inner.match(namePartRe);
          if (nm) assists.push(cleanName(nm[1]));
        }
        goals.push({ teamCode: teamCodeMatch, scorer, assists });
      }
      return goals;
    };

    const result: Record<string, HotPlayer> = {};
    for (const [teamName, { code, games }] of perTeam.entries()) {
      const tally = new Map<string, { goals: number; assists: number }>();
      for (const g of games) {
        const html = fetchedPages.get(g.id);
        if (!html) continue;
        const goals = parseGoals(html);
        for (const gl of goals) {
          if (gl.teamCode !== code) continue;
          const sc = tally.get(gl.scorer) ?? { goals: 0, assists: 0 };
          sc.goals += 1;
          tally.set(gl.scorer, sc);
          for (const a of gl.assists) {
            const ac = tally.get(a) ?? { goals: 0, assists: 0 };
            ac.assists += 1;
            tally.set(a, ac);
          }
        }
      }
      let top: { name: string; goals: number; assists: number; points: number } | null = null;
      for (const [name, t] of tally.entries()) {
        const points = t.goals + t.assists;
        if (
          !top ||
          points > top.points ||
          (points === top.points && t.goals > top.goals)
        ) {
          top = { name, goals: t.goals, assists: t.assists, points };
        }
      }
      if (top && top.points > 0) {
        result[teamName] = {
          name: top.name,
          points: top.points,
          goals: top.goals,
          assists: top.assists,
          games: games.length,
        };
      }
    }
    return result;
  } catch (err) {
    console.warn("[hotPlayer] failed:", (err as Error).message);
    return {};
  }
}

type VenueForm = NonNullable<Briefing["home"]["venueForm"]>;
type ResultLetter = VenueForm["home"]["results"][number];

function computeStreak(results: ResultLetter[]): VenueForm["home"]["streak"] {
  if (results.length === 0) return null;
  const bucket = (r: ResultLetter): "W" | "T" | "L" =>
    r === "W" || r === "OTW" ? "W" : r === "T" ? "T" : "L";
  const type = bucket(results[0]);
  let count = 0;
  for (const r of results) {
    if (bucket(r) === type) count += 1;
    else break;
  }
  return { type, count };
}

// Computes home/away venue-split form (results + streak) for each requested
// team, derived from already-fetched schedule games. No network call.
function computeVenueForm(
  games: ScheduleGame[],
  teamNames: string[],
): Record<string, VenueForm> {
  const out: Record<string, VenueForm> = {};
  for (const teamName of teamNames) {
    const home: ResultLetter[] = [];
    const away: ResultLetter[] = [];
    const teamGames = games
      .filter((g) => g.played && (g.homeTeam === teamName || g.awayTeam === teamName))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const g of teamGames) {
      const isHome = g.homeTeam === teamName;
      const teamGoals = (isHome ? g.homeGoals : g.awayGoals) ?? 0;
      const oppGoals = (isHome ? g.awayGoals : g.homeGoals) ?? 0;
      const wentBeyond = g.periodCount > 3;
      const r: ResultLetter =
        teamGoals === oppGoals
          ? "T"
          : teamGoals > oppGoals
            ? wentBeyond
              ? "OTW"
              : "W"
            : wentBeyond
              ? "OTL"
              : "L";
      (isHome ? home : away).push(r);
    }
    out[teamName] = {
      home: { results: home, streak: computeStreak(home) },
      away: { results: away, streak: computeStreak(away) },
    };
  }
  return out;
}

type PeriodGoals = NonNullable<Briefing["home"]["periodGoals"]>;

// Sums goals scored by each team per period across all played games this
// season, derived from already-fetched schedule games (which now carry the
// per-period [home, away] pairs — see ScheduleGame.periods). No network call.
// Values beyond the third period pair are aggregated into OT, matching the
// previous HTML-fetching implementation's behavior.
function computePeriodGoals(
  games: ScheduleGame[],
  teamNames: string[],
): Record<string, PeriodGoals> {
  const out: Record<string, PeriodGoals> = {};
  for (const teamName of teamNames) {
    const totals: PeriodGoals = { p1: 0, p2: 0, p3: 0, ot: 0, total: 0, games: 0 };
    for (const g of games) {
      if (!g.played) continue;
      const isHome = g.homeTeam === teamName;
      const isAway = g.awayTeam === teamName;
      if (!isHome && !isAway) continue;
      totals.games += 1;
      g.periods.forEach((pair, idx) => {
        const goals = isHome ? pair[0] : pair[1];
        if (idx === 0) totals.p1 += goals;
        else if (idx === 1) totals.p2 += goals;
        else if (idx === 2) totals.p3 += goals;
        else totals.ot += goals;
        totals.total += goals;
      });
    }
    out[teamName] = totals;
  }
  return out;
}

// Parses the roster page HTML-style markdown to extract a map of full team
// name -> short team code (e.g. "Grästorps IK" -> "GRÄ", "Borås HC" -> "BRS").
// The roster page contains anchor links like [Team Name](#CODE) at the top.
async function fetchTeamCodeMap(urls: Urls): Promise<Record<string, string>> {
  // Use a raw HTML fetch (not firecrawl markdown) because the anchor codes
  // live in href attributes that Firecrawl strips when converting to markdown.
  try {
    const res = await fetch(urls.roster, { headers: { "user-agent": "Mozilla/5.0" } });
    const html = await res.text();
    const map: Record<string, string> = {};
    const re = /href="#([^"\s]+)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const code = m[1].trim();
      const name = m[2].trim();
      if (code.length <= 6 && name.length > 2 && !(name in map)) {
        map[name] = code;
      }
    }
    return map;
  } catch {
    return {};
  }
}


export async function parseTeamsFromStandings(
  _md: string,
  season: Season = DEFAULT_SEASON,
): Promise<string[]> {
  // Parse standings HTML directly — no AI needed. The standings page renders
  // the current season's table first; fetchStandingsFromHtml keeps only the
  // first occurrence of each team name, sorted by appearance (i.e. position).
  const urls = buildUrls(season.competitionId);
  const byName = await fetchStandingsFromHtml(urls);
  const teams = Object.entries(byName)
    .sort((a, b) => (a[1].position ?? 99) - (b[1].position ?? 99))
    .map(([name]) => name);
  if (teams.length === 0) {
    throw new Error("Could not parse any teams from standings page");
  }
  return teams;
}

function buildTeamContextMd(
  urls: Urls,
  teamName: string,
  teamCode: string | undefined,
  rosterMd: string,
  scoringMd: string,
  teamStatsMd: string,
  specialTeamsMd: string,
  lastFiveMd: string,
): string {
  const needles = [teamName, teamCode ?? ""].filter(Boolean);
  return `Team: ${teamName}${teamCode ? ` (code: ${teamCode})` : ""}\n\nSource: ${urls.roster}\n\n=== SENIOR TEAM ROSTER ===\n${extractTeamSection(rosterMd, teamName)}\n\nSource: ${urls.scoring}\n\n=== PLAYERS-BY-TEAM (full stats incl. G/A/TP, sorted by points) ===\n${extractTeamSection(scoringMd, teamName)}\n\nSource: ${urls.teamStats}\n\n=== TEAM SCORING / GOALKEEPING ===\n${extractRowsForTeam(teamStatsMd, needles)}\n\nSource: ${urls.specialTeams}\n\n=== POWERPLAY / PENALTY KILLING ===\n${extractRowsForTeam(specialTeamsMd, needles)}\n\n=== LAST 5 PLAYED GAMES (most recent first; already filtered & sorted) ===\n${lastFiveMd}`;
}

export async function buildBriefing(
  home: string,
  away: string,
  season: Season = DEFAULT_SEASON,
): Promise<Briefing> {
  const urls = buildUrls(season.competitionId);

  // Fetch the schedule ONCE as structured games (memoized per season via
  // getScheduleGames/scheduleCache), alongside the still-Firecrawl-sourced
  // pages and the team code map. Previously, venue form, period goals, and
  // (in the fallback pass) last-five each independently re-fetched and
  // re-parsed urls.schedule as raw HTML — up to 3-4 schedule fetches per
  // buildBriefing call. They now all read from this single `scheduleGames`.
  const [scheduleGames, scheduleMd, specialTeamsMd, codeMap] = await Promise.all([
    getScheduleGames(season),
    scrapeMd(urls.schedule),
    scrapeMd(urls.specialTeams),
    fetchTeamCodeMap(urls),
  ]);

  const homeCode = codeMap[home];
  const awayCode = codeMap[away];
  console.log(`[briefing] ${home} -> ${homeCode}, ${away} -> ${awayCode}`);

  const parsedHomeLast5 = parseLastFiveGames(scheduleMd, home);
  const parsedAwayLast5 = parseLastFiveGames(scheduleMd, away);
  const homeSpecialTeams = parseSpecialTeamsStats(specialTeamsMd, homeCode);
  const awaySpecialTeams = parseSpecialTeamsStats(specialTeamsMd, awayCode);
  const emptyTeam = (name: string): Briefing["home"] => ({
    name,
    position: null,
    points: null,
    gamesPlayed: null,
    lastFive: [],
    topScorers: [],
    powerPlayPct: null,
    penaltyKillPct: null,
    venueForm: null,
    periodGoals: null,
    goalies: [],
    hotPlayer: null,
    discipline: null,
  });
  const object: Briefing = {
    league: "HockeyEttan Södra",
    home: emptyTeam(home),
    away: emptyTeam(away),
    headToHead: await enrichH2HWithGameIds(parseHeadToHead(scheduleMd, home, away), season),
    notes: "",
  };

  object.home.lastFive = parsedHomeLast5;
  object.away.lastFive = parsedAwayLast5;
  object.home.powerPlayPct = homeSpecialTeams.powerPlayPct;
  object.home.penaltyKillPct = homeSpecialTeams.penaltyKillPct;
  object.away.powerPlayPct = awaySpecialTeams.powerPlayPct;
  object.away.penaltyKillPct = awaySpecialTeams.penaltyKillPct;

  // Always derive venue-split form from the schedule games (not AI) so
  // hallucinations can't pollute streak data. Fall back to an empty split if
  // the team has no games yet so the field is always well-formed, never
  // undefined/null.
  const emptyVenueForm = (): VenueForm => ({
    home: { results: [], streak: null },
    away: { results: [], streak: null },
  });
  const venueByName = computeVenueForm(scheduleGames, [home, away]);
  object.home.venueForm = venueByName[home] ?? emptyVenueForm();
  object.away.venueForm = venueByName[away] ?? emptyVenueForm();

  // Aggregate season goals scored per period from the schedule games.
  const periodGoalsByName = computePeriodGoals(scheduleGames, [home, away]);
  object.home.periodGoals = periodGoalsByName[home] ?? null;
  object.away.periodGoals = periodGoalsByName[away] ?? null;

  // Goalies are never AI-extracted; always parse from PlayersByTeam HTML.
  // Discipline (PIM totals + top offenders) parses the same scoring page.
  const [goaliesByName, disciplineByName] = await Promise.all([
    fetchGoaliesFromHtml(urls),
    fetchDisciplineFromHtml(urls),
  ]);
  object.home.goalies = goaliesByName[home] ?? [];
  object.away.goalies = goaliesByName[away] ?? [];
  object.home.discipline = disciplineByName[home] ?? null;
  object.away.discipline = disciplineByName[away] ?? null;

  // Hot players: aggregate goals + assists from each team's last 5 played
  // game event pages. Uses the team's 3-letter code from the standings.
  const hotPlayerStarted = Date.now();
  const hotByName = await fetchHotPlayersFromGameLogs(urls, [
    { name: home, code: homeCode },
    { name: away, code: awayCode },
  ]);
  object.home.hotPlayer = hotByName[home] ?? null;
  object.away.hotPlayer = hotByName[away] ?? null;
  console.log(
    `[hotPlayer] done in ${Date.now() - hotPlayerStarted}ms — home=${object.home.hotPlayer?.name ?? "none"} away=${object.away.hotPlayer?.name ?? "none"}`,
  );

  // Fallback: if either team is missing PP/PK, position, points, gamesPlayed,
  // top scorers, or last-five, re-fetch the source pages directly as HTML
  // and fill the gaps. The HTML embeds the full team name in places where
  // the Firecrawl-rendered markdown sometimes drops it, so this is more
  // robust when the AI extraction or the markdown is incomplete.
  //
  // last-five's fallback now reads from the same `scheduleGames` used above
  // (via computeLastFive) instead of re-fetching urls.schedule again.
  const ppPkMissing =
    object.home.powerPlayPct == null ||
    object.home.penaltyKillPct == null ||
    object.away.powerPlayPct == null ||
    object.away.penaltyKillPct == null;
  const standingsMissing = (team: Briefing["home"]) =>
    team.position == null || team.points == null || team.gamesPlayed == null;
  const standingsNeeded = standingsMissing(object.home) || standingsMissing(object.away);
  const topScorersNeeded =
    object.home.topScorers.length === 0 || object.away.topScorers.length === 0;
  const lastFiveNeeded =
    object.home.lastFive.length === 0 || object.away.lastFive.length === 0;

  // Snapshot which fields were missing BEFORE the fallback runs, so we can
  // diff against the post-fallback state and report what each source filled.
  type FieldKey =
    | "position"
    | "points"
    | "gamesPlayed"
    | "powerPlayPct"
    | "penaltyKillPct"
    | "topScorers"
    | "lastFive";
  const missingBefore = (team: Briefing["home"]): Set<FieldKey> => {
    const set = new Set<FieldKey>();
    if (team.position == null) set.add("position");
    if (team.points == null) set.add("points");
    if (team.gamesPlayed == null) set.add("gamesPlayed");
    if (team.powerPlayPct == null) set.add("powerPlayPct");
    if (team.penaltyKillPct == null) set.add("penaltyKillPct");
    if (team.topScorers.length === 0) set.add("topScorers");
    if (team.lastFive.length === 0) set.add("lastFive");
    return set;
  };
  const homeMissing = missingBefore(object.home);
  const awayMissing = missingBefore(object.away);
  console.log(
    `[fallback] needed: pp/pk=${ppPkMissing} standings=${standingsNeeded} topScorers=${topScorersNeeded} lastFive=${lastFiveNeeded}`,
  );
  console.log(
    `[fallback] missing before — ${home}: [${[...homeMissing].join(", ") || "none"}]; ${away}: [${[...awayMissing].join(", ") || "none"}]`,
  );

  const fetchStarted = Date.now();
  const [ppByName, standingsByName, scorersByName, lastFiveByName] = await Promise.all([
    ppPkMissing ? fetchSpecialTeamsFromHtml(urls) : Promise.resolve({} as Record<string, { powerPlayPct: number | null; penaltyKillPct: number | null }>),
    standingsNeeded ? fetchStandingsFromHtml(urls) : Promise.resolve({} as Record<string, { position: number | null; gamesPlayed: number | null; points: number | null }>),
    topScorersNeeded ? fetchTopScorersFromHtml(urls) : Promise.resolve({} as Record<string, Briefing["home"]["topScorers"]>),
    lastFiveNeeded ? Promise.resolve(computeLastFive(scheduleGames, [home, away])) : Promise.resolve({} as Record<string, Briefing["home"]["lastFive"]>),
  ]);
  const fetchMs = Date.now() - fetchStarted;
  console.log(
    `[fallback] HTML fetches done in ${fetchMs}ms — sources: pp/pk=${Object.keys(ppByName).length} standings=${Object.keys(standingsByName).length} topScorers=${Object.keys(scorersByName).length} lastFive=${Object.keys(lastFiveByName).length}`,
  );

  // Per-team metrics: which fields the fallback actually filled, which it
  // tried-but-failed (still null after fallback), and which were already OK.
  type FilledEntry = { field: FieldKey; source: string };
  const metrics: Record<
    string,
    { filled: FilledEntry[]; failed: FieldKey[]; sourceMatched: Record<string, boolean> }
  > = {};

  const apply = (team: Briefing["home"], name: string, wasMissing: Set<FieldKey>) => {
    const filled: FilledEntry[] = [];
    const sourceMatched = {
      ppPk: name in ppByName,
      standings: name in standingsByName,
      topScorers: name in scorersByName,
      lastFive: name in lastFiveByName,
    };

    const pp = ppByName[name];
    if (pp) {
      if (team.powerPlayPct == null && pp.powerPlayPct != null) {
        team.powerPlayPct = pp.powerPlayPct;
        filled.push({ field: "powerPlayPct", source: "ppPk" });
      }
      if (team.penaltyKillPct == null && pp.penaltyKillPct != null) {
        team.penaltyKillPct = pp.penaltyKillPct;
        filled.push({ field: "penaltyKillPct", source: "ppPk" });
      }
    }
    const st = standingsByName[name];
    if (st) {
      if (team.position == null && st.position != null) {
        team.position = st.position;
        filled.push({ field: "position", source: "standings" });
      }
      if (team.points == null && st.points != null) {
        team.points = st.points;
        filled.push({ field: "points", source: "standings" });
      }
      if (team.gamesPlayed == null && st.gamesPlayed != null) {
        team.gamesPlayed = st.gamesPlayed;
        filled.push({ field: "gamesPlayed", source: "standings" });
      }
    }
    const sc = scorersByName[name];
    if (sc && team.topScorers.length === 0) {
      team.topScorers = sc;
      filled.push({ field: "topScorers", source: "topScorers" });
    }
    const lf = lastFiveByName[name];
    if (lf && team.lastFive.length === 0) {
      team.lastFive = lf;
      filled.push({ field: "lastFive", source: "lastFive" });
    }

    // Anything still missing that the fallback was supposed to cover.
    const stillMissing = missingBefore(team);
    const failed = [...wasMissing].filter((f) => stillMissing.has(f));

    metrics[name] = { filled, failed, sourceMatched };
    if (filled.length > 0) {
      console.log(`[fallback] FILLED ${name}: ${filled.map((f) => f.field).join(", ")}`);
    }
    if (failed.length > 0) {
      console.warn(
        `[fallback] STILL MISSING ${name}: ${failed.join(", ")} (sources matched: ${JSON.stringify(sourceMatched)})`,
      );
    }
  };
  apply(object.home, home, homeMissing);
  apply(object.away, away, awayMissing);

  const filledHome = metrics[home].filled.map((f) => f.field);
  const filledAway = metrics[away].filled.map((f) => f.field);
  const totalFilled = filledHome.length + filledAway.length;
  const totalFailed = metrics[home].failed.length + metrics[away].failed.length;
  console.log(
    `[fallback-metrics] ${JSON.stringify({
      matchup: `${home} vs ${away}`,
      fetchMs,
      sourcesAttempted: {
        ppPk: ppPkMissing,
        standings: standingsNeeded,
        topScorers: topScorersNeeded,
        lastFive: lastFiveNeeded,
      },
      missingBefore: { home: [...homeMissing], away: [...awayMissing] },
      filled: { home: filledHome, away: filledAway },
      failed: { home: metrics[home].failed, away: metrics[away].failed },
      totals: { filled: totalFilled, failed: totalFailed },
    })}`,
  );

  // Persist per-field events to the database for quality trend queries.
  const matchupLabel = `${home} vs ${away}`;
  const events: Array<{
    matchup: string;
    home_team: string;
    away_team: string;
    field_name: string;
    team_side: string;
    status: string;
    source: string | null;
  }> = [];
  for (const [side, teamName] of [["home", home], ["away", away]] as const) {
    for (const entry of metrics[teamName].filled) {
      events.push({
        matchup: matchupLabel,
        home_team: home,
        away_team: away,
        field_name: entry.field,
        team_side: side,
        status: "filled",
        source: entry.source,
      });
    }
    for (const field of metrics[teamName].failed) {
      events.push({
        matchup: matchupLabel,
        home_team: home,
        away_team: away,
        field_name: field,
        team_side: side,
        status: "failed",
        source: null,
      });
    }
  }
  if (events.length > 0) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("fallback_events").insert(events);
      if (error) {
        console.warn(`[fallback] failed to persist events: ${error.message}`);
      } else {
        console.log(`[fallback] persisted ${events.length} event(s) to fallback_events`);
      }
    } catch (e) {
      console.warn(`[fallback] persist error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return object;
}

export type { Briefing };
export { z };

// Find a scheduled game on a specific date (YYYY-MM-DD) from the schedule HTML.
// Returns the first matching row; both played and unplayed games are considered.
export async function findMatchupOnDate(
  season: Season,
  dateISO: string,
): Promise<{ date: string; home: string; away: string } | null> {
  try {
    const urls = buildUrls(season.competitionId);
    const res = await fetch(urls.schedule, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/;
    const matchupRe = /^(.+?)\s+-\s+(.+?)$/;
    const scoreRe = /^\d+\s*-\s*\d+$/;
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let currentDate = "";
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const rowText = rowMatch[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "|")
        .replace(/&nbsp;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
      const dm = rowText.match(dateRe);
      if (dm) currentDate = dm[1];
      if (currentDate !== dateISO) continue;
      const cells = rowText.split("|").map((s) => s.trim()).filter(Boolean);
      const matchupCell = cells.find(
        (c) => matchupRe.test(c) && !scoreRe.test(c) && !dateRe.test(c),
      );
      if (!matchupCell) continue;
      const teams = matchupCell.match(matchupRe);
      if (!teams) continue;
      return {
        date: currentDate,
        home: teams[1].trim(),
        away: teams[2].trim(),
      };
    }
    return null;
  } catch (err) {
    console.warn("[todaysMatchup] failed:", (err as Error).message);
    return null;
  }
}

// ---------- Historical depth helpers ----------

type ScheduleGame = {
  id: string | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  periodCount: number;
  // Per-period [home, away] goal pairs, in order (P1, P2, P3, then any OT
  // periods appended). Populated once here so every consumer — venue form,
  // period-goals totals, last-five, etc. — can derive what it needs without
  // re-fetching or re-parsing the schedule page itself.
  periods: Array<[number, number]>;
  played: boolean;
};

// Parse every row from a season's schedule page into structured game records.
// Includes both played and unplayed games; played games carry a numeric score
// and a /Game/Events/<id> link.
async function fetchAllScheduleGames(urls: Urls): Promise<ScheduleGame[]> {
  const res = await fetch(urls.schedule, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  const html = await res.text();
  const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/;
  const matchupRe = /^(.+?)\s+-\s+(.+?)$/;
  const scoreRe = /^(\d+)\s*-\s*(\d+)$/;
  const periodsRe = /\(([\d\s,\-]+)\)/;
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const games: ScheduleGame[] = [];
  let currentDate = "";
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const raw = rm[1];
    const gidMatch = raw.match(/\/Game\/Events\/(\d+)/);
    const rowText = raw
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "|")
      .replace(/&nbsp;|\u00a0/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
    const dm = rowText.match(dateRe);
    if (dm) currentDate = dm[1];
    if (!currentDate) continue;
    const cells = rowText.split("|").map((s) => s.trim()).filter(Boolean);
    const matchupCell = cells.find(
      (c) => matchupRe.test(c) && !scoreRe.test(c) && !dateRe.test(c),
    );
    if (!matchupCell) continue;
    const teams = matchupCell.match(matchupRe);
    if (!teams) continue;
    const scoreCell = cells.find((c) => scoreRe.test(c));
    const score = scoreCell?.match(scoreRe) ?? null;
    const periodsCell = cells.find((c) => periodsRe.test(c)) ?? "";
    const pairs = periodsCell.match(/\d+\s*-\s*\d+/g) ?? [];
    const periodCount = pairs.length;
    const periods: Array<[number, number]> = pairs.map((p) => {
      const m = p.match(/(\d+)\s*-\s*(\d+)/)!;
      return [Number(m[1]), Number(m[2])];
    });
    games.push({
      id: gidMatch?.[1] ?? null,
      date: currentDate,
      homeTeam: teams[1].trim(),
      awayTeam: teams[2].trim(),
      homeGoals: score ? Number(score[1]) : null,
      awayGoals: score ? Number(score[2]) : null,
      periodCount,
      periods,
      played: !!score,
    });
  }
  return games;
}

// Per-process memoization of schedule scrapes so the three Historical cards
// (and now buildBriefing's venue form / period goals / last-five-fallback)
// share work within a request. Keyed by competitionId.
const scheduleCache = new Map<string, Promise<ScheduleGame[]>>();
function getScheduleGames(season: Season): Promise<ScheduleGame[]> {
  const key = season.competitionId;
  const existing = scheduleCache.get(key);
  if (existing) return existing;
  const p = fetchAllScheduleGames(buildUrls(key)).catch((err) => {
    scheduleCache.delete(key); // allow retry on next call
    throw err;
  });
  scheduleCache.set(key, p);
  return p;
}

export type AllTimeH2H = {
  totals: { wins: number; ties: number; losses: number; otWins: number; otLosses: number };
  atHome: { wins: number; ties: number; losses: number };
  atAway: { wins: number; ties: number; losses: number };
  meetings: number;
  seasonsCovered: { count: number; from: string | null; to: string | null };
};

export async function computeAllTimeHeadToHead(
  home: string,
  away: string,
): Promise<AllTimeH2H> {
  const { getMergedSeasons } = await import("./seasons.server");
  const seasons = await getMergedSeasons();
  let wins = 0,
    ties = 0,
    losses = 0,
    otWins = 0,
    otLosses = 0,
    meetings = 0;
  const atHome = { wins: 0, ties: 0, losses: 0 };
  const atAway = { wins: 0, ties: 0, losses: 0 };
  const seasonLabels = new Set<string>();

  await Promise.all(
    seasons.map(async (s) => {
      try {
        const games = await getScheduleGames(s);
        const matchups = games.filter(
          (g) =>
            g.played &&
            ((g.homeTeam === home && g.awayTeam === away) ||
              (g.homeTeam === away && g.awayTeam === home)),
        );
        if (matchups.length > 0) seasonLabels.add(s.label);
        for (const g of matchups) {
          meetings += 1;
          const isHome = g.homeTeam === home;
          const teamGoals = isHome ? g.homeGoals! : g.awayGoals!;
          const oppGoals = isHome ? g.awayGoals! : g.homeGoals!;
          const wentBeyond = g.periodCount > 3;
          const bucket = isHome ? atHome : atAway;
          if (teamGoals === oppGoals) {
            ties += 1;
            bucket.ties += 1;
          } else if (teamGoals > oppGoals) {
            if (wentBeyond) otWins += 1;
            else wins += 1;
            bucket.wins += 1;
          } else {
            if (wentBeyond) otLosses += 1;
            else losses += 1;
            bucket.losses += 1;
          }
        }
      } catch (err) {
        console.warn(`[allTimeH2H] season ${s.label} failed:`, (err as Error).message);
      }
    }),
  );

  const sorted = [...seasonLabels].sort();
  return {
    totals: { wins, ties, losses, otWins, otLosses },
    atHome,
    atAway,
    meetings,
    seasonsCovered: {
      count: sorted.length,
      from: sorted[0] ?? null,
      to: sorted[sorted.length - 1] ?? null,
    },
  };
}

export type LastMeetingRecap = {
  date: string;
  seasonLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  gameUrl: string;
  goals: Array<{
    teamCode: string;
    scorer: string;
    assists: string[];
    period: string | null;
    time: string | null;
  }>;
  wentToOvertime: boolean;
  wentToShootout: boolean;
  homeShots: number | null;
  awayShots: number | null;
  homePim: number | null;
  awayPim: number | null;
};

export async function fetchLastMeetingRecap(
  home: string,
  away: string,
): Promise<LastMeetingRecap | null> {
  const { getMergedSeasons } = await import("./seasons.server");
  const seasons = await getMergedSeasons(); // newest first
  let meeting: { seasonLabel: string; g: ScheduleGame } | null = null;
  for (const s of seasons) {
    try {
      const games = await getScheduleGames(s);
      const candidates = games
        .filter(
          (g) =>
            g.played &&
            g.id &&
            ((g.homeTeam === home && g.awayTeam === away) ||
              (g.homeTeam === away && g.awayTeam === home)),
        )
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      if (candidates.length > 0) {
        meeting = { seasonLabel: s.label, g: candidates[0] };
        break;
      }
    } catch (err) {
      console.warn(`[lastMeeting] season ${s.label} failed:`, (err as Error).message);
    }
  }
  if (!meeting) return null;
  const gameId = meeting.g.id!;
  const gameUrl = `${STATS_BASE_URL}/Game/Events/${gameId}`;
  // Single typed construction site for the recap. Every field on
  // LastMeetingRecap must be supplied here, so adding a new required field
  // to the type fails the build at exactly one place — the parser below
  // mutates `result` in place and never re-creates the object.
  const result: LastMeetingRecap = {
    date: meeting.g.date,
    seasonLabel: meeting.seasonLabel,
    homeTeam: meeting.g.homeTeam,
    awayTeam: meeting.g.awayTeam,
    homeGoals: meeting.g.homeGoals!,
    awayGoals: meeting.g.awayGoals!,
    gameUrl,
    goals: [],
    wentToOvertime: false,
    wentToShootout: false,
  };
  try {
    const res = await fetch(gameUrl, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const namePartRe = /\d+\.\s*([^<(]+?)(?=\s*<|\s*\(|$)/;
    const cleanName = (s: string) =>
      s.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
    const stripTags = (s: string) =>
      s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    // The event table has no per-row period column; periods are separated by
    // <h3>1st period</h3> / 2nd / 3rd / Overtime / Shootout headers. Track the
    // current period as we walk the rows in document order.
    const headerToPeriod = (s: string): string | null => {
      const t = s.toLowerCase();
      if (/1st\s*period|första/.test(t)) return "1";
      if (/2nd\s*period|andra/.test(t)) return "2";
      if (/3rd\s*period|tredje/.test(t)) return "3";
      if (/overtime|över?tid|extra/.test(t)) return "OT";
      if (/shoot.?out|game winning shots|straff/.test(t)) return "SO";
      return null;
    };
    let currentPeriod: string | null = null;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(html)) !== null) {
      const row = tr[1];
      const h3 = row.match(/<h3>([^<]+)<\/h3>/i);
      if (h3) {
        const p = headerToPeriod(h3[1]);
        if (p) {
          currentPeriod = p;
          if (p === "OT") result.wentToOvertime = true;
          if (p === "SO") result.wentToShootout = true;
        }
        continue;
      }
      if (!/Total goals scored/i.test(row)) continue;
      const cells = row.split(/<\/td>/i);
      if (cells.length < 4) continue;
      const time = stripTags(cells[0]) || null;
      const teamCode = stripTags(cells[2]);
      if (!/^[A-ZÅÄÖ]{2,4}$/.test(teamCode)) continue;
      const scorerCell = cells[3];
      const beforeSpan = scorerCell.split(/<span/i)[0];
      const scorerM = beforeSpan.match(namePartRe);
      if (!scorerM) continue;
      const scorer = cleanName(scorerM[1]);
      const assists: string[] = [];
      const assistRe = /Assists in tournament[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      let am: RegExpExecArray | null;
      while ((am = assistRe.exec(scorerCell)) !== null) {
        const inner = am[1].replace(/<[^>]+>/g, "");
        const nm = inner.match(namePartRe);
        if (nm) assists.push(cleanName(nm[1]));
      }
      result.goals.push({ teamCode, scorer, assists, period: currentPeriod, time });
    }
    // Headers appear in document order (3rd, 2nd, 1st in this feed), so the
    // collected goals are reverse-chronological per period. Sort chronologically
    // so downstream "first goal" / "GWG" running totals are correct.
    const periodRank: Record<string, number> = { "1": 1, "2": 2, "3": 3, OT: 4, SO: 5 };
    const toSec = (t: string | null) => {
      if (!t) return 0;
      const m = t.match(/^(\d+):(\d+)/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
    };
    result.goals.sort((a, b) => {
      const pa = periodRank[a.period ?? ""] ?? 99;
      const pb = periodRank[b.period ?? ""] ?? 99;
      if (pa !== pb) return pa - pb;
      return toSec(a.time) - toSec(b.time);
    });
  } catch (err) {
    console.warn(`[lastMeeting] event page failed:`, (err as Error).message);
  }
  return result;
}

export type SeasonTrajectory = {
  team: string;
  seasonLabel: string;
  points: Array<{
    gameNumber: number;
    date: string;
    rollingPpg: number;
    cumulativePpg: number;
  }>;
  leagueAveragePpg: number | null;
};

function pointsForResult(
  teamGoals: number,
  oppGoals: number,
  wentBeyond: boolean,
): number {
  if (teamGoals === oppGoals) return 1;
  if (teamGoals > oppGoals) return wentBeyond ? 2 : 3;
  return wentBeyond ? 1 : 0;
}

export async function fetchSeasonTrajectory(
  team: string,
  season: Season,
): Promise<SeasonTrajectory> {
  const games = await getScheduleGames(season);
  const teamGames = games
    .filter((g) => g.played && (g.homeTeam === team || g.awayTeam === team))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const windowSize = 5;
  const recent: number[] = [];
  let cumulative = 0;
  const points: SeasonTrajectory["points"] = [];
  teamGames.forEach((g, idx) => {
    const isHome = g.homeTeam === team;
    const tg = isHome ? g.homeGoals! : g.awayGoals!;
    const og = isHome ? g.awayGoals! : g.homeGoals!;
    const wentBeyond = g.periodCount > 3;
    const pts = pointsForResult(tg, og, wentBeyond);
    cumulative += pts;
    recent.push(pts);
    if (recent.length > windowSize) recent.shift();
    const rolling = recent.reduce((a, b) => a + b, 0) / recent.length;
    points.push({
      gameNumber: idx + 1,
      date: g.date,
      rollingPpg: Number(rolling.toFixed(3)),
      cumulativePpg: Number((cumulative / (idx + 1)).toFixed(3)),
    });
  });

  // League average PPG across all played games this season.
  let totalPts = 0;
  let totalSlots = 0;
  for (const g of games) {
    if (!g.played) continue;
    const wentBeyond = g.periodCount > 3;
    const hg = g.homeGoals!;
    const ag = g.awayGoals!;
    totalPts += pointsForResult(hg, ag, wentBeyond) + pointsForResult(ag, hg, wentBeyond);
    totalSlots += 2;
  }
  const leagueAveragePpg =
    totalSlots > 0 ? Number((totalPts / totalSlots).toFixed(3)) : null;

  return { team, seasonLabel: season.label, points, leagueAveragePpg };
}

// ---------- Full standings (for the Compare page) ----------

export type StandingRow = {
  position: number;
  team: string;
  gamesPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  otWins: number;
  otLosses: number;
};

export async function fetchFullStandings(season: Season): Promise<StandingRow[]> {
  const urls = buildUrls(season.competitionId);
  const res = await fetch(urls.standings, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  const html = await res.text();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: StandingRow[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = extractTdCells(m[1]);
    // Columns: RK, Team, GP, W, T, L, GF:GA (GD), GD, TP, OTW, OTL, GWSW, GWSL
    if (cells.length < 11) continue;
    const position = Number(cells[0]);
    const team = cells[1];
    const gp = Number(cells[2]);
    const w = Number(cells[3]);
    const t = Number(cells[4]);
    const l = Number(cells[5]);
    const goalsCell = cells[6].replace(/\(.*\)/, "").trim();
    const [gfStr, gaStr] = goalsCell.split(":").map((s) => s.trim());
    const gf = Number(gfStr);
    const ga = Number(gaStr);
    const diff = Number(cells[7]);
    const pts = Number(cells[8]);
    const otw = Number(cells[9]);
    const otl = Number(cells[10]);
    if (
      !Number.isFinite(position) ||
      !team ||
      !Number.isFinite(gp) ||
      !Number.isFinite(pts)
    )
      continue;
    if (seen.has(team)) continue;
    seen.add(team);
    rows.push({
      position,
      team,
      gamesPlayed: gp,
      wins: Number.isFinite(w) ? w : 0,
      ties: Number.isFinite(t) ? t : 0,
      losses: Number.isFinite(l) ? l : 0,
      goalsFor: Number.isFinite(gf) ? gf : 0,
      goalsAgainst: Number.isFinite(ga) ? ga : 0,
      goalDiff: Number.isFinite(diff) ? diff : 0,
      points: pts,
      otWins: Number.isFinite(otw) ? otw : 0,
      otLosses: Number.isFinite(otl) ? otl : 0,
    });
  }
  return rows.sort((a, b) => a.position - b.position);
}


// ---------- League-wide overview (for home-page cards) ----------

export type LeagueLeaderScorer = {
  rank: number;
  name: string;
  team: string;
  goals: number | null;
  assists: number | null;
  points: number;
  gamesPlayed: number | null;
};

export type LeagueLeaderGoalie = {
  rank: number;
  name: string;
  team: string;
  gamesPlayed: number;
  savePct: number | null;
  gaa: number | null;
  shutouts: number | null;
  wins: number | null;
  losses: number | null;
};

export type HottestTeam = {
  rank: number;
  team: string;
  points: number;
  results: Array<"W" | "OTW" | "T" | "OTL" | "L">;
  goalsFor: number;
  goalsAgainst: number;
};

export type ScoringTeam = {
  rank: number;
  team: string;
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  perGame: number;
};

export type LeagueOverview = {
  seasonLabel: string;
  topScorers: LeagueLeaderScorer[];
  topGoalies: LeagueLeaderGoalie[];
  hottestTeams: HottestTeam[];
  highestScoring: ScoringTeam[];
  bestDefenses: ScoringTeam[];
};

export async function fetchLeagueOverview(season: Season): Promise<LeagueOverview> {
  const urls = buildUrls(season.competitionId);
  const [scorersByTeam, goaliesByTeam, standings, games] = await Promise.all([
    fetchTopScorersFromHtml(urls),
    fetchGoaliesFromHtml(urls),
    fetchFullStandings(season),
    getScheduleGames(season).catch(() => [] as ScheduleGame[]),
  ]);

  const flatScorers: LeagueLeaderScorer[] = [];
  for (const [team, list] of Object.entries(scorersByTeam)) {
    for (const s of list) {
      flatScorers.push({
        rank: 0,
        name: s.name,
        team,
        goals: s.goals ?? null,
        assists: s.assists ?? null,
        points: s.points ?? 0,
        gamesPlayed: s.gamesPlayed ?? null,
      });
    }
  }
  flatScorers.sort(
    (a, b) => b.points - a.points || (b.goals ?? 0) - (a.goals ?? 0),
  );
  const topScorers = flatScorers.slice(0, 10).map((s, i) => ({ ...s, rank: i + 1 }));

  const flatGoalies: LeagueLeaderGoalie[] = [];
  for (const [team, list] of Object.entries(goaliesByTeam)) {
    for (const g of list) {
      if ((g.gamesPlayed ?? 0) < 5) continue;
      flatGoalies.push({
        rank: 0,
        name: g.name,
        team,
        gamesPlayed: g.gamesPlayed ?? 0,
        savePct: g.savePct ?? null,
        gaa: g.gaa ?? null,
        shutouts: g.shutouts ?? null,
        wins: g.wins ?? null,
        losses: g.losses ?? null,
      });
    }
  }
  flatGoalies.sort(
    (a, b) => (b.savePct ?? -Infinity) - (a.savePct ?? -Infinity),
  );
  const topGoalies = flatGoalies.slice(0, 10).map((g, i) => ({ ...g, rank: i + 1 }));

  const byTeam = new Map<string, ScheduleGame[]>();
  for (const g of games) {
    if (!g.played) continue;
    for (const team of [g.homeTeam, g.awayTeam]) {
      const arr = byTeam.get(team) ?? [];
      arr.push(g);
      byTeam.set(team, arr);
    }
  }
  const hot: HottestTeam[] = [];
  for (const [team, list] of byTeam) {
    const last5 = [...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
    if (last5.length < 3) continue;
    let pts = 0;
    let gf = 0;
    let ga = 0;
    const results: HottestTeam["results"] = [];
    for (const g of last5) {
      const isHome = g.homeTeam === team;
      const tg = (isHome ? g.homeGoals : g.awayGoals) ?? 0;
      const og = (isHome ? g.awayGoals : g.homeGoals) ?? 0;
      gf += tg;
      ga += og;
      const beyond = g.periodCount > 3;
      if (tg === og) {
        pts += 1;
        results.push("T");
      } else if (tg > og) {
        if (beyond) {
          pts += 2;
          results.push("OTW");
        } else {
          pts += 3;
          results.push("W");
        }
      } else {
        if (beyond) {
          pts += 1;
          results.push("OTL");
        } else {
          results.push("L");
        }
      }
    }
    hot.push({ rank: 0, team, points: pts, results, goalsFor: gf, goalsAgainst: ga });
  }
  hot.sort(
    (a, b) =>
      b.points - a.points ||
      (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst),
  );
  const hottestTeams = hot.slice(0, 5).map((h, i) => ({ ...h, rank: i + 1 }));

  const scoringRows: ScoringTeam[] = standings
    .filter((r) => r.gamesPlayed > 0)
    .map((r) => ({
      rank: 0,
      team: r.team,
      gamesPlayed: r.gamesPlayed,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      perGame: r.goalsFor / r.gamesPlayed,
    }));
  const highestScoring = [...scoringRows]
    .sort((a, b) => b.perGame - a.perGame)
    .slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const bestDefenses = [...scoringRows]
    .sort(
      (a, b) =>
        a.goalsAgainst / a.gamesPlayed - b.goalsAgainst / b.gamesPlayed,
    )
    .slice(0, 5)
    .map((r, i) => ({
      ...r,
      rank: i + 1,
      perGame: r.goalsAgainst / r.gamesPlayed,
    }));

  return {
    seasonLabel: season.label,
    topScorers,
    topGoalies,
    hottestTeams,
    highestScoring,
    bestDefenses,
  };
}
