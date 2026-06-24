import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lastFivePpg, teamPpg, type TeamData } from "@/lib/dashboard-utils";

export function FormTrendCard({ team }: { team: TeamData }) {
  const recent = lastFivePpg(team);
  const season = teamPpg(team);
  const diff = recent != null && season != null ? recent - season : null;
  const arrow = diff == null ? "→" : diff > 0.15 ? "▲" : diff < -0.15 ? "▼" : "→";
  const tone =
    diff == null
      ? "text-muted-foreground"
      : diff > 0.15
        ? "text-emerald-500"
        : diff < -0.15
          ? "text-rose-500"
          : "text-muted-foreground";
  const label =
    diff == null
      ? "Saknar data"
      : diff > 0.15
        ? "Stigande form"
        : diff < -0.15
          ? "Sjunkande form"
          : "Stabil form";
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
