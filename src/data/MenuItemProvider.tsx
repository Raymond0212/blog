import {
  buildMenuIndex,
  getNodeParentPathLabels,
  getVisibleNodeIds,
  menuItems,
  ROOT_HOME_ID,
  type MenuNode,
  type VisibleMenuNode,
} from "@/data/MenuItems";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

type MenuState = {
  selectedId: string;
  expandedIds: Set<string>;
};

type PersistedMenuState = {
  selectedId: string;
  expandedIds: string[];
};

type LegacyMenuNode = {
  label?: string;
  isCollapsed?: boolean;
  itemIndexPath?: number[];
  items?: LegacyMenuNode[];
};

type LegacyMenuSelection = {
  selectedItem?: LegacyMenuNode;
  menuItems?: LegacyMenuNode[];
};

type MenuAction =
  | { type: "select"; id: string; ancestors: string[] }
  | { type: "toggle"; id: string };

export interface MenuItemProviderInterface {
  menuItems: MenuNode[];
  visibleMenuItems: VisibleMenuNode[];
  selectedItem: MenuNode;
  selectedParentPathLabels: string[];
  selectedId: string;
  selectItem: (id: string) => void;
  toggleItemCollapsed: (id: string) => void;
}

const storageKeyDefault = "menu-context";

const MenuItemProviderContext = createContext<MenuItemProviderInterface | null>(
  null
);

function menuReducer(state: MenuState, action: MenuAction): MenuState {
  if (action.type === "select") {
    const nextExpanded = new Set(state.expandedIds);
    action.ancestors.forEach((id) => nextExpanded.add(id));
    return { selectedId: action.id, expandedIds: nextExpanded };
  }

  const nextExpanded = new Set(state.expandedIds);
  if (nextExpanded.has(action.id)) {
    nextExpanded.delete(action.id);
  } else {
    nextExpanded.add(action.id);
  }
  return { ...state, expandedIds: nextExpanded };
}

function nodeByIndexPath(
  tree: MenuNode[],
  indexPath: number[] | undefined
): MenuNode | null {
  if (!indexPath?.length) {
    return null;
  }

  let current: MenuNode | undefined = tree[indexPath[0]];
  if (!current) {
    return null;
  }
  for (let i = 1; i < indexPath.length; i += 1) {
    current = current.items?.[indexPath[i]];
    if (!current) {
      return null;
    }
  }
  return current;
}

function collectExpandedFromLegacy(nodes: LegacyMenuNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (legacyNodes: LegacyMenuNode[], currentNodes: MenuNode[]) => {
    legacyNodes.forEach((legacyNode, index) => {
      const current = currentNodes[index];
      if (!current) {
        return;
      }
      if (legacyNode.isCollapsed === false && current.items?.length) {
        ids.add(current.id);
      }
      if (legacyNode.items?.length && current.items?.length) {
        walk(legacyNode.items, current.items);
      }
    });
  };
  walk(nodes, menuItems);
  return ids;
}

function getDefaultExpandedIds(nodes: MenuNode[]): Set<string> {
  const defaultExpandedIds = new Set<string>();
  const walkDefaults = (nodes: MenuNode[]) => {
    nodes.forEach((node) => {
      if (node.items?.length) {
        defaultExpandedIds.add(node.id);
        walkDefaults(node.items);
      }
    });
  };
  walkDefaults(nodes);
  return defaultExpandedIds;
}

function parseInitialState(
  raw: string | null,
  currentMenuItems: MenuNode[],
  validIds: Set<string>
): MenuState {
  const defaultExpandedIds = getDefaultExpandedIds(currentMenuItems);
  if (!raw) {
    return { selectedId: ROOT_HOME_ID, expandedIds: defaultExpandedIds };
  }

  try {
    const parsed = JSON.parse(raw) as PersistedMenuState | LegacyMenuSelection;
    if (
      "selectedId" in parsed &&
      typeof parsed.selectedId === "string" &&
      Array.isArray(parsed.expandedIds)
    ) {
      const safeSelectedId = validIds.has(parsed.selectedId)
        ? parsed.selectedId
        : ROOT_HOME_ID;
      const safeExpandedIds = parsed.expandedIds.filter((id) => validIds.has(id));
      return {
        selectedId: safeSelectedId,
        expandedIds: safeExpandedIds.length
          ? new Set(safeExpandedIds)
          : defaultExpandedIds,
      };
    }

    const legacy = parsed as LegacyMenuSelection;
    const legacySelected = nodeByIndexPath(
      currentMenuItems,
      legacy.selectedItem?.itemIndexPath
    );
    const expandedIds = Array.isArray(legacy.menuItems)
      ? collectExpandedFromLegacy(legacy.menuItems)
      : new Set<string>();
    const safeExpandedIds = [...expandedIds].filter((id) => validIds.has(id));
    const safeSelectedId =
      legacySelected?.id && validIds.has(legacySelected.id)
        ? legacySelected.id
        : ROOT_HOME_ID;

    return {
      selectedId: safeSelectedId,
      expandedIds: safeExpandedIds.length
        ? new Set(safeExpandedIds)
        : defaultExpandedIds,
    };
  } catch {
    return { selectedId: ROOT_HOME_ID, expandedIds: defaultExpandedIds };
  }
}

