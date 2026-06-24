import { supabase } from "@/integrations/supabase/client";

const BUCKET = "team-logos";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTokens(s: string): string[] {
  return slugify(s)
    .split("-")
    .filter((t) => t.length >= 3);
}

/** Upload a logo file for `team` and return its public URL. */
export async function uploadTeamLogo(
  team: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  const path = `${slugify(team)}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Best-effort match of a filename to one of the provided team names. */
export function matchTeamByFilename(
  filename: string,
  teams: string[],
): string | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const fileTokens = new Set(normalizeTokens(base));
  if (fileTokens.size === 0) return null;

  let best: { team: string; score: number } | null = null;
  for (const team of teams) {
    const teamTokens = normalizeTokens(team);
    if (teamTokens.length === 0) continue;
    let score = 0;
    for (const tok of teamTokens) {
      if (fileTokens.has(tok)) score += tok.length;
    }
    // also reward whole-name substring
    if (slugify(base).includes(slugify(team))) score += 5;
    if (score > 0 && (!best || score > best.score)) {
      best = { team, score };
    }
  }
  return best?.team ?? null;
}
