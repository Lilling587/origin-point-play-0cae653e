import type { TeamData } from "@/lib/dashboard-utils";
import { LastMeetingCard } from "./last-meeting-card";

export function HistoricalDepthSection({
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
