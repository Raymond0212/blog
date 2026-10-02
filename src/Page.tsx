import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import MainWorkspace from "./MyComponents/MainContentComponents/MainWorkspace";

export default function Page() {
  return (
    <SidebarProvider className="swiss-shell">
      <AppSidebar />
      <MainWorkspace />
    </SidebarProvider>
  );
}
