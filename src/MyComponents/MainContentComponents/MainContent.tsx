import React from "react";
import { getComponentById } from "@/data/MenuItems";
import { useMenuItem } from "@/data/MenuItemProvider";
import { MDXProvider } from "@mdx-js/react";
import { components } from "@/MyComponents/ui/mdx-component";

const MainContent: React.FC = () => {
  const { selectedId } = useMenuItem();
  return (
    <div className="mdx min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min p-4">
      <MDXProvider components={components}>
        {getComponentById(selectedId).component}
      </MDXProvider>
    </div>
  );
};

export default MainContent;
