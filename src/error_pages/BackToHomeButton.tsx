import { Button } from "@/components/ui/button";
import { useMenuItem } from "@/data/MenuItemProvider";

export default function BackToHome() {
  const { menuItemSelected, setSelectedMenuItem } = useMenuItem();
  const homeItem = menuItemSelected.menuItems[0];
  return (
    <Button onClick={() => setSelectedMenuItem(menuItemSelected, homeItem)}>
      Back to Home
    </Button>
  );
}
