import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// ---------- Admin ----------

export type TeamLogoStatus = {
  team: string;
  logoUrl: string | null;
  status: "ok" | "missing" | "unknown";
  source: string | null;
  fetchedAt: string | null;
};

export const listTeamLogoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ rows: TeamLogoStatus[] }> => {
    const { listAllTeamLogoStatus } = await import("./team-logos.server");
    const rows = await listAllTeamLogoStatus();
    return { rows };
  });

export const setTeamLogoOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        team: z.string().min(1),
        url: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { upsertTeamLogoOverride } = await import("./team-logos.server");
    await upsertTeamLogoOverride(data.team, data.url);
    return { ok: true };
  });

export const clearTeamLogoCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ team: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { deleteTeamLogoRow } = await import("./team-logos.server");
    await deleteTeamLogoRow(data.team);
    return { ok: true };
  });
