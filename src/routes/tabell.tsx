import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ListOrdered, Loader2 } from "lucide-react";

import { listSeasons, getFullStandings } from "@/lib/stats.functions";
import type { StandingsRow } from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeasonPicker } from "@/components/dashboard/season-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamLogo } from "@/components/team-logo";
import { translateError } from "@/lib/error-messages";
import { shortTeamName } from "@/lib/team-short-names";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const seasonsQO = queryOptions({
  queryKey: ["seasons"],
  queryFn: () => listSeasons(),
  staleTime: 24 * 60 * 60 * 1000,
});

export const Route = createFileRoute("/tabell")({
  head: () => ({
    meta: [
      { title: "Tabell — HockeyEttan Södra" },
      {
        name: "description",
        content:
          "Aktuell serietabell för HockeyEttan Södra: poäng, målskillnad och form per lag.",
      },
      { property: "og:title", content: "Tabell — HockeyEttan Södra" },
      {
        property: "og:description",
        content:
          "Aktuell serietabell för HockeyEttan Södra: poäng, målskillnad och form per lag.",
      },
    ],
  }),
  loader: async ({ context }) => {
    const seasons = await context.queryClient.ensureQueryData(seasonsQO);
    return { defaultSeason: seasons.default.label };
  },
  component: StandingsPage,
});

type SortKey = "position" | "points" | "goalDiff" | "goalsFor" | "goalsAgainst";

function StandingsPage() {
  const { defaultSeason } = Route.useLoaderData();
  const fetchSeasons = useServerFn(listSeasons);
  const fetchStandings = useServerFn(getFullStandings);

  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasons(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const [season, setSeason] = useState<string>(defaultSeason);
  const activeSeason = season || defaultSeason;

  const standingsQuery = useQuery({
    queryKey: ["full-standings", activeSeason],
    queryFn: () => fetchStandings({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    staleTime: 60 * 60 * 1000,
  });

  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo<StandingsRow[]>(() => {
    const rows = standingsQuery.data?.rows ?? [];
    const sortedRows = [...rows].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return sortedRows;
  }, [standingsQuery.data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "position" ? "asc" : "desc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                <ListOrdered className="h-5 w-5" />
                Tabell
              </h1>
              <p className="text-sm text-muted-foreground">
                HockeyEttan Södra · serietabellen
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
              <CardTitle className="text-base">Säsong</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs">
                <SeasonPicker
                  value={activeSeason}
                  onChange={setSeason}
                  seasons={(seasonsQuery.data?.seasons ?? []).map((s) => s.label)}
                  loading={seasonsQuery.isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {standingsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laddar tabell…
            </div>
          ) : standingsQuery.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {translateError(standingsQuery.error)}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen tabelldata hittad.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th
                          className="cursor-pointer px-3 py-2 text-right select-none"
                          onClick={() => toggleSort("position")}
                        >
                          #{sortIndicator("position")}
                        </th>
                        <th className="px-3 py-2">Lag</th>
                        <th className="px-2 py-2 text-right">M</th>
                        <th className="px-2 py-2 text-right">V</th>
                        <th
                          className="px-2 py-2 text-right"
                          title="Övertids-vinster"
                        >
                          ÖV
                        </th>
                        <th
                          className="px-2 py-2 text-right"
                          title="Övertids-förluster"
                        >
                          ÖF
                        </th>
                        <th className="px-2 py-2 text-right">F</th>
                        <th
                          className="cursor-pointer px-2 py-2 text-right select-none"
                          onClick={() => toggleSort("goalsFor")}
                        >
                          GM{sortIndicator("goalsFor")}
                        </th>
                        <th
                          className="cursor-pointer px-2 py-2 text-right select-none"
                          onClick={() => toggleSort("goalsAgainst")}
                        >
                          IM{sortIndicator("goalsAgainst")}
                        </th>
                        <th
                          className="cursor-pointer px-2 py-2 text-right select-none"
                          onClick={() => toggleSort("goalDiff")}
                        >
                          +/−{sortIndicator("goalDiff")}
                        </th>
                        <th
                          className="cursor-pointer px-3 py-2 text-right font-semibold select-none"
                          onClick={() => toggleSort("points")}
                        >
                          P{sortIndicator("points")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row) => (
                        <tr
                          key={row.team}
                          className="border-b border-border/60 last:border-b-0 hover:bg-muted/30"
                        >
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {row.position}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to="/"
                              search={{ home: row.team, away: "" }}
                              className="flex min-w-0 items-center gap-2 hover:underline"
                            >
                              <TeamLogo team={row.team} size="sm" />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="truncate">
                                    <span className="sm:hidden">
                                      {shortTeamName(row.team)}
                                    </span>
                                    <span className="hidden sm:inline">
                                      {row.team}
                                    </span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{row.team}</TooltipContent>
                              </Tooltip>
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-right">{row.gamesPlayed}</td>
                          <td className="px-2 py-2 text-right">{row.wins}</td>
                          <td className="px-2 py-2 text-right text-muted-foreground">
                            {row.otWins}
                          </td>
                          <td className="px-2 py-2 text-right text-muted-foreground">
                            {row.otLosses}
                          </td>
                          <td className="px-2 py-2 text-right">{row.losses}</td>
                          <td className="px-2 py-2 text-right">{row.goalsFor}</td>
                          <td className="px-2 py-2 text-right">
                            {row.goalsAgainst}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono ${
                              row.goalDiff > 0
                                ? "text-green-600 dark:text-green-400"
                                : row.goalDiff < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {row.points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Klicka på ett lagnamn för att ladda matchbriefingen.
                </p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
