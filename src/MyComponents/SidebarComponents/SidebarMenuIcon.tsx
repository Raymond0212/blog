import React from "react";
import { getComponentById } from "@/data/MenuItems";

type Props = {
  menuId: string;
};

const SidebarMenuIcon: React.FC<Props> = ({ menuId }) => {
  const comp = getComponentById(menuId);
  const Icon = comp.icon;
  return Icon && <Icon />;
};

export default SidebarMenuIcon;
