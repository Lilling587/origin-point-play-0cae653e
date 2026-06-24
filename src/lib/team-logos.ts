// Optional manual overrides for team logo URLs. Empty by default — we render
// initials-based avatars (see `src/components/team-logo.tsx`). Add entries
// like `"Grästorps IK": "/logos/gik.png"` when real assets become available.
export const TEAM_LOGO_OVERRIDES: Record<string, string> = {};

// Short team codes from stats.swehockey.se (HockeyEttan 2025-26, competition 18271).
// These are the official abbreviations used by Swehockey in tables, standings
// and anchor links. Used as the logo text when no real logo asset exists.
export const TEAM_CODE_OVERRIDES: Record<string, string> = {
  "Borås HC": "BRS",
  "Grums IK": "GRU",
  "Grästorps IK": "GRÄ",
  "Halmstad Hammers HC": "HHHC",
  "Hanvikens SK": "HAN",
  "HC Dalen": "DAL",
  "HC Vita Hästen": "VIT",
  "Huddinge IK": "HDG",
  "Järfälla HC": "JÄR",
  "Karlskrona HK": "KHK",
  "Kungälvs IK": "KUN",
  "Mariestad BoIS HC": "MAR",
  "Mjölby HC": "MHC",
  "Mörrums GoIS IK": "MÖR",
  "Nyköpings SK": "NSK",
  "Tingsryds AIF": "TAIF",
  "Tranås AIF": "TRA",
  "Tyringe SoSS": "TYR",
  "Visby/Roma HK": "VIS",
  "Västerviks IK": "VÄS",
};
