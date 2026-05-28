import React from "react";
import { getComponent, MenuItem } from "@/data/MenuItems";
import { useMenuItem } from "@/data/MenuItemProvider";
import { MDXProvider } from "@mdx-js/react";
import { components } from "@/MyComponents/ui/mdx-component";

const MainContent: React.FC = () => {
  const { menuItemSelected } = useMenuItem();
  const item: MenuItem = menuItemSelected.selectedItem;
  return (
    <div className="mdx min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min p-4">
      <MDXProvider components={components}>
        {getComponent(item).component}
      </MDXProvider>
    </div>
  );
};

export default MainContent;
