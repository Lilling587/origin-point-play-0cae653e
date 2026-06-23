import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

import {
  listTeams,
  listSeasons,
  getMatchupBriefing,
  scanForNewSeasons,
  listPendingSeasons,
  confirmSeasonDetection,
  dismissSeasonDetection,
  getTodaysMatchup,
  getAllTimeHeadToHead,
  getLastMeetingRecap,
  getSeasonTrajectory,
} from "@/lib/stats.functions";

import type {
  Briefing,
  AllTimeH2HResult,
  LastMeetingRecapResult,
  SeasonTrajectoryResult,
} from "@/lib/stats.functions";

import { Input } from "@/components/ui/input";
import { AlertCircle, Check, X, Info, Star, ImageDown, Scale, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  getFavoriteTeam,
  setFavoriteTeam,
  DEFAULT_FAVORITE_TEAM,
  getLastActiveTab,
  setLastActiveTab,
} from "@/lib/preferences";
import { useIsMobile } from "@/hooks/use-mobile";

const searchSchema = z.object({
  home: fallback(z.string(), "").default(""),
  away: fallback(z.string(), "").default(""),
});

const seasonsQueryOptions = queryOptions({
  queryKey: ["seasons"],
  queryFn: () => listSeasons(),
  staleTime: 24 * 60 * 60 * 1000,
});

const teamsQueryOptions = (season: string) =>
  queryOptions({
    queryKey: ["teams", season],
    queryFn: () => listTeams({ data: { season } }),
    staleTime: 60 * 60 * 1000,
  });

function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="flex-1">Failed to load team list: {error.message}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
      Page not found.
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grästorps IK — Producent-statistik" },
      {
        name: "description",
        content:
          "Matchstatistik för HockeyEttan Södra-sändningar. Välj två lag och få form, inbördes möten, toppoängplockare och specialspel på sekunder.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) => {
    const seasons = await context.queryClient.ensureQueryData(seasonsQueryOptions);
    const defaultSeason = seasons.default.label;
    let defaultTeams: Awaited<ReturnType<typeof listTeams>> | null = null;
    if (defaultSeason) {
      defaultTeams = await context.queryClient.ensureQueryData(teamsQueryOptions(defaultSeason));
    }
    return { seasons, defaultSeason, defaultTeams };
  },
  errorComponent: RouteError,
  notFoundComponent: NotFound,
  component: Dashboard,
});

