import { useState } from "react";
import { Check } from "lucide-react";
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
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function SeasonPicker({
  value,
  onChange,
  seasons,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  seasons: string[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Säsong
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
              {value || (loading ? "Laddar säsonger…" : "Välj säsong")}
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
            <CommandList>
              <CommandEmpty>No season found.</CommandEmpty>
              <CommandGroup>
                {seasons.map((seasonLabel) => (
                  <CommandItem
                    key={seasonLabel}
                    value={seasonLabel}
                    onSelect={(currentValue) => {
                      onChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    {seasonLabel}
                    {value === seasonLabel && (
                      <Check className="ml-auto h-4 w-4" />
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
