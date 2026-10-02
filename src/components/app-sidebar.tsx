import { Button } from "@/components/ui/button";
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import MainFooter from "@/MyComponents/SidebarComponents/SidebarFooter";

import { MenuToggleIcon } from "./menu-toggle-icon";
import { NavMain } from "./sidenav-arrowdropdown";
import { SiteBrand } from "./site-brand";

type AppSidebarProps = {
  open: boolean;
  onNavigate: () => void;
};

export function AppSidebar({ open, onNavigate }: AppSidebarProps) {
  return (
    <SheetContent
      side="left"
      overlayClassName="bg-transparent"
      className="swiss-menu inset-0 h-dvh w-screen max-w-none gap-0 rounded-none border-0 p-0 shadow-none sm:max-w-none [&>button]:hidden"
    >
      <SheetTitle className="sr-only">Navigation menu</SheetTitle>
      <SheetDescription className="sr-only">
        Choose a page or expand Articles to browse the writing archive.
      </SheetDescription>
      <div className="swiss-menu-layout">
        <header className="swiss-menu-header">
          <SheetClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="swiss-menu-toggle"
              aria-label="Close navigation menu"
            >
              <MenuToggleIcon open={open} />
            </Button>
          </SheetClose>
          <SiteBrand showCaption />
        </header>
        <div className="swiss-menu-body">
          <NavMain open={open} onNavigate={onNavigate} />
        </div>
        <MainFooter />
      </div>
    </SheetContent>
  );
}
