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
          : "dark"
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
      size="icon"
      onClick={() => themeHandler(themeProvider)}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
