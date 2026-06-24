import type { Briefing } from "@/lib/stats.functions";

export type TeamData = Briefing["home"];

export function resultVariant(r: string) {
  if (r === "W" || r === "OTW") return "default" as const;
  if (r === "L" || r === "OTL") return "destructive" as const;
  return "secondary" as const;
}

export function resultLabel(r: string) {
  if (r === "OTW" || r === "OTL") return "OT";
  return r;
}

export function streakLabel(
  streak: { type: "W" | "T" | "L"; count: number } | null,
) {
  if (!streak) return "—";
  return `${streak.type}${streak.count}`;
}

export function streakVariant(type: "W" | "T" | "L" | undefined) {
  if (type === "W") return "default" as const;
  if (type === "L") return "destructive" as const;
  return "secondary" as const;
}

export function resultPoints(
  r: TeamData["lastFive"][number]["result"],
): number {
  if (r === "W") return 3;
  if (r === "OTW") return 2;
  if (r === "OTL" || r === "T") return 1;
  return 0;
}

export function venueWinRate(
  split:
    | { results: ("W" | "T" | "L" | "OTW" | "OTL")[] }
    | null
    | undefined,
): number | null {
  if (!split || split.results.length === 0) return null;
  const pts = split.results.reduce((a, r) => {
    if (r === "W") return a + 3;
    if (r === "OTW") return a + 2;
    if (r === "OTL" || r === "T") return a + 1;
    return a;
  }, 0);
  return pts / (split.results.length * 3);
}

export function teamPpg(t: TeamData): number | null {
  if (t.points == null || !t.gamesPlayed) return null;
  return t.points / t.gamesPlayed;
}

export function currentStreak(
  results: TeamData["lastFive"],
): { type: string; count: number } | null {
  if (results.length === 0) return null;
  const norm = (r: string) =>
    r === "W" || r === "OTW"
      ? "W"
      : r === "L" || r === "OTL"
        ? "L"
        : r === "T"
          ? "T"
          : null;
  const first = norm(results[0].result);
  if (!first) return null;
  let count = 0;
  for (const g of results) {
    if (norm(g.result) === first) count++;
    else break;
  }
  return { type: first, count };
}

export function recordStr(r: { wins: number; ties: number; losses: number }) {
  return `${r.wins}-${r.ties}-${r.losses}`;
}

export function todayInStockholm(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

export function fmtPct1(v: number | null | undefined): string {
  return v != null ? `${v.toFixed(1)}%` : "—";
}

export function lastFivePpg(team: TeamData): number | null {
  if (!team.lastFive || team.lastFive.length === 0) return null;
  const pts = team.lastFive.reduce((a, g) => a + resultPoints(g.result), 0);
  return pts / team.lastFive.length;
}

export function parseGameDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  const m2 = s.match(/(\d{1,2})\/(\d{1,2})(?:[-\s](\d{2,4}))?/);
  if (m2) {
    const day = parseInt(m2[1], 10);
    const mon = parseInt(m2[2], 10) - 1;
    const yr = m2[3]
      ? m2[3].length === 2
        ? 2000 + parseInt(m2[3], 10)
        : parseInt(m2[3], 10)
      : new Date().getFullYear();
    const d = new Date(yr, mon, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function daysSinceLast(
  team: TeamData,
): { days: number | null; date: Date | null } {
  const first = team.lastFive?.[0];
  const d = parseGameDate(first?.date);
  if (!d) return { days: null, date: null };
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  return {
    days: Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24))),
    date: d,
  };
}

export function strongestPeriod(
  team: TeamData,
): { label: string; perGame: number } | null {
  const pg = team.periodGoals;
  if (!pg || pg.games === 0) return null;
  const entries: Array<[string, number]> = [
    ["P1", pg.p1 / pg.games],
    ["P2", pg.p2 / pg.games],
    ["P3", pg.p3 / pg.games],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return { label: entries[0][0], perGame: entries[0][1] };
}
