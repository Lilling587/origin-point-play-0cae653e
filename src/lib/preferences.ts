// Lightweight client-side preferences (localStorage).
// SSR-safe: every accessor guards `typeof window`.

const STORAGE_KEY = "producerStats.favoriteTeam";
export const DEFAULT_FAVORITE_TEAM = "Grästorps IK";

export function getFavoriteTeam(): string {
  if (typeof window === "undefined") return DEFAULT_FAVORITE_TEAM;
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_FAVORITE_TEAM;
  } catch {
    return DEFAULT_FAVORITE_TEAM;
  }
}

export function setFavoriteTeam(team: string): void {
  if (typeof window === "undefined") return;
  try {
    if (team) localStorage.setItem(STORAGE_KEY, team);
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("producerStats:favorite-changed"));
  } catch {
    // ignore quota / private mode
  }
}
