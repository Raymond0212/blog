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
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-2">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
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
      <div className="flex flex-1 justify-end px-4">
        <ThemeToggle />
      </div>
    </header>
  );
};

export default MainHeader;
