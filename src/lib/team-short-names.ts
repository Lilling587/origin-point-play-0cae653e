// Official short names from stats.swehockey.se (Hockeyettan Södra)
const SHORT_NAMES: Record<string, string> = {
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
  "Mariestad BoIS": "MAR",
  "Mjölby HC": "MHC",
  "Mörrums GoIS IK": "MÖR",
  "Mörrums GoIS": "MÖR",
  "Nyköpings SK": "NSK",
  "Tingsryds AIF": "TAIF",
  "Tranås AIF": "TRA",
  "Tyringe SoSS": "TYR",
  "Visby/Roma HK": "VIS",
  "Västerviks IK": "VÄS",
};

export function shortTeamName(name: string): string {
  if (SHORT_NAMES[name]) return SHORT_NAMES[name];
  const trimmed = name.trim();
  if (SHORT_NAMES[trimmed]) return SHORT_NAMES[trimmed];
  // Fallback: take uppercase letters or first 3 chars
  const upper = trimmed.replace(/[^A-ZÅÄÖ]/g, "");
  if (upper.length >= 2 && upper.length <= 5) return upper;
  return trimmed.slice(0, 4).toUpperCase();
}
