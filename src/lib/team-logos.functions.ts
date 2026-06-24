import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getTeamLogos = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ logos: Record<string, string>; fetchedAt: string }> => {
    const { fetchAllCachedLogos } = await import("./team-logos.server");
    const logos = await fetchAllCachedLogos();
    return { logos, fetchedAt: new Date().toISOString() };
  },
);

export const ensureTeamLogo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ team: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ team: string; url: string | null }> => {
    const { ensureLogoForTeam } = await import("./team-logos.server");
    const url = await ensureLogoForTeam(data.team);
    return { team: data.team, url };
  });
