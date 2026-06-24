import { cn } from "@/lib/utils";
import { TEAM_LOGO_OVERRIDES, TEAM_CODE_OVERRIDES } from "@/lib/team-logos";
import { useTeamLogo } from "@/hooks/use-team-logos";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initials(team: string): string {
  const code = TEAM_CODE_OVERRIDES[team];
  if (code) return code;

  // Fallback: build a Swehockey-style abbreviation from the team name.
  const normalized = team
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/-]/g, " ")
    .trim();
  const words = normalized
    .split(/\s+/)
    .filter((w) => /[A-Za-zÅÄÖåäö]/.test(w));
  if (words.length === 0) return team.slice(0, 2).toUpperCase();

  const knownClubs = new Set([
    "HC", "IF", "IK", "BK", "AIF", "HK", "SK", "FF", "SoSS", "GoIS", "BoIS",
  ]);
  const upperWords = words.map((w) => w.toUpperCase());

  const suffix: string[] = [];
  let i = words.length - 1;
  while (i >= 0 && knownClubs.has(upperWords[i])) {
    suffix.unshift(words[i]);
    i--;
  }

  const location: string[] = [];
  const middle: string[] = [];
  for (let j = 0; j <= i; j++) {
    if (knownClubs.has(upperWords[j])) {
      middle.push(words[j]);
    } else {
      location.push(words[j]);
    }
  }

  const locationInitials = location.map((w) => w[0]).join("");
  const middlePart = middle.join("");
  const suffixPart = suffix.join("");

  let abbr = (locationInitials + middlePart + suffixPart).toUpperCase();
  if (abbr.length === 0) {
    abbr = words.map((w) => w[0]).join("").toUpperCase();
  }

  // Keep a readable length when a mid-name abbreviation makes the result long.
  if (abbr.length > 5 && middlePart.length > 0) {
    abbr = (locationInitials + middlePart).toUpperCase();
  }

  return abbr.slice(0, 5);
}

export function TeamLogo({
  team,
  size = "md",
  className,
}: {
  team: string;
  size?: Size;
  className?: string;
}) {
  const override = TEAM_LOGO_OVERRIDES[team];
  const sizeCls = SIZE_CLASSES[size];

  if (override) {
    return (
      <img
        src={override}
        alt={`${team} logotyp`}
        className={cn("rounded-md object-cover", sizeCls, className)}
      />
    );
  }

  const hue = hashString(team) % 360;
  const bg = `hsl(${hue} 65% 38%)`;
  return (
    <span
      aria-hidden="true"
      title={team}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold uppercase tracking-tight text-white shadow-sm",
        sizeCls,
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      {initials(team)}
    </span>
  );
}
