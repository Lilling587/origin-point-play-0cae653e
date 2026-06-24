import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { currentStreak, type TeamData } from "@/lib/dashboard-utils";

export function StreakAlertsCard({ home, away }: { home: TeamData; away: TeamData }) {
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
