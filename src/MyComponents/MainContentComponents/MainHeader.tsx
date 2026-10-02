import { ThemeToggle } from "@/components/theme-toggle";
import { MenuToggleIcon } from "@/components/menu-toggle-icon";
import { SiteBrand } from "@/components/site-brand";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SheetTrigger } from "@/components/ui/sheet";
import { useMenuItem } from "@/data/MenuItemProvider";
import React from "react";

type MainHeaderProps = {
  menuOpen: boolean;
};

const MainHeader: React.FC<MainHeaderProps> = ({ menuOpen }) => {
  const { selectedItem, selectedParentPathLabels } = useMenuItem();
  return (
    <header className="swiss-header">
      <div className="swiss-header-leading">
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="swiss-menu-toggle"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
          >
            <MenuToggleIcon open={menuOpen} />
          </Button>
        </SheetTrigger>
        <SiteBrand />
        <Separator
          orientation="vertical"
          className="swiss-header-separator hidden h-5 shrink-0 md:block"
        />
        <Breadcrumb className="hidden min-w-0 md:block">
          <BreadcrumbList className="swiss-breadcrumb">
            {selectedParentPathLabels.map((path, index) => (
              <React.Fragment key={`${path}-${index}`}>
                <BreadcrumbItem key={path} className="hidden md:block">
                  <BreadcrumbLink href="#">{path}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
              </React.Fragment>
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage>{selectedItem.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="swiss-header-actions ml-auto flex shrink-0 items-center gap-6">
        <span className="swiss-header-caption hidden lg:block">
          A personal journal
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
};

export default MainHeader;
