import React from "react";
import { getComponentById } from "@/data/MenuItems";
import { useMenuItem } from "@/data/MenuItemProvider";
import { MDXProvider } from "@mdx-js/react";
import { components } from "@/MyComponents/ui/mdx-component";

const MainContent: React.FC = () => {
  const { selectedId, selectedItem } = useMenuItem();
  const isReadingPage =
    selectedItem.source === "article" || selectedId === "about";
  return (
    <div className="mdx swiss-content min-w-0 max-w-full flex-1">
      <MDXProvider components={components}>
        <div className={isReadingPage ? "reading-page" : "min-w-0"}>
          {getComponentById(selectedId).component}
        </div>
      </MDXProvider>
    </div>
  );
};

export default MainContent;
