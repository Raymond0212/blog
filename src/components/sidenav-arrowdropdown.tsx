"use client";

import { ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useMenuItem } from "@/data/MenuItemProvider";
import SidebarMenuIcon from "@/MyComponents/SidebarComponents/SidebarMenuIcon";

export function NavMain() {
  const menuItemProvider = useMenuItem();
  const items = menuItemProvider.menuItemSelected.menuItems;
  const selectedMenuItem = menuItemProvider.menuItemSelected;
  const setSelectedMenuItem = menuItemProvider.setSelectedMenuItem;
  const setIsCollapsedMenuItem = menuItemProvider.setIsCollapsedMenuItem;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Intro</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible key={item.label} asChild defaultOpen={!item.isCollapsed}>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={item.isActive}
                onClick={() => {
                  setSelectedMenuItem(selectedMenuItem, item);
                }}
              >
                <a href={item.url ? "#" : item.url}>
                  {<SidebarMenuIcon menuItem={item} />}
                  <span>{item.label}</span>
                </a>
              </SidebarMenuButton>
              {item.items?.length ? (
                <>
                  <CollapsibleTrigger
                    asChild
                    onClick={() =>
                      setIsCollapsedMenuItem(selectedMenuItem, item)
                    }
                  >
                    <SidebarMenuAction className="data-[state=open]:rotate-90">
                      <ChevronRight />
                      <span className="sr-only">Toggle</span>
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.label}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subItem.isActive}
                            onClick={() =>
                              setSelectedMenuItem(selectedMenuItem, subItem)
                            }
                          >
                            <a href={subItem.url ? "#" : subItem.url}>
                              <span>{subItem.label}</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : null}
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
