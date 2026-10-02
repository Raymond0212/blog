import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme, ThemeProviderState } from "@/components/theme-provider";

export function ThemeToggle() {
  const themeProvider = useTheme();

  const themeHandler = (themeProvider: ThemeProviderState) => {
    if (themeProvider.theme === "system") {
      themeProvider.setTheme(
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "light"
          : "dark",
      );
    } else if (themeProvider.theme == "dark") {
      themeProvider.setTheme("light");
    } else {
      themeProvider.setTheme("dark");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="swiss-theme-toggle"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={() => themeHandler(themeProvider)}
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-4 dark:block" aria-hidden="true" />
      <span className="dark:hidden">Light</span>
      <span className="hidden dark:inline">Dark</span>
    </Button>
  );
}
