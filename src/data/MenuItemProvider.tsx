import {
  getMenuItem,
  MenuItem,
  menuItems,
  MenuItemSelection,
} from "@/data/MenuItems";
import { createContext, useContext, useState } from "react";

export interface MenuItemProviderInterface {
  menuItemSelected: MenuItemSelection;
  setSelectedMenuItem: (
    selectedMenuItem: MenuItemSelection,
    menuItem: MenuItem
  ) => void;
  setIsCollapsedMenuItem: (
    selectedMenuItem: MenuItemSelection,
    menuItem: MenuItem
  ) => void;
}

const initialMenuItemProviderState: MenuItemProviderInterface = {
  menuItemSelected: {
    selectedItem: menuItems[0],
    menuItems: menuItems,
  },
  setSelectedMenuItem: () => {},
  setIsCollapsedMenuItem: () => {},
};

const MenuItemProviderContext = createContext<MenuItemProviderInterface>(
  initialMenuItemProviderState
);

interface MenuProviderProps {
  children: React.ReactNode;
  defaultItem?: MenuItemSelection;
  storageKey?: string;
}

export const MenuItemProvider: React.FC<MenuProviderProps> = ({
  children,
  defaultItem = {
    selectedItem: menuItems[0],
    menuItems: menuItems,
  },
  storageKey = "menu-context",
  ...props
}: MenuProviderProps) => {
  const storedMenuItemSelected = localStorage.getItem(storageKey);
  const deafultMenuItemSelected = () => {
    const storedSelected =
      storedMenuItemSelected == null
        ? defaultItem
        : (JSON.parse(storedMenuItemSelected) as MenuItemSelection);
    storedSelected.selectedItem = getMenuItem(
      storedSelected.selectedItem,
      storedSelected.menuItems
    );
    return storedSelected;
  };
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItemSelection>(
    deafultMenuItemSelected
  );

  const value = {
    menuItemSelected: selectedMenuItem,
    setSelectedMenuItem: (
      prevSelected: MenuItemSelection,
      menuItem: MenuItem
    ) => {
      selectedMenuItem.selectedItem.isActive = false;
      menuItem.isActive = true;
      let items = prevSelected.menuItems;
      let currItem = items[menuItem.itemIndexPath![0]];
      currItem.isCollapsed = false;
      menuItem.itemIndexPath?.forEach((pathIndex, index) => {
        if (index == 0) return;
        items = currItem.items!;
        currItem = items[pathIndex];
        currItem.isCollapsed = false;
      });
      const currSelected = {
        selectedItem: menuItem,
        menuItems: prevSelected.menuItems,
      };
      localStorage.setItem(storageKey, JSON.stringify(currSelected));
      setSelectedMenuItem(currSelected);
    },
    setIsCollapsedMenuItem: (
      prevSelected: MenuItemSelection,
      menuItem: MenuItem
    ) => {
      let items = prevSelected.menuItems;
      let currItem = items[menuItem.itemIndexPath![0]];
      currItem.isCollapsed = !currItem.isCollapsed;
      menuItem.itemIndexPath?.forEach((pathIndex, index) => {
        if (index == 0) return;
        items = currItem.items!;
        currItem = items[pathIndex];
        currItem.isCollapsed = !currItem.isCollapsed;
      });
      const currSelected = {
        selectedItem: prevSelected.selectedItem,
        menuItems: prevSelected.menuItems,
      };
      localStorage.setItem(storageKey, JSON.stringify(currSelected));
      setSelectedMenuItem(currSelected);
    },
  };

  return (
    <MenuItemProviderContext.Provider {...props} value={value}>
      {children}
    </MenuItemProviderContext.Provider>
  );
};

export const useMenuItem = () => {
  const context = useContext(MenuItemProviderContext);

  if (context === undefined)
    throw new Error("useMenuItem must be used within a MenuItemProvider");

  return context;
};
