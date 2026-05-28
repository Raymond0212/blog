import React from "react";
import { getComponent, MenuItem } from "@/data/MenuItems";

type Props = {
  menuItem: MenuItem;
};

const SidebarMenuIcon: React.FC<Props> = ({ menuItem }) => {
  const comp = getComponent(menuItem);
  const Icon = comp.icon;
  return Icon && <Icon />;
};

export default SidebarMenuIcon;
