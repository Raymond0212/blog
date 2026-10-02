import React from "react";
import MainHeader from "./MainHeader";
import MainContent from "./MainContent";
import { SidebarInset } from "@/components/ui/sidebar";
import MainFooter from "./MainFooter";

const MainWorkspace: React.FC = () => {
  return (
    <SidebarInset className="swiss-workspace">
      <MainHeader />
      <div className="swiss-workspace-body flex min-w-0 flex-1 flex-col">
        <MainContent />
      </div>
      <MainFooter />
    </SidebarInset>
  );
};

export default MainWorkspace;
