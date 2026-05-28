import React from "react";
import About from "../About";
import HiDockManagerPage from "@/features/hidock/HiDockManagerPage";
import Home from "../Home";
import Sliding from "../MyComponents/MainContentComponents/Sliding";
import {
  HardDrive,
  House,
  MessageCircleHeart,
  Smile,
  type LucideIcon,
} from "lucide-react";
import PageNotFound from "@/error_pages/404";

export type MenuItem = {
  label: string;
  url?: string;
  isActive?: boolean;
  isCollapsed?: boolean;
  paretnPath?: string[];
  itemIndexPath?: number[];
  items?: MenuItem[];
};

const menuItemsInitialData: MenuItem[] = [
  {
    label: "Home",
    url: "#",
    isActive: true,
  },
  {
    label: "About",
    items: [
      {
        label: "Links",
      },
    ],
  },
  {
    label: "Slippery Button",
  },
  {
    label: "HiDock Manager",
    url: "#",
  },
];

export type MenuComponentItem = {
  component: React.ReactNode;
  icon?: LucideIcon;
  items?: MenuComponentItem[];
};

export const menuComponentItems: MenuComponentItem[] = [
  {
    icon: House,
    component: <Home />,
  },
  {
    icon: MessageCircleHeart,
    component: <About />,
  },
  {
    icon: Smile,
    component: <Sliding />,
  },
  {
    icon: HardDrive,
    component: <HiDockManagerPage />,
  },
];

export const menu404Component: MenuComponentItem = {
  component: <PageNotFound />,
};

export interface MenuItemSelection {
  selectedItem: MenuItem;
  menuItems: MenuItem[];
}

// =====================================

export const getComponent = (menuItem: MenuItem) => {
  try {
    let result: MenuComponentItem =
      menuComponentItems[menuItem.itemIndexPath![0]];
    let nextComponents;
    menuItem.itemIndexPath!.forEach((pathIndex, index) => {
      if (index === 0) return;
      nextComponents = result.items!;
      result = nextComponents[pathIndex];
    });

    return result;
  } catch {
    return menu404Component;
  }
};

export const getMenuItem = (menuItem: MenuItem, menuItems: MenuItem[]) => {
  try {
    let result: MenuItem = menuItems[menuItem.itemIndexPath![0]];
    let nextMenuItem;
    menuItem.itemIndexPath!.forEach((pathIndex, index) => {
      if (index === 0) return;
      nextMenuItem = result.items!;
      result = nextMenuItem[pathIndex];
    });

    return result;
  } catch {
    return menuItems[0];
  }
};

function initMenuItems(
  menuItems: MenuItem[],
  parentPath: string[] = [],
  itemIndexPath: number[] = [],
) {
  let index = 0;
  if (menuItems && menuItems.length > 0) {
    menuItems.forEach((menuItem: MenuItem) => {
      menuItem.isCollapsed = false;
      menuItem.itemIndexPath = [...itemIndexPath, index];
      menuItem.paretnPath = [...parentPath];

      if (menuItem.items !== undefined && menuItem.items.length > 0) {
        initMenuItems(
          menuItem.items,
          [...parentPath, menuItem.label]!,
          menuItem.itemIndexPath!,
        );
      }
      index++;
    });
  }
}

initMenuItems(menuItemsInitialData);

export const menuItems = menuItemsInitialData;
