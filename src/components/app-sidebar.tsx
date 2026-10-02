import * as React from "react";

import { NavMain } from "@/components/sidenav-arrowdropdown";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import MainFooter from "@/MyComponents/SidebarComponents/SidebarFooter";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const websiteLink = import.meta.env.VITE_WEBSITE_LINK ?? "#";

  return (
    <Sidebar {...props}>
      <SidebarHeader className="swiss-sidebar-header">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="swiss-brand">
              <a href={websiteLink}>
                <span className="swiss-brand-mark" aria-hidden="true" />
                <div className="grid flex-1 text-left">
                  <span className="swiss-brand-name">
                    RuaMond<span className="swiss-accent">.</span>
                  </span>
                  <span className="swiss-brand-caption">
                    It's okay not to be okay
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="swiss-sidebar-content">
        <NavMain />
      </SidebarContent>
      <MainFooter></MainFooter>
    </Sidebar>
  );
}
