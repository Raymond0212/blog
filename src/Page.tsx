import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Sheet } from "@/components/ui/sheet";
import MainWorkspace from "./MyComponents/MainContentComponents/MainWorkspace";

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setMenuOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="swiss-shell min-h-svh w-full">
        <MainWorkspace menuOpen={menuOpen} />
      </div>
      <AppSidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
    </Sheet>
  );
}
