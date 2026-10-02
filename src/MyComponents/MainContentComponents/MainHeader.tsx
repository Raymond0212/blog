import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useMenuItem } from "@/data/MenuItemProvider";
import React from "react";

const MainHeader: React.FC = () => {
  const { selectedItem, selectedParentPathLabels } = useMenuItem();
  return (
    <header className="swiss-header">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="shrink-0" />
        <Separator orientation="vertical" className="h-4 shrink-0" />
        <Breadcrumb>
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
      <div className="ml-auto flex shrink-0 items-center gap-6">
        <span className="swiss-header-caption hidden lg:block">
          A personal journal
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
};

export default MainHeader;
