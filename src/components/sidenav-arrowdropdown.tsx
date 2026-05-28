"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { type VisibleMenuNode } from "@/data/MenuItems";
import { useMenuItem } from "@/data/MenuItemProvider";
import SidebarMenuIcon from "@/MyComponents/SidebarComponents/SidebarMenuIcon";

type MenuRowProps = {
  item: VisibleMenuNode;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
};

const MenuRow = React.memo(function MenuRow({
  item,
  selectedId,
  onSelect,
  onToggle,
}: MenuRowProps) {
  const handleClick = () => {
    if (!item.hasChildren) {
      onSelect(item.id);
      return;
    }

    if (selectedId === item.id) {
      onToggle(item.id);
      return;
    }

    onSelect(item.id);
    if (!item.isExpanded) {
      onToggle(item.id);
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.label}
        isActive={item.isActive}
        onClick={handleClick}
      >
        <a
          href={item.url ?? "#"}
          style={{ paddingInlineStart: `${item.depth * 12 + 8}px` }}
        >
          <SidebarMenuIcon menuId={item.id} />
          <span>{item.label}</span>
        </a>
      </SidebarMenuButton>
      {item.hasChildren ? (
        <SidebarMenuAction
          className={item.isExpanded ? "rotate-90" : ""}
          onClick={() => onToggle(item.id)}
        >
          <ChevronRight />
          <span className="sr-only">Toggle</span>
        </SidebarMenuAction>
      ) : null}
    </SidebarMenuItem>
  );
});

export function NavMain() {
  const { visibleMenuItems, selectedId, selectItem, toggleItemCollapsed } =
    useMenuItem();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Intro</SidebarGroupLabel>
      <SidebarMenu>
        {visibleMenuItems.map((item) => (
          <MenuRow
            key={item.id}
            item={item}
            selectedId={selectedId}
            onSelect={selectItem}
            onToggle={toggleItemCollapsed}
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
