import React from "react";
import { getComponentById } from "@/data/MenuItems";
import { useMenuItem } from "@/data/MenuItemProvider";
import { MDXProvider } from "@mdx-js/react";
import { components } from "@/MyComponents/ui/mdx-component";

const MainContent: React.FC = () => {
  const { selectedId } = useMenuItem();
  return (
    <div className="mdx min-h-[100vh] min-w-0 max-w-full flex-1 overflow-x-hidden rounded-xl bg-muted/50 p-4 md:min-h-min">
      <MDXProvider components={components}>
        {getComponentById(selectedId).component}
      </MDXProvider>
    </div>
  );
};

export default MainContent;
