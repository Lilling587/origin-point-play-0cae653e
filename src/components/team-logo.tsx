import { cn } from "@/lib/utils";
import { TEAM_LOGO_OVERRIDES, TEAM_CODE_OVERRIDES } from "@/lib/team-logos";

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
  // Strip common club suffixes for nicer initials.
  const cleaned = team
    .replace(/\s+(HC|IF|IK|BK|HK|SK|FF)\b/gi, " $1")
    .trim();
  const words = cleaned
    .split(/\s+/)
    .filter((w) => /[A-Za-zÅÄÖåäö]/.test(w));
  if (words.length === 0) return team.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  // Prefer first-letter of first two words. If the last word is a short club
  // marker (IK, HC, BK...) include it as third character.
  const base = (words[0][0] + words[1][0]).toUpperCase();
  const last = words[words.length - 1];
  if (last.length <= 3 && /^[A-ZÅÄÖ]+$/.test(last)) return last.toUpperCase().slice(0, 3);
  return base;
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
