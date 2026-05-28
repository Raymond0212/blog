import { Button } from "@/components/ui/button";
import { useMenuItem } from "@/data/MenuItemProvider";
import { ROOT_HOME_ID } from "@/data/MenuItems";

export default function BackToHome() {
  const { selectItem } = useMenuItem();
  return <Button onClick={() => selectItem(ROOT_HOME_ID)}>Back to Home</Button>;
}
