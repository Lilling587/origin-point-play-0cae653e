import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resultLabel, resultVariant, type TeamData } from "@/lib/dashboard-utils";

export function FormCard({ team }: { team: TeamData }) {
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
