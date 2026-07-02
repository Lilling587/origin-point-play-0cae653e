import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_SEASON, getSeason } from "./seasons.config";

const PlayerSchema = z.object({
  number: z.number().int().nullable(),
  name: z.string().min(1),
  position: z.string().nullable(),
  line: z.number().int().nullable(),
  starter: z.boolean().optional(),
});

const LineupSchema = z.object({
  team: z.string().min(1),
  goalies: z.array(PlayerSchema),
  skaters: z.array(PlayerSchema),
  coach: z.string().nullable(),
  notes: z.string().nullable(),
});

export type VmixLineupInput = z.infer<typeof LineupSchema>;

export type VmixPublicationRow = {
  id: string;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  venue: string | null;
  standings: unknown[];
  homeLineup: VmixLineupInput;
  awayLineup: VmixLineupInput;
  notes: string | null;
  isActive: boolean;
  publishedAt: string;
  updatedAt: string;
};

async function assertAdmin(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

function mapRow(row: Record<string, unknown>): VmixPublicationRow {
  return {
    id: String(row.id),
    gameDate: String(row.game_date),
    homeTeam: String(row.home_team),
    awayTeam: String(row.away_team),
    venue: (row.venue as string | null) ?? null,
    standings: (row.standings_json as unknown[]) ?? [],
    homeLineup: row.home_lineup_json as VmixLineupInput,
    awayLineup: row.away_lineup_json as VmixLineupInput,
    notes: (row.notes as string | null) ?? null,
    isActive: Boolean(row.is_active),
    publishedAt: String(row.published_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Anyone (including anon vMix pollers) can read the active publication.
 */
export const getActivePublication = createServerFn({ method: "GET" }).handler(
  async (): Promise<VmixPublicationRow | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client
      .from("vmix_publications")
      .select("*")
      .eq("is_active", true)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRow(data) : null;
  },
);

/**
 * Prefill a team lineup from the swehockey roster page.
 */
export const fetchTeamRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ team: z.string().min(1), season: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const season = getSeason(data.season) ?? DEFAULT_SEASON;
    const { scrapeTeamRoster } = await import("./vmix.server");
    return scrapeTeamRoster(data.team, season);
  });

/**
 * Publish (or re-publish) a snapshot for a game. Marks any previously
 * active row inactive so only one publication is live at a time.
 */
export const publishVmix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        homeTeam: z.string().min(1),
        awayTeam: z.string().min(1),
        venue: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        season: z.string().optional(),
        homeLineup: LineupSchema,
        awayLineup: LineupSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const season = getSeason(data.season) ?? DEFAULT_SEASON;
    const { fetchFullStandings } = await import("./stats.server");
    const standings = await fetchFullStandings(season).catch(() => []);

    // Deactivate previous
    const { error: deactErr } = await context.supabase
      .from("vmix_publications")
      .update({ is_active: false })
      .eq("is_active", true);
    if (deactErr) throw new Error(deactErr.message);

    const { data: inserted, error } = await context.supabase
      .from("vmix_publications")
      .insert({
        game_date: data.gameDate,
        home_team: data.homeTeam,
        away_team: data.awayTeam,
        venue: data.venue ?? null,
        notes: data.notes ?? null,
        standings_json: standings as unknown as object,
        home_lineup_json: data.homeLineup as unknown as object,
        away_lineup_json: data.awayLineup as unknown as object,
        published_by: context.userId,
        is_active: true,
        published_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(inserted as Record<string, unknown>);
  });

export const unpublishVmix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("vmix_publications")
      .update({ is_active: false })
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
