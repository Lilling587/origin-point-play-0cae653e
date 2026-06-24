import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={isDark ? "Byt till ljust tema" : "Byt till mörkt tema"}
      title={isDark ? "Byt till ljust tema" : "Byt till mörkt tema"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
