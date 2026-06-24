import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function SearchableTeamPicker({
  label,
  value,
  onChange,
  teams,
  excludedTeam,
  loading,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  teams: string[];
  excludedTeam?: string;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  const options = useMemo(
    () =>
      Array.from(new Set([...teams, "Grästorps IK"]))
        .filter((team) => team !== excludedTeam)
        .sort(),
    [teams, excludedTeam],
  );

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={loading}
          >
            <span className={value ? "truncate" : "truncate text-muted-foreground"}>
              {value || (loading ? "Laddar lag…" : "Välj lag")}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-2 h-4 w-4 shrink-0 opacity-50"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Sök lag…" />
            <CommandList>
              <CommandEmpty>Inget lag hittades.</CommandEmpty>
              <CommandGroup>
                {options.map((t) => (
                  <CommandItem
                    key={t}
                    value={t}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? "" : currentValue);
                      setOpen(false);
                    }}
                  >
                    {t}
                    {value === t && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="ml-auto h-4 w-4"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
