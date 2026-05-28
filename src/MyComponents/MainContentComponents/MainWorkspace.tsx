import React from "react";
import MainHeader from "./MainHeader";
import MainContent from "./MainContent";
import { SidebarInset } from "@/components/ui/sidebar";
import MainFooter from "./MainFooter";

const MainWorkspace: React.FC = () => {
  return (
    <SidebarInset>
      <MainHeader />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <MainContent />
      </div>
      <MainFooter />
    </SidebarInset>
  );
};

export default MainWorkspace;