function Dashboard() {
  const loaderData = Route.useLoaderData();
  const fetchTeams = useServerFn(listTeams);
  const fetchSeasons = useServerFn(listSeasons);
  const fetchBriefing = useServerFn(getMatchupBriefing);
  const fetchPending = useServerFn(listPendingSeasons);
  const fetchTodaysMatchup = useServerFn(getTodaysMatchup);
  const runScan = useServerFn(scanForNewSeasons);
  const qc = useQueryClient();


  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasons(),
    initialData: loaderData.seasons,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const pendingQuery = useQuery({
    queryKey: ["season-detections"],
    queryFn: () => fetchPending(),
    staleTime: 5 * 60 * 1000,
  });

  // Kick off a background scan once on mount. Throttled server-side to 6h.
  useEffect(() => {
    runScan({ data: {} })
      .then(() => qc.invalidateQueries({ queryKey: ["season-detections"] }))
      .catch((e) => console.warn("[season-scan] failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [season, setSeason] = useState<string>(loaderData.defaultSeason);
  const activeSeason =
    season || loaderData.defaultSeason || seasonsQuery.data?.default.label || "";

  const teamsQuery = useQuery({
    queryKey: ["teams", activeSeason],
    queryFn: () => fetchTeams({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    initialData: activeSeason === loaderData.defaultSeason ? loaderData.defaultTeams ?? undefined : undefined,
    staleTime: 60 * 60 * 1000,
  });

  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });

  const todaysMatchupQuery = useQuery({
    queryKey: ["todays-matchup", activeSeason],
    queryFn: () => fetchTodaysMatchup({ data: { season: activeSeason } }),
    enabled: !!activeSeason,
    staleTime: 30 * 60 * 1000,
  });






  // Auto-fill the away team from today's schedule, but only when Grästorps IK
  // is the home team for today's game. Home is always Grästorps IK.
  useEffect(() => {
    const match = todaysMatchupQuery.data?.match;
    if (!match) return;
    if (match.home !== "Grästorps IK") return;
    if (search.away) return;
    navigate({
      search: (prev: typeof search) => ({
        ...prev,
        home: "Grästorps IK",
        away: match.away,
      }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysMatchupQuery.data?.match?.date]);


  // Favorite team, persisted in localStorage. Used as the default home team
  // when the URL has no ?home= and there is no auto-detected matchup.
  const [favorite, setFavorite] = useState<string>(DEFAULT_FAVORITE_TEAM);
  useEffect(() => {
    setFavorite(getFavoriteTeam());
    const onChange = () => setFavorite(getFavoriteTeam());
    window.addEventListener("producerStats:favorite-changed", onChange);
    return () =>
      window.removeEventListener("producerStats:favorite-changed", onChange);
  }, []);

  const home = search.home || favorite || DEFAULT_FAVORITE_TEAM;
  const away = search.away;
  const selectedAway =
    away && away !== home
      ? away
      : (teamsQuery.data?.teams ?? []).find((team: string) => team !== home) ?? "";

  type BriefingCache = {
    briefing: Briefing;
    fetchedAt: string;
    cached: boolean;
    season?: string;
  };
  const briefingCacheKey = (h: string, a: string, s: string) =>
    ["briefing-cache", s, h, a] as const;
  const [briefing, setBriefingState] = useState<BriefingCache | null>(() =>
    qc.getQueryData<BriefingCache>(briefingCacheKey(home, selectedAway, activeSeason)) ?? null,
  );
  const setBriefing = (data: BriefingCache | null) => {
    setBriefingState(data);
    if (data) {
      const season = data.season ?? activeSeason;
      qc.setQueryData(
        briefingCacheKey(data.briefing.home.name, data.briefing.away.name, season),
        data,
      );
      // Also store under the input team identifiers used by the URL/selector
      // so a remount (e.g. after navigating to Compare and back) can restore.
      qc.setQueryData(briefingCacheKey(home, selectedAway, season), data);
    }
  };
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached =
      qc.getQueryData<BriefingCache>(
        briefingCacheKey(home, selectedAway, activeSeason),
      ) ?? null;
    setBriefingState(cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, selectedAway, activeSeason]);


  const [validationErrors, setValidationErrors] = useState<{
    home?: string;
    away?: string;
  }>({});

  const validate = (): boolean => {
    const errors: { home?: string; away?: string } = {};
    if (!home || home.trim() === "") {
      errors.home = "Hemmalag krävs.";
    }
    if (!selectedAway || selectedAway.trim() === "") {
      errors.away = "Bortalag krävs.";
    } else if (home === selectedAway) {
      errors.away = "Hemma- och bortalag måste vara olika.";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const setHome = (team: string) => {
    navigate({ search: (prev: typeof search) => ({ ...prev, home: team }) });
    if (validationErrors.home) {
      setValidationErrors((prev) => ({ ...prev, home: undefined }));
    }
  };
  const setAway = (team: string) => {
    navigate({ search: (prev: typeof search) => ({ ...prev, away: team }) });
    if (validationErrors.away) {
      setValidationErrors((prev) => ({ ...prev, away: undefined }));
    }
  };


  const briefingMut = useMutation({
    mutationFn: (vars: { home: string; away: string; force?: boolean }) =>
      fetchBriefing({ data: { ...vars, season: activeSeason } }),
    onSuccess: (data) => {
      setBriefing(data);
      setActiveTab("briefing");
      setError(null);
    },
    onError: (e: Error, vars) => {
      // Dev error logging for failed briefing refreshes
      console.error("[briefing refresh failed]", {
        message: e.message,
        stack: e.stack,
        cause: (e as Error & { cause?: unknown }).cause,
        vars,
        season: activeSeason,
      });
      setError(e.message);
    },
  });

  const handleLoadBriefing = () => {
    if (!validate()) return;
    briefingMut.mutate({ home, away: selectedAway });
  };

  const canLoad = home && selectedAway && home !== selectedAway;
  const [activeTab, setActiveTab] = useState<"briefing" | "recap">(() => getLastActiveTab() ?? "briefing");
  const isMobile = useIsMobile();

  useEffect(() => {
    setLastActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const el = document;
    let start: { x: number; y: number } | null = null;
    let end: { x: number; y: number } | null = null;
    const threshold = 56;

    const onDown = (e: PointerEvent) => {
      if (window.innerWidth >= 768) return;
      start = { x: e.clientX, y: e.clientY };
      end = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!start || window.innerWidth >= 768) return;
      end = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!start || !end || window.innerWidth >= 768) return;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        setActiveTab((prev) => (dx < 0 && prev === "briefing" ? "recap" : dx > 0 && prev === "recap" ? "briefing" : prev));
      }
      start = null;
      end = null;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as "briefing" | "recap")}
      className="min-h-screen bg-background"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {favorite || "Grästorps IK"} — Producent-statistik
            </h1>
            <p className="text-sm text-muted-foreground">
              HockeyEttan Södra · matchstatistik för kommentatorer
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="briefing" className="flex-1 sm:flex-initial">
                <span className="sm:hidden">Briefing</span>
                <span className="hidden sm:inline">Matchbriefing</span>
              </TabsTrigger>
              <TabsTrigger value="recap" className="flex-1 sm:flex-initial">
                <span className="sm:hidden">Recap</span>
                <span className="hidden sm:inline">Postgame recap</span>
              </TabsTrigger>
            </TabsList>
            <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-initial">
              <Link to="/compare">
                <Scale className="mr-2 h-4 w-4 shrink-0" />
                <span className="sm:hidden">Jämför</span>
                <span className="hidden sm:inline">Jämför lag</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-initial">
              <Link to="/notifications">Notiser</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl touch-pan-y px-6 py-8 space-y-6">
        <PendingSeasonsBanner
          pending={pendingQuery.data?.pending ?? []}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["season-detections"] });
            qc.invalidateQueries({ queryKey: ["seasons"] });
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Välj lag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <SeasonPicker
                value={activeSeason}
                onChange={setSeason}
                seasons={(seasonsQuery.data?.seasons ?? []).map((s: { label: string }) => s.label)}
                loading={seasonsQuery.isLoading}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] items-end">
              <div className="flex flex-col gap-1">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <SearchableTeamPicker
                      label="Hemmalag"
                      value={home}
                      onChange={setHome}
                      teams={teamsQuery.data?.teams ?? []}
                      excludedTeam={away}
                      loading={teamsQuery.isLoading}
                    />
                  </div>
                  <Button
                    type="button"
                    variant={favorite === home ? "default" : "outline"}
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    title={
                      favorite === home
                        ? "Detta är ditt favoritlag (laddas som standard)"
                        : `Sätt ${home} som favoritlag`
                    }
                    onClick={() => setFavoriteTeam(favorite === home ? "" : home)}
                  >
                    <Star
                      className={`h-4 w-4 ${favorite === home ? "fill-current" : ""}`}
                    />
                  </Button>
                </div>
                {validationErrors.home ? (
                  <p className="text-xs text-destructive">{validationErrors.home}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <SearchableTeamPicker
                  label="Bortalag"
                  value={selectedAway}
                  onChange={setAway}
                  teams={teamsQuery.data?.teams ?? []}
                  excludedTeam={home}
                  loading={teamsQuery.isLoading}
                />
                {validationErrors.away ? (
                  <p className="text-xs text-destructive">{validationErrors.away}</p>
                ) : null}
              </div>
              <Button
                disabled={briefingMut.isPending}
                onClick={handleLoadBriefing}
              >
                {briefingMut.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Laddar…
                  </>
                ) : (
                  "Ladda statistik"
                )}
              </Button>
            </div>
            {teamsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar laglista…
              </div>
            ) : teamsQuery.isSuccess ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-green-500" />
                {teamsQuery.data?.teams.length ?? 0} lag laddade
              </div>
            ) : null}
            {todaysMatchupQuery.data?.match &&
            todaysMatchupQuery.data.match.home === "Grästorps IK" &&
            search.away === todaysMatchupQuery.data.match.away ? (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  Bortalag autoifyllt från dagens schema ({todaysMatchupQuery.data.match.date})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    navigate({
                      search: (prev: typeof search) => ({ ...prev, away: "" }),
                      replace: true,
                    })
                  }
                >
                  <X className="mr-1 h-3 w-3" />
                  Rensa
                </Button>
              </div>
            ) : null}
            {teamsQuery.isError ? (
              <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  Kunde inte ladda laglistan.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => teamsQuery.refetch()}
                >
                  <RefreshCw className="h-3 w-3" />
                  Försök igen
                </Button>
              </div>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            ) : null}
          </CardContent>
        </Card>

        {briefingMut.isPending ? <BriefingSkeleton /> : null}

        <TabsContent value="briefing" className="mt-0">
          {briefing ? (
            <BriefingView
              data={briefing.briefing}
              fetchedAt={briefing.fetchedAt}
              cached={briefing.cached}
              refreshing={briefingMut.isPending}
              refreshError={briefingMut.isError ? (briefingMut.error as Error).message : null}
              onRefresh={() =>
                  briefingMut.mutate({ home, away: selectedAway, force: true }, {
                  onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
                })
              }
            />
          ) : null}
        </TabsContent>

        <TabsContent value="recap" className="mt-0">
          {canLoad ? (
            <PostgameRecapCard
              home={home}
              away={selectedAway}
              onBackToBriefing={() => setActiveTab("briefing")}
            />
          ) : null}
        </TabsContent>

      </main>

    </Tabs>
  );
}
function SeasonPicker({
  value,
  onChange,
  seasons,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  seasons: string[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Säsong
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={loading}
          >
            <span className={value ? "truncate" : "truncate text-muted-foreground"}>
              {value || (loading ? "Laddar säsonger…" : "Välj säsong")}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-2 h-4 w-4 shrink-0 opacity-50"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>No season found.</CommandEmpty>
              <CommandGroup>
                {seasons.map((seasonLabel) => (
                  <CommandItem
                    key={seasonLabel}
                    value={seasonLabel}
                    onSelect={(currentValue) => {
                      onChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    {seasonLabel}
                    {value === seasonLabel && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SearchableTeamPicker({
  label,
  value,
  onChange,
  teams,
  excludedTeam,
  loading,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  teams: string[];
  excludedTeam?: string;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  const options = useMemo(
    () =>
      Array.from(new Set([...teams, "Grästorps IK"]))
        .filter((team) => team !== excludedTeam)
        .sort(),
    [teams, excludedTeam]
  );

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={loading}
          >
            <span className={value ? "truncate" : "truncate text-muted-foreground"}>
              {value || (loading ? "Laddar lag…" : "Välj lag")}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-2 h-4 w-4 shrink-0 opacity-50"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Sök lag…" />
            <CommandList>
              <CommandEmpty>Inget lag hittades.</CommandEmpty>
              <CommandGroup>
                {options.map((t) => (
                  <CommandItem
                    key={t}
                    value={t}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? "" : currentValue);
                      setOpen(false);
                    }}
                  >
                    {t}
                    {value === t && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="ml-auto h-4 w-4"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BriefingView({
  data,
  fetchedAt,
  cached,
  refreshing,
  refreshError,
  onRefresh,
}: {
  data: Briefing;
  fetchedAt: string;
  cached: boolean;
  refreshing: boolean;
  refreshError: string | null;
  onRefresh: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const handleShareImage = async () => {
    if (typeof window === "undefined") return;
    const node = document.getElementById("briefing-capture");
    if (!node) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        cacheBust: true,
        filter: (el) =>
          !(el instanceof HTMLElement && el.dataset.exportHide === "true"),
      });
      const filename = `producer-stats-${data.home.name}-vs-${data.away.name}-${new Date(fetchedAt).toISOString().slice(0, 10)}.png`
        .replace(/\s+/g, "_");
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
      // Best-effort clipboard copy on supporting browsers.
      try {
        const blob = await (await fetch(dataUrl)).blob();
        if ("ClipboardItem" in window) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        }
      } catch {
        // clipboard not available — download still worked
      }
    } catch (err) {
      console.error("[share-image] failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
      <div className="space-y-6" id="briefing-capture">
      <div className="flex items-center justify-between" data-export-hide="true">
        <div className="text-xs text-muted-foreground">
          {cached ? "Cached" : "Fresh"} · fetched{" "}
          {new Date(fetchedAt).toLocaleString("sv-SE")}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareImage}
            disabled={exporting}
            title="Download briefing as PNG (also copies to clipboard when supported)"
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageDown className="mr-2 h-4 w-4" />
            )}
            Share as image
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TeamHeader team={data.home} side="Hemmalag" />
        <TeamHeader team={data.away} side="Bortalag" />
      </div>


      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormCard team={data.home} />
        <FormCard team={data.away} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <VenueStreakCard team={data.home} />
        <VenueStreakCard team={data.away} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PeriodGoalsCard team={data.home} refreshing={refreshing} error={refreshError} />
        <PeriodGoalsCard team={data.away} refreshing={refreshing} error={refreshError} />
      </div>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inbördes möten</CardTitle>
        </CardHeader>
        <CardContent>
          {data.headToHead.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga tidigare möten denna säsong.
            </p>
          ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Hemma</TableHead>
                  <TableHead>Borta</TableHead>
                  <TableHead className="text-right">Resultat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.headToHead.map((g, i) => (
                  <TableRow key={i}>
                    <TableCell>{g.date || "—"}</TableCell>
                    <TableCell>{g.homeTeam}</TableCell>
                    <TableCell>{g.awayTeam}</TableCell>
                    <TableCell className="text-right font-mono">
                      {g.gameId ? (
                        <a
                          href={`https://stats.swehockey.se/Game/Events/${g.gameId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {g.score} ↗
                        </a>
                      ) : (
                        g.score
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ScorersCard team={data.home} />
        <ScorersCard team={data.away} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GoaliesCard team={data.home} />
        <GoaliesCard team={data.away} />
      </div>



      <ShotVolumeCard home={data.home} away={data.away} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SpecialTeamsCard team={data.home} opponent={data.away} />
        <SpecialTeamsCard team={data.away} opponent={data.home} />
      </div>

      <WinProbabilityCard home={data.home} away={data.away} />



      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HottestPlayerCard team={data.home} label="Hemmalag" />
        <HottestPlayerCard team={data.away} label="Bortalag" />
      </div>

      <StreakAlertsCard home={data.home} away={data.away} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormTrendCard team={data.home} />
        <FormTrendCard team={data.away} />
      </div>

      <RestDaysCard home={data.home} away={data.away} />

      <DisciplineCard home={data.home} away={data.away} />

      


      





      {data.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anteckningar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TeamHeader({
  team,
  side,
}: {
  team: Briefing["home"];
  side: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="secondary">{side}</Badge>
          <span className="text-xs text-muted-foreground">
            {team.gamesPlayed != null ? `${team.gamesPlayed} GP` : "—"}
          </span>
        </div>
        <CardTitle className="mt-2 text-xl">{team.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-2xl font-semibold">
              {team.position != null ? `#${team.position}` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Placering</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">
              {team.points != null ? team.points : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Poäng</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function resultVariant(r: string) {
  if (r === "W" || r === "OTW") return "default" as const;
  if (r === "L" || r === "OTL") return "destructive" as const;
  return "secondary" as const;
}

function resultLabel(r: string) {
  if (r === "OTW" || r === "OTL") return "OT";
  return r;
}

function FormCard({ team }: { team: Briefing["home"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · senaste 5</CardTitle>
      </CardHeader>
      <CardContent>
        {team.lastFive.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <ul className="space-y-3 sm:space-y-2">
            {team.lastFive.map((g, i) => (
              <li
                key={i}
                className="text-sm border-b border-border pb-2 last:border-0"
              >
                {/* Mobile: two-line layout */}
                <div className="flex flex-col gap-1 sm:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant={resultVariant(g.result)}>{resultLabel(g.result)}</Badge>
                      {g.isHome !== null ? (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {g.isHome ? "HEMMA" : "BORTA"}
                        </span>
                      ) : null}
                    </div>
                    <span className="font-mono text-xs shrink-0">{g.score}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate min-w-0">vs {g.opponent}</span>
                    <span className="tabular-nums shrink-0">{g.date || "—"}</span>
                  </div>
                </div>

                {/* Desktop: single-line layout */}
                <div className="hidden sm:flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                    <Badge variant={resultVariant(g.result)}>{resultLabel(g.result)}</Badge>
                    {g.isHome !== null ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 h-4 whitespace-nowrap"
                        title={g.isHome ? "Hemmamatch" : "Bortamatch"}
                      >
                        {g.isHome ? "Hemma" : "Borta"}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap shrink-0 text-xs">
                      {g.date || "—"}
                    </span>
                    <span className="truncate min-w-0">vs {g.opponent}</span>
                  </div>
                  <span className="font-mono whitespace-nowrap shrink-0 text-xs">{g.score}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function streakLabel(streak: { type: "W" | "T" | "L"; count: number } | null) {
  if (!streak) return "—";
  return `${streak.type}${streak.count}`;
}

function streakVariant(type: "W" | "T" | "L" | undefined) {
  if (type === "W") return "default" as const;
  if (type === "L") return "destructive" as const;
  return "secondary" as const;
}

function VenueRow({
  label,
  split,
}: {
  label: string;
  split: NonNullable<Briefing["home"]["venueForm"]>["home"];
}) {
  const recent = split.results.slice(0, 10);
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium w-12 shrink-0">{label}</span>
        <Badge variant={streakVariant(split.streak?.type)} className="tabular-nums">
          {streakLabel(split.streak)}
        </Badge>
      </div>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {recent.length === 0 ? (
          <span className="text-xs text-muted-foreground">inga</span>
        ) : (
          recent.map((r, i) => (
            <Badge
              key={i}
              variant={resultVariant(r)}
              className="text-[10px] px-1.5 h-4"
              title={`match ${i + 1} av ${split.results.length} (senaste först)`}
            >
              {resultLabel(r)}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

function VenueStreakCard({ team }: { team: Briefing["home"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · form</CardTitle>
      </CardHeader>
      <CardContent>
        {!team.venueForm ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <div className="space-y-3">
            <VenueRow label="Hemma" split={team.venueForm.home} />
            <VenueRow label="Borta" split={team.venueForm.away} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodGoalsCard({
  team,
  refreshing,
  error,
}: {
  team: Briefing["home"];
  refreshing: boolean;
  error: string | null;
}) {
  const pg = team.periodGoals;
  const formatAverage = (goals: number, games: number) => {
    const average = games > 0 ? goals / games : 0;
    return average.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span>{team.name} · mål per period</span>
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {refreshing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-1 text-center">
                  <Skeleton className="mx-auto h-7 w-8" />
                  <Skeleton className="mx-auto h-3 w-6" />
                </div>
              ))}
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Kunde inte uppdatera: {error}</p>
        ) : !pg || pg.games === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {(() => {
                const best = strongestPeriod(team);
                return ([
                  ["P1", pg.p1],
                  ["P2", pg.p2],
                  ["P3", pg.p3],
                ] as const).map(([label, value]) => (
                  <div
                    key={label}
                    className={`text-center rounded-md border p-2 ${best?.label === label ? "border-primary bg-primary/5" : "border-transparent"}`}
                  >
                    <div className="text-xl sm:text-2xl font-semibold tabular-nums">
                      {formatAverage(value, pg.games)}
                    </div>
                    <div className="text-xs text-muted-foreground">{label} / match</div>
                  </div>
                ));
              })()}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-semibold text-foreground">
              <span>Totalt antal mål</span>
              <span className="font-mono tabular-nums">
                {pg.total} på {pg.games} matcher · {formatAverage(pg.total, pg.games)}/match
              </span>
            </div>
          </>

        )}
      </CardContent>
    </Card>
  );
}

function ScorersCard({ team }: { team: Briefing["home"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · Poängliga</CardTitle>
      </CardHeader>
      <CardContent>
        {team.topScorers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Spelare</TableHead>
                  <TableHead className="text-right">M</TableHead>
                  <TableHead className="text-right">A</TableHead>
                  <TableHead className="text-right">P</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.topScorers.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right font-mono">{p.goals ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{p.assists ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {p.points ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GoaliesCard({ team }: { team: Briefing["home"] }) {
  const goalies = team.goalies ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · målvakter</CardTitle>
      </CardHeader>
      <CardContent>
        {goalies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inte tillgängligt.</p>
        ) : (
          <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Målvakt</TableHead>
                    <TableHead className="text-right">GP</TableHead>
                    <TableHead className="text-right">SV%</TableHead>
                    <TableHead className="text-right">GAA</TableHead>
                    <TableHead className="text-right">SO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goalies.map((g, i) => (
                    <TableRow key={i}>
                      <TableCell>{g.name}</TableCell>
                      <TableCell className="text-right font-mono">{g.gamesPlayed ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {g.savePct != null ? g.savePct.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {g.gaa != null ? g.gaa.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{g.shutouts ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

function SpecialTeamsCard({
  team,
  opponent,
}: {
  team: Briefing["home"];
  opponent: Briefing["home"];
}) {
  const fmtPct = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : "—");
  const renderEdge = (mine: number | null, theirs: number | null) => {
    if (mine == null || theirs == null) return null;
    const diff = mine - theirs;
    if (Math.abs(diff) < 0.05) {
      return (
        <Badge variant="secondary" className="mt-1">
          Jämnt
        </Badge>
      );
    }
    if (diff > 0) {
      return (
        <Badge variant="default" className="mt-1">
          +{diff.toFixed(1)}%
        </Badge>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · Special teams</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-semibold">{fmtPct(team.powerPlayPct)}</div>
            <div className="text-xs text-muted-foreground">Powerplay</div>
            {renderEdge(team.powerPlayPct, opponent.powerPlayPct)}
          </div>
          <div>
            <div className="text-2xl font-semibold">{fmtPct(team.penaltyKillPct)}</div>
            <div className="text-xs text-muted-foreground">Boxplay</div>
            {renderEdge(team.penaltyKillPct, opponent.penaltyKillPct)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Predictive / fun cards ----------

type TeamData = Briefing["home"];

function resultPoints(r: TeamData["lastFive"][number]["result"]): number {
  if (r === "W") return 3;
  if (r === "OTW") return 2;
  if (r === "OTL" || r === "T") return 1;
  return 0;
}

function venueWinRate(split: { results: ("W" | "T" | "L" | "OTW" | "OTL")[] } | null | undefined): number | null {
  if (!split || split.results.length === 0) return null;
  const pts = split.results.reduce((a, r) => {
    if (r === "W") return a + 3;
    if (r === "OTW") return a + 2;
    if (r === "OTL" || r === "T") return a + 1;
    return a;
  }, 0);
  return pts / (split.results.length * 3); // 0..1
}

function teamPpg(t: TeamData): number | null {
  if (t.points == null || !t.gamesPlayed) return null;
  return t.points / t.gamesPlayed;
}

function currentStreak(results: TeamData["lastFive"]): { type: string; count: number } | null {
  if (results.length === 0) return null;
  const norm = (r: string) => (r === "W" || r === "OTW" ? "W" : r === "L" || r === "OTL" ? "L" : r === "T" ? "T" : null);
  const first = norm(results[0].result);
  if (!first) return null;
  let count = 0;
  for (const g of results) {
    if (norm(g.result) === first) count++;
    else break;
  }
  return { type: first, count };
}

function WinProbabilityCard({ home, away }: { home: TeamData; away: TeamData }) {
  const homePpg = teamPpg(home);
  const awayPpg = teamPpg(away);
  const homeVenue = venueWinRate(home.venueForm?.home);
  const awayVenue = venueWinRate(away.venueForm?.away);

  let homeProb: number | null = null;
  if (homePpg != null && awayPpg != null) {
    // Blend overall PPG (max 3) with venue win rate, plus a small home-ice boost.
    const homeStrength = (homePpg / 3) * 0.7 + (homeVenue ?? homePpg / 3) * 0.3;
    const awayStrength = (awayPpg / 3) * 0.7 + (awayVenue ?? awayPpg / 3) * 0.3;
    const hAdj = homeStrength * 1.1; // home ice advantage
    homeProb = hAdj / (hAdj + awayStrength);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vinstchans</CardTitle>
      </CardHeader>
      <CardContent>
        {homeProb == null ? (
          <div className="text-sm text-muted-foreground">För lite data.</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{home.name}</span>
              <span className="tabular-nums">{(homeProb * 100).toFixed(0)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${(homeProb * 100).toFixed(1)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{away.name}</span>
              <span className="tabular-nums">{((1 - homeProb) * 100).toFixed(0)}%</span>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Baserat på poäng per match och form hemma/borta, med en hemmaplansfördel.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}



function HottestPlayerCard({ team, label }: { team: TeamData; label: string }) {
  // Real "hottest" = top points scorer over the team's last played games
  // (parsed from per-game scoring sheets on Swehockey).
  const player = team.hotPlayer;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Hetaste spelare · {team.name}{" "}
          <span className="text-xs font-normal text-muted-foreground">({label})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!player ? (
          <div className="text-sm text-muted-foreground">
            Ingen färsk poängdata.
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xl font-semibold">{player.name}</div>
              <Badge variant="default" className="tabular-nums">
                {player.points} p
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {player.goals} M · {player.assists} A på senaste {player.games}{" "}
              match{player.games === 1 ? "en" : "erna"}
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Flest poäng i laget under de senaste {player.games} spelade match
              {player.games === 1 ? "en" : "erna"}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StreakAlertsCard({ home, away }: { home: TeamData; away: TeamData }) {
  type Alert = { team: string; text: string; tone: "good" | "bad" | "neutral" };
  const alerts: Alert[] = [];

  const addOverall = (t: TeamData) => {
    const s = currentStreak(t.lastFive);
    if (s && s.count >= 2) {
      const word = s.type === "W" ? "vunnit" : s.type === "L" ? "förlorat" : "spelat oavgjort";
      alerts.push({
        team: t.name,
        text: `Har ${word} ${s.count} i rad`,
        tone: s.type === "W" ? "good" : s.type === "L" ? "bad" : "neutral",
      });
    }
  };

  const addVenue = (t: TeamData, side: "home" | "away") => {
    const v = t.venueForm?.[side]?.streak;
    if (v && v.count >= 2) {
      const word = v.type === "W" ? "vunnit" : v.type === "L" ? "förlorat" : "spelat oavgjort";
      alerts.push({
        team: t.name,
        text: `Har ${word} ${v.count} i rad ${side === "home" ? "hemma" : "borta"}`,
        tone: v.type === "W" ? "good" : v.type === "L" ? "bad" : "neutral",
      });
    }
  };

  const addLastFive = (t: TeamData) => {
    if (t.lastFive.length < 5) return;
    const wins = t.lastFive.filter((g) => g.result === "W" || g.result === "OTW").length;
    const s = currentStreak(t.lastFive);
    // Skip if the overall streak alert already conveys the same story
    if (wins >= 4) {
      if (s && s.type === "W" && s.count >= 4) return;
      alerts.push({ team: t.name, text: `${wins}–${5 - wins} senaste 5`, tone: "good" });
    } else if (wins <= 1) {
      if (s && s.type === "L" && s.count >= 4) return;
      alerts.push({ team: t.name, text: `${wins}–${5 - wins} senaste 5`, tone: "bad" });
    }
  };

  addOverall(home);
  addOverall(away);
  addVenue(home, "home");
  addVenue(away, "away");
  addLastFive(home);
  addLastFive(away);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sviter</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground">Inga noterbara sviter.</div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{a.team}</span>
                  <span className="text-muted-foreground"> · {a.text}</span>
                </span>
                <Badge
                  variant={a.tone === "good" ? "default" : a.tone === "bad" ? "destructive" : "secondary"}
                >
                  {a.tone === "good" ? "Het" : a.tone === "bad" ? "Kall" : "Obs"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}



// ---------- Historical depth section ----------

const allTimeH2HOptions = (home: string, away: string) =>
  queryOptions({
    queryKey: ["allTimeH2H", home, away],
    queryFn: () => getAllTimeHeadToHead({ data: { home, away } }),
    staleTime: 6 * 60 * 60 * 1000,
  });

const lastMeetingOptions = (home: string, away: string) =>
  queryOptions({
    queryKey: ["lastMeeting", home, away],
    queryFn: () => getLastMeetingRecap({ data: { home, away } }),
    staleTime: 6 * 60 * 60 * 1000,
  });

const trajectoryOptions = (team: string, season: string | undefined) =>
  queryOptions({
    queryKey: ["trajectory", season ?? "default", team],
    queryFn: () => getSeasonTrajectory({ data: { team, season } }),
    staleTime: 6 * 60 * 60 * 1000,
  });

function HistoricalDepthSection({
  home,
  away,
}: {
  home: TeamData;
  away: TeamData;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">Historiskt djup</h2>
      <LastMeetingCard home={home.name} away={away.name} />
    </section>
  );
}

function recordStr(r: { wins: number; ties: number; losses: number }) {
  return `${r.wins}-${r.ties}-${r.losses}`;
}

function AllTimeH2HCard({ home, away }: { home: string; away: string }) {
  const query = useQuery(allTimeH2HOptions(home, away));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alla tiders inbördes möten</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : query.error ? (
          <p className="text-sm text-destructive">
            Kunde inte ladda: {(query.error as Error).message}
          </p>
        ) : !query.data || query.data.meetings === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga tidigare möten hittades.
          </p>
        ) : (
          <AllTimeH2HBody home={home} away={away} data={query.data} />
        )}
      </CardContent>
    </Card>
  );
}

function AllTimeH2HBody({
  home,
  away,
  data,
}: {
  home: string;
  away: string;
  data: AllTimeH2HResult;
}) {
  const t = data.totals;
  const regWins = t.wins;
  const regLosses = t.losses;
  const summaryRecord = `${regWins + t.otWins}-${t.ties}-${regLosses + t.otLosses}`;
  const sc = data.seasonsCovered;
  const range =
    sc.count === 0
      ? ""
      : sc.from === sc.to
        ? sc.from!
        : `${sc.from} – ${sc.to}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums">{summaryRecord}</span>
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{home}</span> vs{" "}
          <span className="font-medium text-foreground">{away}</span>
          <span className="ml-2">({data.meetings} möte{data.meetings === 1 ? "" : "n"})</span>
        </span>
      </div>
      {t.otWins + t.otLosses > 0 ? (
        <div className="text-xs text-muted-foreground">
          inkl. {t.otWins} OT/SO-vinst{t.otWins === 1 ? "" : "er"} ·{" "}
          {t.otLosses} OT/SO-förlust{t.otLosses === 1 ? "" : "er"}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Hos {home}
          </div>
          <div className="mt-1 font-mono text-lg tabular-nums">
            {recordStr(data.atHome)}
          </div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Hos {away}
          </div>
          <div className="mt-1 font-mono text-lg tabular-nums">
            {recordStr(data.atAway)}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Över {sc.count} säsong{sc.count === 1 ? "" : "er"}
        {range ? ` (${range})` : ""}. Statistik från {home}s perspektiv (V-O-F, OT räknas som V/F).
      </div>
    </div>
  );
}


function todayInStockholm(): string {
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

function PostgameRecapCard({
  home,
  away,
  onBackToBriefing,
}: {
  home: string;
  away: string;
  onBackToBriefing: () => void;
}) {
  const query = useQuery(lastMeetingOptions(home, away));
  const queryClient = useQueryClient();
  const [forcing, setForcing] = useState(false);
  const [autoRefreshedAt, setAutoRefreshedAt] = useState<string | null>(null);
  const handleGameFinished = async () => {
    setForcing(true);
    try {
      const fresh = await getLastMeetingRecap({ data: { home, away, force: true } });
      queryClient.setQueryData(["lastMeeting", home, away], fresh);
      setAutoRefreshedAt(new Date().toISOString());
    } finally {
      setForcing(false);
    }
  };
  const today = todayInStockholm();
  const recapData = query.data as LastMeetingRecapResult;
  const isTodaysGame = !!recapData && recapData.date === today;
  const initialSig = recapData
    ? `${recapData.homeGoals}-${recapData.awayGoals}-${recapData.goals.length}`
    : "";

  // Auto-refresh a few minutes after the game shows Final (recap.date === today).
  // The league feed marks the game as played once Final; we poll every 3 min and
  // stop after 2 consecutive identical results (or after ~30 min).
  useEffect(() => {
    if (!isTodaysGame) return;
    let stable = 0;
    let attempts = 0;
    let last = initialSig;
    const tick = async () => {
      attempts += 1;
      try {
        const fresh = await getLastMeetingRecap({
          data: { home, away, force: true },
        });
        queryClient.setQueryData(["lastMeeting", home, away], fresh);
        setAutoRefreshedAt(new Date().toISOString());
        const sig = fresh
          ? `${fresh.homeGoals}-${fresh.awayGoals}-${fresh.goals.length}`
          : "";
        if (sig === last) stable += 1;
        else {
          stable = 0;
          last = sig;
        }
      } catch {
        /* retry next tick */
      }
      if (stable >= 2 || attempts >= 10) clearInterval(handle);
    };
    const handle = setInterval(tick, 3 * 60 * 1000);
    return () => clearInterval(handle);
  }, [isTodaysGame, initialSig, home, away, queryClient]);
  const recap = query.data as LastMeetingRecapResult;
  if (!recap) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Postgame
            </Badge>
            Match avslutad?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 gap-1 text-muted-foreground hover:text-foreground"
            onClick={onBackToBriefing}
          >
            <ChevronLeft className="h-4 w-4" />
            Tillbaka till briefing
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Tryck när matchen är slutspelad så hämtas en färsk recap med aktuell statistik.
            </p>
            <Button size="sm" onClick={handleGameFinished} disabled={forcing}>
              {forcing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Match avslutad – hämta recap
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }


  type Tally = { goals: number; assists: number; teamCode: string };
  const tally = new Map<string, Tally>();
  for (const goal of recap.goals) {
    const sc = tally.get(goal.scorer) ?? { goals: 0, assists: 0, teamCode: goal.teamCode };
    sc.goals += 1;
    sc.teamCode = goal.teamCode;
    tally.set(goal.scorer, sc);
    for (const a of goal.assists) {
      const ac = tally.get(a) ?? { goals: 0, assists: 0, teamCode: goal.teamCode };
      ac.assists += 1;
      ac.teamCode = goal.teamCode;
      tally.set(a, ac);
    }
  }
  const topScorers = [...tally.entries()]
    .map(([name, v]) => ({ name, ...v, points: v.goals + v.assists }))
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : b.goals - a.goals))
    .slice(0, 5);
  const hatTricks = [...tally.entries()]
    .filter(([, v]) => v.goals >= 3)
    .map(([name, v]) => ({ name, goals: v.goals, teamCode: v.teamCode }));

  const winner =
    recap.homeGoals > recap.awayGoals
      ? recap.homeTeam
      : recap.awayGoals > recap.homeGoals
        ? recap.awayTeam
        : null;

  // Map team code -> team name (home/away) by counting per-team goals
  const homeCode = (() => {
    const counts = new Map<string, number>();
    for (const g of recap.goals) counts.set(g.teamCode, (counts.get(g.teamCode) ?? 0) + 1);
    // Pair codes with totals: the code whose count matches homeGoals wins
    for (const [code, n] of counts) if (n === recap.homeGoals && code) return code;
    return null;
  })();
  const awayCode = (() => {
    const counts = new Map<string, number>();
    for (const g of recap.goals) counts.set(g.teamCode, (counts.get(g.teamCode) ?? 0) + 1);
    for (const [code, n] of counts) if (n === recap.awayGoals && code) return code;
    return null;
  })();

  // Period-by-period scoring
  const periodOrder = ["1", "2", "3", "OT", "SO"] as const;
  type PeriodKey = (typeof periodOrder)[number];
  const normalizePeriod = (p: string | null): PeriodKey | null => {
    if (!p) return null;
    const s = p.trim().toUpperCase();
    if (s.startsWith("1")) return "1";
    if (s.startsWith("2")) return "2";
    if (s.startsWith("3")) return "3";
    if (s.includes("OT") || s.includes("ÖVERTID") || s.includes("EXTRA")) return "OT";
    if (s.includes("SO") || s.includes("STRAFF")) return "SO";
    return null;
  };
  const periodScores = new Map<PeriodKey, { home: number; away: number }>();
  // Always show regulation periods, even when no goals were scored.
  for (const p of ["1", "2", "3"] as PeriodKey[]) {
    periodScores.set(p, { home: 0, away: 0 });
  }
  // Seed OT / GWS rows whenever the source data flagged that the game went
  // there — even if the deciding goal was missing from the event feed (the
  // shootout decider, for instance, is not always emitted as a "Total goals
  // scored" row).
  if (recap.wentToOvertime) {
    periodScores.set("OT", { home: 0, away: 0 });
  }
  if (recap.wentToShootout) {
    periodScores.set("SO", { home: 0, away: 0 });
  }
  for (const g of recap.goals) {
    const k = normalizePeriod(g.period);
    if (!k) continue;
    const slot = periodScores.get(k) ?? { home: 0, away: 0 };
    if (homeCode && g.teamCode === homeCode) slot.home += 1;
    else slot.away += 1;
    periodScores.set(k, slot);
  }
  // If the final score exceeds the sum of recorded period goals, assign the
  // missing goal(s) to the explicit overtime/shootout bucket (the deciding
  // GWS goal is commonly absent from the event feed).
  {
    let sumHome = 0;
    let sumAway = 0;
    for (const s of periodScores.values()) {
      sumHome += s.home;
      sumAway += s.away;
    }
    const extraHome = Math.max(0, recap.homeGoals - sumHome);
    const extraAway = Math.max(0, recap.awayGoals - sumAway);
    if (extraHome > 0 || extraAway > 0) {
      const targetKey: PeriodKey | null = recap.wentToShootout
        ? "SO"
        : recap.wentToOvertime
          ? "OT"
          : null;
      if (targetKey) {
        const slot = periodScores.get(targetKey) ?? { home: 0, away: 0 };
        slot.home += extraHome;
        slot.away += extraAway;
        periodScores.set(targetKey, slot);
      }
    }
  }
  const periodsPlayed = periodOrder.filter((p) => periodScores.has(p));

  // First goal & game-winning goal
  const firstGoal = recap.goals[0] ?? null;
  let runningHome = 0;
  let runningAway = 0;
  let gwgIdx = -1;
  let gwgHome = 0;
  let gwgAway = 0;
  const finalWinnerIsHome = recap.homeGoals > recap.awayGoals;
  const finalWinnerIsAway = recap.awayGoals > recap.homeGoals;
  const losingTotal = finalWinnerIsHome
    ? recap.awayGoals
    : finalWinnerIsAway
      ? recap.homeGoals
      : -1;
  for (let i = 0; i < recap.goals.length; i++) {
    const g = recap.goals[i];
    if (homeCode && g.teamCode === homeCode) runningHome += 1;
    else runningAway += 1;
    if (finalWinnerIsHome && runningHome === losingTotal + 1 && gwgIdx === -1) {
      gwgIdx = i;
      gwgHome = runningHome;
      gwgAway = runningAway;
    }
    if (finalWinnerIsAway && runningAway === losingTotal + 1 && gwgIdx === -1) {
      gwgIdx = i;
      gwgHome = runningHome;
      gwgAway = runningAway;
    }
  }
  const gwg = gwgIdx >= 0 ? recap.goals[gwgIdx] : null;

  // Lead changes & largest lead
  let leadChanges = 0;
  let lastLeader: "home" | "away" | "tie" = "tie";
  let largestLead = 0;
  let largestLeadLeader: "home" | "away" | null = null;
  let largestLeadGoal: (typeof recap.goals)[number] | null = null;
  let largestLeadHome = 0;
  let largestLeadAway = 0;
  runningHome = 0;
  runningAway = 0;
  for (const g of recap.goals) {
    if (homeCode && g.teamCode === homeCode) runningHome += 1;
    else runningAway += 1;
    const diff = runningHome - runningAway;
    if (Math.abs(diff) > largestLead) {
      largestLead = Math.abs(diff);
      largestLeadLeader = diff > 0 ? "home" : "away";
      largestLeadGoal = g;
      largestLeadHome = runningHome;
      largestLeadAway = runningAway;
    }
    const leader: "home" | "away" | "tie" =
      diff > 0 ? "home" : diff < 0 ? "away" : "tie";
    if (leader !== "tie" && lastLeader !== "tie" && leader !== lastLeader) {
      leadChanges += 1;
    }
    if (leader !== "tie") lastLeader = leader;
  }
  const largestLeadTeamCode = largestLeadLeader === "home" ? homeCode : largestLeadLeader === "away" ? awayCode : null;

  const formatTime = (t: string | null) => (t ? t.replace(/\s+/g, "") : "");

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            <Badge variant="default" className="text-[10px] uppercase tracking-wide">
              Senaste mötet
            </Badge>
            <span>Postgame-recap · {recap.date}</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              · uppdaterad {new Date(query.dataUpdatedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {isTodaysGame && (
              <span className="text-[10px] font-normal text-muted-foreground">
                {autoRefreshedAt
                  ? `· auto-uppdaterad ${new Date(autoRefreshedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`
                  : "· auto-uppdaterar var 3:e min"}
              </span>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={handleGameFinished} disabled={forcing}>
            {forcing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Match avslutad – uppdatera
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1 text-muted-foreground hover:text-foreground"
          onClick={onBackToBriefing}
        >
          <ChevronLeft className="h-4 w-4" />
          Tillbaka till briefing
        </Button>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="text-base inline-flex items-baseline gap-4">
            <span className="font-medium">{recap.homeTeam}</span>
            <span className="font-mono text-xl tabular-nums">
              {recap.homeGoals} – {recap.awayGoals}
            </span>
            <span className="font-medium">{recap.awayTeam}</span>
          </div>
        </div>

        {(largestLead > 0 || leadChanges > 0 || recap.goals.length > 0) && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-primary">
              Matchhöjdpunkter
            </div>
            <p className="leading-relaxed text-foreground">
              {(() => {
                const leaderName =
                  largestLeadLeader === "home" ? recap.homeTeam : recap.awayTeam;
                const parts: string[] = [];
                if (largestLead > 0) {
                  const when = largestLeadGoal
                    ? ` (P${normalizePeriod(largestLeadGoal.period) ?? "?"}${largestLeadGoal.time ? ` ${formatTime(largestLeadGoal.time)}` : ""})`
                    : "";
                  parts.push(
                    `${leaderName} ledde med som mest ${largestLead} mål (${largestLeadHome}–${largestLeadAway})${when}.`
                  );
                }
                if (leadChanges === 0) {
                  if (lastLeader === "home") {
                    parts.push(`${recap.homeTeam} ledde matchen från start till mål.`);
                  } else if (lastLeader === "away") {
                    parts.push(`${recap.awayTeam} ledde matchen från start till mål.`);
                  } else {
                    parts.push("Inget av lagen kunde ta ett bestående grepp om matchen.");
                  }
                } else {
                  parts.push(
                    `Ledningen byttes ${leadChanges} gång${leadChanges > 1 ? "er" : ""}${leadChanges >= 2 ? " i en jämn och växlingsrik match" : ""}.`
                  );
                }
                return parts.join(" ");
              })()}
            </p>
          </div>
        )}

        {periodsPlayed.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Per period
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {periodsPlayed.map((p) => {
                const s = periodScores.get(p)!;
                const label = p === "OT" ? "OT" : p === "SO" ? "GWS" : `P${p}`;
                return (
                  <div
                    key={p}
                    className="rounded-md border border-border/60 bg-background/40 px-2 py-1 font-mono text-xs tabular-nums"
                  >
                    <span className="mr-1 text-muted-foreground">{label}</span>
                    {s.home}–{s.away}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {firstGoal && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Första målet
              </div>
              <div className="font-medium">{firstGoal.teamCode}</div>
              <div className="truncate text-xs text-muted-foreground">
                {firstGoal.scorer}
                {firstGoal.time ? ` · ${formatTime(firstGoal.time)}` : ""}
              </div>
            </div>
          )}
          {gwg && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Avgörande mål
              </div>
              <div className="font-medium">{gwg.teamCode}</div>
              <div className="truncate text-xs text-muted-foreground">
                {gwg.scorer}
                {` · ${gwgHome}-${gwgAway}`}
                {gwg.period
                  ? ` · P${normalizePeriod(gwg.period) ?? "?"}${gwg.time ? ` ${formatTime(gwg.time)}` : ""}`
                  : ""}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Största ledning
            </div>
            <div className="font-mono text-base tabular-nums">+{largestLead}</div>
            <div className="truncate text-xs text-muted-foreground">
              {largestLeadTeamCode ?? "–"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Ledningsbyten
            </div>
            <div className="font-mono text-base tabular-nums">{leadChanges}</div>
          </div>
        </div>

        {hatTricks.length > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs">
            <span className="mr-1 font-semibold uppercase tracking-wide text-primary">
              Hat-trick
            </span>
            {hatTricks.map((h, i) => (
              <span key={h.name}>
                {i > 0 ? ", " : ""}
                {h.name} ({h.teamCode}, {h.goals}M)
              </span>
            ))}
          </div>
        )}

        {topScorers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga måldata tillgängliga ännu.</p>
        ) : (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Topp-poängplockare
            </div>
            <ul className="space-y-1 text-sm">
              {topScorers.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    <span className="mr-2 inline-block min-w-[2.5rem] font-mono text-xs text-muted-foreground">
                      {p.teamCode}
                    </span>
                    {p.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {p.goals}M {p.assists}A
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <a
          href={recap.gameUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-xs text-primary hover:underline"
        >
          Matchprotokoll ↗
        </a>
      </CardContent>
    </Card>
  );
}


function LastMeetingCard({ home, away }: { home: string; away: string }) {

  const query = useQuery(lastMeetingOptions(home, away));
  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Senaste mötet</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Senaste mötet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Kunde inte ladda: {(query.error as Error).message}
          </p>
        </CardContent>
      </Card>
    );
  }
  const recap = query.data as LastMeetingRecapResult;
  if (!recap) return null;

  // Aggregate per-player goals + assists from the goal events.
  type Tally = { goals: number; assists: number; teamCode: string };
  const tally = new Map<string, Tally>();
  for (const goal of recap.goals) {
    const sc = tally.get(goal.scorer) ?? {
      goals: 0,
      assists: 0,
      teamCode: goal.teamCode,
    };
    sc.goals += 1;
    sc.teamCode = goal.teamCode;
    tally.set(goal.scorer, sc);
    for (const a of goal.assists) {
      const ac = tally.get(a) ?? {
        goals: 0,
        assists: 0,
        teamCode: goal.teamCode,
      };
      ac.assists += 1;
      ac.teamCode = goal.teamCode;
      tally.set(a, ac);
    }
  }
  const topScorers = [...tally.entries()]
    .map(([name, v]) => ({ name, ...v, points: v.goals + v.assists }))
    .sort((a, b) =>
      b.points !== a.points ? b.points - a.points : b.goals - a.goals,
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Senaste mötet · {recap.date}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({recap.seasonLabel})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-base">
            <span className="font-medium">{recap.homeTeam}</span>{" "}
            <span className="font-mono text-xl tabular-nums">
              {recap.homeGoals} – {recap.awayGoals}
            </span>{" "}
            <span className="font-medium">{recap.awayTeam}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            hos {recap.homeTeam}
          </Badge>
        </div>

        {topScorers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga måldata tillgängliga.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {topScorers.map((p) => (
              <li
                key={p.name}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="truncate">
                  <span className="mr-2 inline-block min-w-[2.5rem] font-mono text-xs text-muted-foreground">
                    {p.teamCode}
                  </span>
                  {p.name}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {p.goals}M {p.assists}A
                </span>
              </li>
            ))}
          </ul>
        )}

        <a
          href={recap.gameUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-xs text-primary hover:underline"
        >
          Matchprotokoll ↗
        </a>
      </CardContent>
    </Card>
  );
}

function SeasonTrajectoryCard({
  team,
  label,
}: {
  team: string;
  label: string;
}) {
  const query = useQuery(trajectoryOptions(team, undefined));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {team} · utveckling{" "}
          <span className="text-xs font-normal text-muted-foreground">({label})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : query.error ? (
          <p className="text-sm text-destructive">
            Kunde inte ladda: {(query.error as Error).message}
          </p>
        ) : !query.data || query.data.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga spelade matcher än.</p>
        ) : (
          <TrajectoryChart data={query.data} />
        )}
      </CardContent>
    </Card>
  );
}

function TrajectoryChart({ data }: { data: SeasonTrajectoryResult }) {
  const last = data.points[data.points.length - 1];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>5-matchers rullande PPM</span>
        <span className="tabular-nums">
          {last.rollingPpg.toFixed(2)} nu · säsong {last.cumulativePpg.toFixed(2)}
        </span>
      </div>
      <div className="h-32 w-full">
        <TrajectoryChartInner data={data} />
      </div>
      {data.leagueAveragePpg != null ? (
        <div className="text-xs text-muted-foreground">
          Ligamedel: {data.leagueAveragePpg.toFixed(2)} PPM (streckad linje)
        </div>
      ) : null}
    </div>
  );
}

function TrajectoryChartInner({ data }: { data: SeasonTrajectoryResult }) {
  // recharts is a runtime-only import to keep the route bundle lean.
  const [Components, setComponents] = useState<null | typeof import("recharts")>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    import("recharts").then((mod) => {
      if (!cancelled) setComponents(mod);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!Components) return <Skeleton className="h-full w-full" />;
  const {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine,
    CartesianGrid,
  } = Components;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.points} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="gameNumber"
          tick={{ fontSize: 10 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis
          domain={[0, 3]}
          ticks={[0, 1, 2, 3]}
          tick={{ fontSize: 10 }}
          stroke="hsl(var(--muted-foreground))"
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelFormatter={(value, payload) => {
            const date = payload?.[0]?.payload?.date;
            return `Match ${value}${date ? ` · ${date}` : ""}`;
          }}
          formatter={(v: number) => [v.toFixed(2), "5-matchers PPM"]}
        />
        {data.leagueAveragePpg != null ? (
          <ReferenceLine
            y={data.leagueAveragePpg}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
          />
        ) : null}
        <Line
          type="monotone"
          dataKey="rollingPpg"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

type Pending = {
  id: string;
  label: string;
  competitionId: string;
  detectedAt: string;
};

function PendingSeasonsBanner({
  pending,
  onChanged,
}: {
  pending: Pending[];
  onChanged: () => void;
}) {
  if (pending.length === 0) return null;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4 text-primary" />
          Ny{pending.length > 1 ? "a" : ""} säsong{pending.length > 1 ? "er" : ""} upptäckt på swehockey.se
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Granska och bekräfta innan appen börjar hämta data. Du kan justera
          tävlings-ID om det upptäckta är fel.
        </p>
        {pending.map((p) => (
          <PendingSeasonRow key={p.id} item={p} onChanged={onChanged} />
        ))}
      </CardContent>
    </Card>
  );
}

function PendingSeasonRow({
  item,
  onChanged,
}: {
  item: Pending;
  onChanged: () => void;
}) {
  const confirmFn = useServerFn(confirmSeasonDetection);
  const dismissFn = useServerFn(dismissSeasonDetection);
  const [compId, setCompId] = useState(item.competitionId);
  const [busy, setBusy] = useState<null | "confirm" | "dismiss">(null);
  const [err, setErr] = useState<string | null>(null);

  const confirm = async () => {
    setBusy("confirm");
    setErr(null);
    try {
      await confirmFn({ data: { id: item.id, competitionId: compId } });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const dismiss = async () => {
    setBusy("dismiss");
    setErr(null);
    try {
      await dismissFn({ data: { id: item.id } });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Säsong
          </div>
          <div className="font-mono text-base">{item.label}</div>
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tävlings-ID
          </label>
          <Input
            value={compId}
            onChange={(e) => setCompId(e.target.value)}
            inputMode="numeric"
            className="font-mono"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={busy !== null}>
            <Check className="mr-1 h-4 w-4" />
            {busy === "confirm" ? "Lägger till…" : "Lägg till"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={dismiss}
            disabled={busy !== null}
          >
            <X className="mr-1 h-4 w-4" />
            Avfärda
          </Button>
        </div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Upptäckt {new Date(item.detectedAt).toLocaleString("sv-SE")}
      </div>
      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

// ---------- Quick-win duel cards ----------

function fmtPct1(v: number | null | undefined): string {
  return v != null ? `${v.toFixed(1)}%` : "—";
}



function ShotVolumeCard({
  home,
  away,
}: {
  home: Briefing["home"];
  away: Briefing["home"];
}) {
  // Aggregate shots-against and games from all goalies on the roster.
  // shotsAgainst / gamesPlayed (summed across goalies) ≈ opponent SOG per game.
  const aggregate = (team: Briefing["home"]) => {
    const goalies = team.goalies ?? [];
    let shots = 0;
    let saves = 0;
    let gp = 0;
    let valid = false;
    for (const g of goalies) {
      if (g.shotsAgainst != null && g.gamesPlayed != null && g.gamesPlayed > 0) {
        shots += g.shotsAgainst;
        gp += g.gamesPlayed;
        if (g.saves != null) saves += g.saves;
        valid = true;
      }
    }
    if (!valid || gp === 0) {
      return { shotsAgainstPerGame: null, teamSavePct: null };
    }
    return {
      shotsAgainstPerGame: shots / gp,
      teamSavePct: shots > 0 ? (saves / shots) * 100 : null,
    };
  };

  const h = aggregate(home);
  const a = aggregate(away);

  const fmt = (n: number | null, digits = 1) =>
    n != null ? n.toFixed(digits) : "—";

  // Lower shots-against per game = better defense.
  const defenseEdge: "home" | "away" | "even" | null =
    h.shotsAgainstPerGame == null || a.shotsAgainstPerGame == null
      ? null
      : Math.abs(h.shotsAgainstPerGame - a.shotsAgainstPerGame) < 0.5
        ? "even"
        : h.shotsAgainstPerGame < a.shotsAgainstPerGame
          ? "home"
          : "away";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skottvolym mot</CardTitle>
        <p className="text-xs text-muted-foreground">
          Snitt skott på mål per match som lagets målvakter mött i år. Lägre = bättre defensiv skottreduktion.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className={`text-right ${defenseEdge === "home" ? "font-semibold" : ""}`}>
            <div className="text-xs text-muted-foreground">{home.name}</div>
            <div className="font-mono text-2xl">{fmt(h.shotsAgainstPerGame)}</div>
            <div className="text-xs text-muted-foreground">
              SV% {fmt(h.teamSavePct, 2)}
            </div>
          </div>
          <div className="text-center text-xs text-muted-foreground">vs</div>
          <div className={defenseEdge === "away" ? "font-semibold" : ""}>
            <div className="text-xs text-muted-foreground">{away.name}</div>
            <div className="font-mono text-2xl">{fmt(a.shotsAgainstPerGame)}</div>
            <div className="text-xs text-muted-foreground">
              SV% {fmt(a.teamSavePct, 2)}
            </div>
          </div>
        </div>
        <div className="mt-3 text-center">
          {defenseEdge === "even" ? (
            <Badge variant="secondary">Jämnt</Badge>
          ) : defenseEdge == null ? (
            <Badge variant="outline">Saknar data</Badge>
          ) : (
            <Badge variant="default">
              Fördel {defenseEdge === "home" ? home.name : away.name}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}



function lastFivePpg(team: Briefing["home"]): number | null {
  if (!team.lastFive || team.lastFive.length === 0) return null;
  const pts = team.lastFive.reduce((a, g) => a + resultPoints(g.result), 0);
  return pts / team.lastFive.length;
}

function FormTrendCard({ team }: { team: Briefing["home"] }) {
  const recent = lastFivePpg(team);
  const season = teamPpg(team);
  const diff = recent != null && season != null ? recent - season : null;
  const arrow = diff == null ? "→" : diff > 0.15 ? "▲" : diff < -0.15 ? "▼" : "→";
  const tone = diff == null ? "text-muted-foreground" : diff > 0.15 ? "text-emerald-500" : diff < -0.15 ? "text-rose-500" : "text-muted-foreground";
  const label = diff == null ? "Saknar data" : diff > 0.15 ? "Stigande form" : diff < -0.15 ? "Sjunkande form" : "Stabil form";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · formtrend</CardTitle>
        <p className="text-xs text-muted-foreground">Senaste 5 matcherna jämfört med säsongssnittet (poäng/match).</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Senaste 5</div>
            <div className="font-mono text-2xl tabular-nums">{recent != null ? recent.toFixed(2) : "—"}</div>
          </div>
          <div className={`text-3xl ${tone}`}>{arrow}</div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Säsong</div>
            <div className="font-mono text-2xl tabular-nums">{season != null ? season.toFixed(2) : "—"}</div>
          </div>
        </div>
        <div className="mt-3 text-center">
          <Badge variant={diff == null ? "outline" : Math.abs(diff) > 0.15 ? "default" : "secondary"}>{label}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function parseGameDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Try ISO first
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  // Try YYYY-MM-DD inside the string
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  // Try DD/MM or DD/MM-YYYY
  const m2 = s.match(/(\d{1,2})\/(\d{1,2})(?:[-\s](\d{2,4}))?/);
  if (m2) {
    const day = parseInt(m2[1], 10);
    const mon = parseInt(m2[2], 10) - 1;
    const yr = m2[3] ? (m2[3].length === 2 ? 2000 + parseInt(m2[3], 10) : parseInt(m2[3], 10)) : new Date().getFullYear();
    const d = new Date(yr, mon, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function daysSinceLast(team: Briefing["home"]): { days: number | null; date: Date | null } {
  const first = team.lastFive?.[0];
  const d = parseGameDate(first?.date);
  if (!d) return { days: null, date: null };
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  return { days: Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24))), date: d };
}

function RestDaysCard({ home, away }: { home: Briefing["home"]; away: Briefing["home"] }) {
  const h = daysSinceLast(home);
  const a = daysSinceLast(away);
  const edge: "home" | "away" | "even" | null =
    h.days == null || a.days == null
      ? null
      : h.days === a.days
        ? "even"
        : h.days > a.days
          ? "home"
          : "away";
  const fmt = (n: number | null) => (n == null ? "—" : n === 0 ? "Idag" : n === 1 ? "1 dag" : `${n} dagar`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vila sedan senaste match</CardTitle>
        <p className="text-xs text-muted-foreground">Fler vilodagar = piggare lag. Back-to-back kan vara en nackdel.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className={`text-right ${edge === "home" ? "font-semibold" : ""}`}>
            <div className="text-xs text-muted-foreground">{home.name}</div>
            <div className="font-mono text-2xl">{fmt(h.days)}</div>
            {h.days != null && h.days <= 1 ? <Badge variant="destructive" className="mt-1">Back-to-back</Badge> : null}
          </div>
          <div className="text-center text-xs text-muted-foreground">vs</div>
          <div className={edge === "away" ? "font-semibold" : ""}>
            <div className="text-xs text-muted-foreground">{away.name}</div>
            <div className="font-mono text-2xl">{fmt(a.days)}</div>
            {a.days != null && a.days <= 1 ? <Badge variant="destructive" className="mt-1">Back-to-back</Badge> : null}
          </div>
        </div>
        <div className="mt-3 text-center">
          {edge === "even" ? (
            <Badge variant="secondary">Lika utvilade</Badge>
          ) : edge == null ? (
            <Badge variant="outline">Saknar data</Badge>
          ) : (
            <Badge variant="default">Fördel {edge === "home" ? home.name : away.name}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function strongestPeriod(team: Briefing["home"]): { label: string; perGame: number } | null {
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

function DisciplineCard({ home, away }: { home: Briefing["home"]; away: Briefing["home"] }) {
  const fmt = (n: number | null | undefined, digits = 1) =>
    n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
  const edge: "home" | "away" | "even" | null =
    home.discipline && away.discipline
      ? home.discipline.perGame === away.discipline.perGame
        ? "even"
        : home.discipline.perGame < away.discipline.perGame
          ? "home"
          : "away"
      : null;
  const renderTeam = (team: Briefing["home"], side: "home" | "away") => {
    const d = team.discipline;
    const disciplined = edge === side;
    return (
      <div className={disciplined ? "font-semibold" : ""}>
        <div className="text-xs text-muted-foreground">{team.name}</div>
        <div className="font-mono text-2xl">{fmt(d?.perGame ?? null)}</div>
        <div className="text-[11px] text-muted-foreground">
          {d ? `${d.totalPim} PIM / ${d.gamesPlayed} GP` : "Saknar data"}
        </div>
        {d && d.topOffenders.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-xs">
            {d.topOffenders.map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <span className="font-mono text-muted-foreground">{p.pim}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Disciplin</CardTitle>
        <p className="text-xs text-muted-foreground">
          Utvisningsminuter per match. Färre minuter = färre PP-chanser till motståndaren.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {renderTeam(home, "home")}
          {renderTeam(away, "away")}
        </div>
        {edge == null && (
          <div className="mt-3 text-center">
            <Badge variant="outline">Saknar data</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


