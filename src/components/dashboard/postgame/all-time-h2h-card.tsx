import { useQuery } from "@tanstack/react-query";
import type { AllTimeH2HResult } from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { recordStr } from "@/lib/dashboard-utils";
import { allTimeH2HOptions } from "./query-options";

export function AllTimeH2HCard({ home, away }: { home: string; away: string }) {
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
