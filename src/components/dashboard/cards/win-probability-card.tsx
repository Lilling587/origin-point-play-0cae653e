import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { teamPpg, venueWinRate, type TeamData } from "@/lib/dashboard-utils";

export function WinProbabilityCard({ home, away }: { home: TeamData; away: TeamData }) {
  const homePpg = teamPpg(home);
  const awayPpg = teamPpg(away);
  const homeVenue = venueWinRate(home.venueForm?.home);
  const awayVenue = venueWinRate(away.venueForm?.away);

  let homeProb: number | null = null;
  if (homePpg != null && awayPpg != null) {
    const homeStrength = (homePpg / 3) * 0.7 + (homeVenue ?? homePpg / 3) * 0.3;
    const awayStrength = (awayPpg / 3) * 0.7 + (awayVenue ?? awayPpg / 3) * 0.3;
    const hAdj = homeStrength * 1.1;
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
