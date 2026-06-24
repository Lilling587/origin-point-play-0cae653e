import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  // Avoid SSR/CSR mismatch: localStorage isn't readable on the server, so we
  // render a neutral placeholder until after hydration, then swap to the real
  // icon/label based on the current theme.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && theme === "dark";
  const label = !mounted
    ? "Växla tema"
    : isDark
      ? "Byt till ljust tema"
      : "Byt till mörkt tema";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {!mounted ? (
        <Sun className="h-4 w-4 opacity-60" />
      ) : isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
