import { useQuery } from "@tanstack/react-query";
import type { LastMeetingRecapResult } from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { lastMeetingOptions } from "./query-options";

export function LastMeetingCard({ home, away }: { home: string; away: string }) {
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
