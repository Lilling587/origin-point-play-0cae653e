import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeamLogo } from "@/components/team-logo";
import { getNextMatchForTeam } from "@/lib/stats.functions";

function formatSwedishDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function useCountdown(targetIso: string | null | undefined): string {
  const target = useMemo(() => {
    if (!targetIso) return null;
    const d = new Date(targetIso + "T19:00:00"); // antar kvällsmatch
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }, [targetIso]);

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return "";
  const diff = target - now;
  if (diff <= 0) return "Pågår eller spelad";
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `om ${days}d ${hours}h`;
  if (hours > 0) return `om ${hours}h`;
  const minutes = Math.floor(diff / (60 * 1000));
  return `om ${minutes} min`;
}

export function NextMatchCard({
  team,
  season,
}: {
  team: string;
  season: string;
}) {
  const fetchNext = useServerFn(getNextMatchForTeam);
  const navigate = useNavigate({ from: "/" });

  const query = useQuery({
    queryKey: ["next-match", team, season],
    queryFn: () => fetchNext({ data: { team, season } }),
    enabled: !!team && !!season,
    staleTime: 30 * 60 * 1000,
  });

  const match = query.data?.match;
  const countdown = useCountdown(match?.date ?? null);

  if (!team) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          Nästa match · {team}
        </CardTitle>
        {countdown ? (
          <Badge variant="outline" className="font-mono text-xs">
            {countdown}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Letar efter nästa match…
          </div>
        ) : !match ? (
          <p className="text-sm text-muted-foreground">
            Ingen kommande match hittad för säsongen.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <TeamLogo team={match.homeTeam} size="md" />
              <span className="truncate font-semibold">{match.homeTeam}</span>
              <span className="text-muted-foreground">vs</span>
              <TeamLogo team={match.awayTeam} size="md" />
              <span className="truncate font-semibold">{match.awayTeam}</span>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <span className="text-xs text-muted-foreground">
                {formatSwedishDate(match.date)} · {match.isHome ? "Hemma" : "Borta"}
              </span>
              <Button
                size="sm"
                onClick={() =>
                  navigate({
                    search: () => ({
                      home: match.homeTeam,
                      away: match.awayTeam,
                    }),
                    replace: false,
                  })
                }
              >
                Ladda briefing
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
