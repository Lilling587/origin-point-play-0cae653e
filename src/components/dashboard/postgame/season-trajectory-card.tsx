import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SeasonTrajectoryResult } from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trajectoryOptions } from "./query-options";

export function SeasonTrajectoryCard({
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
