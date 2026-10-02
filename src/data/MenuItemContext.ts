import { createContext, useContext } from "react";
import type { MenuNode, VisibleMenuNode } from "@/data/MenuItems";

export interface MenuItemProviderInterface {
  menuItems: MenuNode[];
  visibleMenuItems: VisibleMenuNode[];
  selectedItem: MenuNode;
  selectedParentPathLabels: string[];
  selectedId: string;
  selectItem: (id: string) => void;
  toggleItemCollapsed: (id: string) => void;
}

export const MenuItemProviderContext =
  createContext<MenuItemProviderInterface | null>(null);

export const useMenuItem = () => {
  const context = useContext(MenuItemProviderContext);
  if (!context) {
    throw new Error("useMenuItem must be used within a MenuItemProvider");
  }
  return context;
};
