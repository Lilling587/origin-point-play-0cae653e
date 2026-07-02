import { createFileRoute } from "@tanstack/react-router";
import { getActivePublication } from "@/lib/vmix.functions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=15",
  "Content-Type": "application/json; charset=utf-8",
};

export const Route = createFileRoute("/api/public/vmix/standings")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () => {
        const pub = await getActivePublication();
        const payload = pub
          ? {
              published: true,
              updatedAt: pub.updatedAt,
              game: {
                date: pub.gameDate,
                home: pub.homeTeam,
                away: pub.awayTeam,
              },
              standings: pub.standings ?? [],
            }
          : {
              published: false,
              updatedAt: new Date().toISOString(),
              standings: [],
            };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: CORS_HEADERS,
        });
      },
    },
  },
});
