import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public endpoint — clients (signed-in or not) push structured errors here.
// Writes use supabaseAdmin (service role) so we never expose INSERT via RLS.
// Reads are admin-only and go through a separate, authenticated server fn.

const payloadSchema = z.object({
  source: z.string().min(1).max(120),
  message: z.string().min(1).max(4000),
  level: z.enum(["error", "warn", "info"]).optional().default("error"),
  stack: z.string().max(20_000).optional(),
  context: z.record(z.unknown()).optional(),
  route: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
});

export const logError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => payloadSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; id: string | null }> => {
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data: row, error } = await supabaseAdmin
        .from("error_log")
        .insert({
          source: data.source,
          level: data.level ?? "error",
          message: data.message.slice(0, 4000),
          stack: data.stack ?? null,
          context: data.context ?? null,
          route: data.route ?? null,
          user_agent: data.userAgent ?? null,
          user_id: data.userId ?? null,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[error_log insert failed]", error.message);
        return { ok: true, id: null };
      }
      return { ok: true, id: row?.id ?? null };
    } catch (err) {
      // Never let the logger itself throw — that would mask the original error.
      console.error("[error_log fatal]", err);
      return { ok: true, id: null };
    }
  });
