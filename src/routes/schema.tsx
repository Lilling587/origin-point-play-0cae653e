import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";

import { listSeasons, getSeasonSchedule } from "@/lib/stats.functions";
import type { ScheduleEntry } from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeasonPicker } from "@/components/dashboard/season-picker";
import { SearchableTeamPicker } from "@/components/dashboard/searchable-team-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamLogo } from "@/components/team-logo";
import { translateError } from "@/lib/error-messages";

const seasonsQO = queryOptions({
  queryKey: ["seasons"],
  queryFn: () => listSeasons(),
  staleTime: 24 * 60 * 60 * 1000,
});

export const Route = createFileRoute("/schema")({
  head: () => ({
    meta: [
      { title: "Spelschema — HockeyEttan Södra" },
      {
        name: "description",
        content:
          "Hela seriespelet för HockeyEttan Södra — spelade och kommande matcher per omgång.",
      },
    ],
  }),
  loader: async ({ context }) => {
    const seasons = await context.queryClient.ensureQueryData(seasonsQO);
    return { defaultSeason: seasons.default.label };
  },
  component: SchemaPage,
});

function formatSwedishDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function monthKey(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long" });
}

function SchemaPage() {
  const { defaultSeason } = Route.useLoaderData();
  const fetchSeasons = useServerFn(listSeasons);
  const fetchSchedule = useServerFn(getSeasonSchedule);

  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasons(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const [season, setSeason] = useState<string>(defaultSeason);
  const activeSeason = season || defaultSeason;

  const scheduleQuery = useQuery({
    queryKey: ["schedule", activeSeason],
    queryFn: () => fetchSchedule({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    staleTime: 60 * 60 * 1000,
  });

  const [teamFilter, setTeamFilter] = useState<string>("");
  const [showPlayed, setShowPlayed] = useState<boolean>(true);
  const [showUpcoming, setShowUpcoming] = useState<boolean>(true);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of scheduleQuery.data?.games ?? []) {
      set.add(g.homeTeam);
      set.add(g.awayTeam);
    }
    return Array.from(set).sort();
  }, [scheduleQuery.data]);

  const filtered = useMemo(() => {
    const games = scheduleQuery.data?.games ?? [];
    return games.filter((g) => {
      if (g.played && !showPlayed) return false;
      if (!g.played && !showUpcoming) return false;
      if (teamFilter && g.homeTeam !== teamFilter && g.awayTeam !== teamFilter)
        return false;
      return true;
    });
  }, [scheduleQuery.data, teamFilter, showPlayed, showUpcoming]);

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const g of filtered) {
      const key = monthKey(g.date);
      const arr = map.get(key) ?? [];
      arr.push(g);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const playedCount = filtered.filter((g) => g.played).length;
  const upcomingCount = filtered.length - playedCount;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              <CalendarDays className="h-5 w-5" />
              Spelschema
            </h1>
            <p className="text-sm text-muted-foreground">
              HockeyEttan Södra · alla matcher för säsongen
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SeasonPicker
                value={activeSeason}
                onChange={setSeason}
                seasons={(seasonsQuery.data?.seasons ?? []).map((s) => s.label)}
                loading={seasonsQuery.isLoading}
              />
              <SearchableTeamPicker
                label="Filtrera lag (valfritt)"
                value={teamFilter}
                onChange={setTeamFilter}
                teams={teamOptions}
                loading={scheduleQuery.isLoading}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={showPlayed ? "default" : "outline"}
                onClick={() => setShowPlayed((v) => !v)}
              >
                Spelade
              </Button>
              <Button
                size="sm"
                variant={showUpcoming ? "default" : "outline"}
                onClick={() => setShowUpcoming((v) => !v)}
              >
                Kommande
              </Button>
              {teamFilter ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTeamFilter("")}
                >
                  Rensa lagfilter
                </Button>
              ) : null}
              <div className="ml-auto text-xs text-muted-foreground">
                {playedCount} spelade · {upcomingCount} kommande
              </div>
            </div>
          </CardContent>
        </Card>

        {scheduleQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar spelschema…
          </div>
        ) : scheduleQuery.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {translateError(scheduleQuery.error)}
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga matcher matchar dina filter.
          </p>
        ) : (
          grouped.map(([month, games]) => (
            <Card key={month}>
              <CardHeader>
                <CardTitle className="text-base capitalize">{month}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {games.map((g, i) => (
                  <div
                    key={`${g.date}-${g.homeTeam}-${g.awayTeam}-${i}`}
                    className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0 shrink-0 text-xs text-muted-foreground sm:text-sm">
                      {formatSwedishDate(g.date)}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <TeamLogo team={g.homeTeam} size="sm" />
                      <span
                        className={`truncate ${teamFilter === g.homeTeam ? "font-semibold" : ""}`}
                      >
                        {g.homeTeam}
                      </span>
                      <span className="mx-1 shrink-0 text-muted-foreground">vs</span>
                      <TeamLogo team={g.awayTeam} size="sm" />
                      <span
                        className={`truncate ${teamFilter === g.awayTeam ? "font-semibold" : ""}`}
                      >
                        {g.awayTeam}
                      </span>
                    </div>
                    <div className="shrink-0 justify-self-end">
                      {g.played ? (
                        g.id ? (
                          <a
                            href={`https://stats.swehockey.se/Game/Events/${g.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-primary hover:underline"
                          >
                            {g.homeGoals}–{g.awayGoals} ↗
                          </a>
                        ) : (
                          <span className="font-mono">
                            {g.homeGoals}–{g.awayGoals}
                          </span>
                        )
                      ) : (
                        <Badge variant="outline">Kommande</Badge>
                      )}
                    </div>
                  </div>

                ))}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