interface MenuProviderProps {
  children: ReactNode;
  storageKey?: string;
}

export const MenuItemProvider = ({
  children,
  storageKey = storageKeyDefault,
}: MenuProviderProps) => {
  const { nodeById, parentById } = useMemo(() => buildMenuIndex(menuItems), []);
  const validIds = useMemo(() => new Set(nodeById.keys()), [nodeById]);
  const initial = useMemo(
    () => parseInitialState(localStorage.getItem(storageKey), menuItems, validIds),
    [storageKey, validIds]
  );
  const [state, dispatch] = useReducer(menuReducer, initial);

  const selectedItem = nodeById.get(state.selectedId) ?? menuItems[0];
  const selectedId = selectedItem.id;

  const persist = useCallback(
    (nextState: MenuState) => {
      const payload: PersistedMenuState = {
        selectedId: nextState.selectedId,
        expandedIds: [...nextState.expandedIds],
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    },
    [storageKey]
  );

  const selectItem = useCallback(
    (id: string) => {
      if (!nodeById.has(id)) {
        return;
      }
      const ancestors: string[] = [];
      let current = parentById.get(id) ?? null;
      while (current) {
        ancestors.push(current);
        current = parentById.get(current) ?? null;
      }
      const nextState: MenuState = {
        selectedId: id,
        expandedIds: new Set(state.expandedIds),
      };
      ancestors.forEach((ancestorId) => nextState.expandedIds.add(ancestorId));
      persist(nextState);
      dispatch({ type: "select", id, ancestors });
    },
    [nodeById, parentById, persist, state.expandedIds]
  );

  const toggleItemCollapsed = useCallback(
    (id: string) => {
      if (!nodeById.get(id)?.items?.length) {
        return;
      }
      const nextExpanded = new Set(state.expandedIds);
      if (nextExpanded.has(id)) {
        nextExpanded.delete(id);
      } else {
        nextExpanded.add(id);
      }
      const nextState: MenuState = {
        selectedId,
        expandedIds: nextExpanded,
      };
      persist(nextState);
      dispatch({ type: "toggle", id });
    },
    [nodeById, persist, selectedId, state.expandedIds]
  );

  const visibleMenuItems = useMemo<VisibleMenuNode[]>(() => {
    const rows = getVisibleNodeIds(menuItems, state.expandedIds);
    const result: VisibleMenuNode[] = [];
    rows.forEach(({ id, depth }) => {
      const node = nodeById.get(id);
      if (!node) {
        return;
      }
      result.push({
        id: node.id,
        label: node.label,
        depth,
        hasChildren: Boolean(node.items?.length),
        isActive: node.id === selectedId,
        isExpanded: state.expandedIds.has(node.id),
        url: node.url,
      });
    });
    return result;
  }, [nodeById, selectedId, state.expandedIds]);

  const selectedParentPathLabels = useMemo(
    () => getNodeParentPathLabels(selectedId, parentById, nodeById),
    [selectedId, parentById, nodeById]
  );

  const value = useMemo<MenuItemProviderInterface>(
    () => ({
      menuItems,
      visibleMenuItems,
      selectedItem,
      selectedParentPathLabels,
      selectedId,
      selectItem,
      toggleItemCollapsed,
    }),
    [
      visibleMenuItems,
      selectedItem,
      selectedParentPathLabels,
      selectedId,
      selectItem,
      toggleItemCollapsed,
    ]
  );

  return (
    <MenuItemProviderContext.Provider value={value}>
      {children}
    </MenuItemProviderContext.Provider>
  );
};

export const useMenuItem = () => {
  const context = useContext(MenuItemProviderContext);
  if (!context) {
    throw new Error("useMenuItem must be used within a MenuItemProvider");
  }
  return context;
};
