import { ThemeProvider } from "@/components/theme-provider";
import Page from "@/Page";
import { MenuItemProvider } from "./data/MenuItemProvider";
import { useEffect } from "react";

const App = () => {
  const appVersion = __APP_VERSION__;

  useEffect(() => {
    const storedVersion = localStorage.getItem("app_version");
    if (storedVersion !== appVersion) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("app_version", appVersion);
    }
  }, [appVersion]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <MenuItemProvider>
        <Page />
      </MenuItemProvider>
    </ThemeProvider>
  );
};

export default App;
