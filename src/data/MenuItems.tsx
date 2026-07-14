import React from "react";
import About from "../About";
import HiDockManagerPage from "@/features/hidock/HiDockManagerPage";
import EmbeddingDemoPage from "@/features/embedding/EmbeddingDemoPage";
import WhisperXUI from "@/WhisperX-UI";
import Home from "../Home";
import {
  HardDrive,
  House,
  MessageCircleHeart,
  Book,
  Captions,
  Orbit,
  type LucideIcon,
} from "lucide-react";
import PageNotFound from "@/error_pages/404";

export type MenuNode = {
  id: string;
  label: string;
  source: "static" | "article";
  kind: "root" | "group" | "page";
  url?: string;
  items?: MenuNode[];
};

export type VisibleMenuNode = {
  id: string;
  label: string;
  depth: number;
  hasChildren: boolean;
  isActive: boolean;
  isExpanded: boolean;
  url?: string;
};

export type MenuComponentItem = {
  component: React.ReactNode;
  icon?: LucideIcon;
};

export const ROOT_HOME_ID = "home";
export const ARTICLES_ROOT_ID = "articles";
const ARTICLE_ID_PREFIX = "article:";

type MdxModule = {
  default: React.ComponentType;
};

type ArticlePageRecord = {
  id: string;
  label: string;
  folderId: string;
  loader: () => Promise<MdxModule>;
  dateSortKey: number | null;
};

type ArticleFolderRecord = {
  id: string;
  label: string;
  pages: ArticlePageRecord[];
};

type ArticleRegistry = {
  folders: ArticleFolderRecord[];
  pageLoaderById: Map<string, () => Promise<MdxModule>>;
  folderLoaderById: Map<string, () => Promise<MdxModule>>;
  rootLoader: (() => Promise<MdxModule>) | null;
};

const staticMenuItems: MenuNode[] = [
  {
    id: ROOT_HOME_ID,
    label: "Home",
    source: "static",
    kind: "root",
    url: "#",
  },
  {
    id: "about",
    label: "About",
    source: "static",
    kind: "root",
  },
  {
    id: "hidock-manager",
    label: "HiDock Manager",
    source: "static",
    kind: "root",
    url: "#",
  },
  {
    id: "whisperx-ui",
    label: "WhisperX UI",
    source: "static",
    kind: "root",
    url: "#",
  },
  {
    id: "embedding-demo",
    label: "Embedding Demo",
    source: "static",
    kind: "root",
    url: "#",
  },
];

const menuComponentItemsById: Record<string, MenuComponentItem> = {
  [ROOT_HOME_ID]: {
    icon: House,
    component: <Home />,
  },
  about: {
    icon: MessageCircleHeart,
    component: <About />,
  },
  "hidock-manager": {
    icon: HardDrive,
    component: <HiDockManagerPage />,
  },
  "whisperx-ui": {
    icon: Captions,
    component: <WhisperXUI />,
  },
  "embedding-demo": {
    icon: Orbit,
    component: <EmbeddingDemoPage />,
  },
};

const menu404Component: MenuComponentItem = {
  component: <PageNotFound />,
};

const articleModules = import.meta.glob("../content/articles/**/*.mdx");

function formatArticleLabel(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function parseDatePrefix(baseName: string): {
  dateSortKey: number | null;
  labelBase: string;
} {
  const match = /^(\d{2})(\d{2})(\d{2})-(.+)$/.exec(baseName);
  if (!match) {
    return { dateSortKey: null, labelBase: baseName };
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
  if (!isValid) {
    return { dateSortKey: null, labelBase: baseName };
  }

  return { dateSortKey: utc, labelBase: match[4] };
}

function buildArticleRegistry(): ArticleRegistry {
  const folderById = new Map<string, ArticleFolderRecord>();
  const pageLoaderById = new Map<string, () => Promise<MdxModule>>();
  const folderLoaderById = new Map<string, () => Promise<MdxModule>>();
  let rootLoader: (() => Promise<MdxModule>) | null = null;

  Object.entries(articleModules).forEach(([rawPath, loader]) => {
    const normalizedPath = rawPath.replace(/\\/g, "/");
    const relative = normalizedPath.replace(/^.*\/content\/articles\//, "");
    const typedLoader = loader as () => Promise<MdxModule>;
    if (relative.toLowerCase() === "index.mdx") {
      rootLoader = typedLoader;
      return;
    }
    const segments = relative.split("/").filter(Boolean);
    if (segments.length < 2) {
      return;
    }

    const folderKey = segments[0];
    const fileName = segments[segments.length - 1];
    const pagePath = segments.join("/");
    const baseName = fileName.replace(/\.mdx$/i, "");
    const { dateSortKey, labelBase } = parseDatePrefix(baseName);
    const pageLabel = formatArticleLabel(labelBase);
    const folderId = `${ARTICLE_ID_PREFIX}${folderKey}`;

    if (!folderById.has(folderId)) {
      folderById.set(folderId, {
        id: folderId,
        label: formatArticleLabel(folderKey),
        pages: [],
      });
    }

    const pageId = `${ARTICLE_ID_PREFIX}${pagePath.replace(/\.mdx$/i, "")}`;
    if (baseName.toLowerCase() === "index") {
      folderLoaderById.set(folderId, typedLoader);
    } else {
      folderById.get(folderId)?.pages.push({
        id: pageId,
        label: pageLabel,
        folderId,
        loader: typedLoader,
        dateSortKey,
      });
    }
    pageLoaderById.set(pageId, typedLoader);
  });

  const folders = [...folderById.values()]
    .map((folder) => ({
      ...folder,
      pages: [...folder.pages].sort((a, b) => {
        if (a.dateSortKey !== null && b.dateSortKey !== null) {
          return b.dateSortKey - a.dateSortKey;
        }
        if (a.dateSortKey !== null) {
          return -1;
        }
        if (b.dateSortKey !== null) {
          return 1;
        }
        return a.label.localeCompare(b.label);
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { folders, pageLoaderById, folderLoaderById, rootLoader };
}

const articleRegistry = buildArticleRegistry();

function buildMenuItems(): MenuNode[] {
  if (!articleRegistry.folders.length) {
    return staticMenuItems;
  }

  const articleTree: MenuNode = {
    id: ARTICLES_ROOT_ID,
    label: "Articles",
    source: "article",
    kind: "root",
    items: articleRegistry.folders.map((folder) => ({
      id: folder.id,
      label: folder.label,
      source: "article",
      kind: "group",
      items: folder.pages.map((page) => ({
        id: page.id,
        label: page.label,
        source: "article",
        kind: "page",
      })),
    })),
  };

  return [...staticMenuItems, articleTree];
}

export const menuItems: MenuNode[] = buildMenuItems();

type MenuIndex = {
  nodeById: Map<string, MenuNode>;
  parentById: Map<string, string | null>;
  childrenById: Map<string, string[]>;
};

export function buildMenuIndex(tree: MenuNode[]): MenuIndex {
  const nodeById = new Map<string, MenuNode>();
  const parentById = new Map<string, string | null>();
  const childrenById = new Map<string, string[]>();

  const walk = (nodes: MenuNode[], parentId: string | null) => {
    nodes.forEach((node) => {
      nodeById.set(node.id, node);
      parentById.set(node.id, parentId);
      const children = node.items?.map((item) => item.id) ?? [];
      childrenById.set(node.id, children);
      if (node.items?.length) {
        walk(node.items, node.id);
      }
    });
  };

  walk(tree, null);
  return { nodeById, parentById, childrenById };
}

export function getComponentById(id: string): MenuComponentItem {
  if (id === ARTICLES_ROOT_ID) {
    if (!articleRegistry.rootLoader) {
      return {
        icon: Book,
        component: menu404Component.component,
      };
    }
    return {
      icon: Book,
      component: <LazyArticlePage loader={articleRegistry.rootLoader} />,
    };
  }

  if (id.startsWith(ARTICLE_ID_PREFIX)) {
    const articleLoader =
      articleRegistry.pageLoaderById.get(id) ??
      articleRegistry.folderLoaderById.get(id);
    if (!articleLoader) {
      return menu404Component;
    }
    return {
      icon: undefined,
      component: <LazyArticlePage loader={articleLoader} />,
    };
  }
  return menuComponentItemsById[id] ?? menu404Component;
}

type LazyArticlePageProps = {
  loader: () => Promise<MdxModule>;
};

const LazyArticlePage = ({ loader }: LazyArticlePageProps) => {
  const Component = React.useMemo(() => React.lazy(loader), [loader]);
  return (
    <React.Suspense
      fallback={
        <div className="text-sm text-muted-foreground">Loading article...</div>
      }
    >
      <Component />
    </React.Suspense>
  );
};

export function getNodeParentPathLabels(
  id: string,
  parentById: Map<string, string | null>,
  nodeById: Map<string, MenuNode>,
) {
  const labels: string[] = [];
  let current = parentById.get(id) ?? null;
  while (current) {
    const parent = nodeById.get(current);
    if (!parent) {
      break;
    }
    labels.unshift(parent.label);
    current = parentById.get(current) ?? null;
  }
  return labels;
}

export function getVisibleNodeIds(
  tree: MenuNode[],
  expandedIds: Set<string>,
): { id: string; depth: number }[] {
  const rows: { id: string; depth: number }[] = [];
  const stack: { node: MenuNode; depth: number }[] = [];

  for (let i = tree.length - 1; i >= 0; i -= 1) {
    stack.push({ node: tree[i], depth: 0 });
  }

  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    rows.push({ id: current.node.id, depth: current.depth });
    if (!expandedIds.has(current.node.id)) {
      continue;
    }

    const children = current.node.items;
    if (!children?.length) {
      continue;
    }

    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ node: children[i], depth: current.depth + 1 });
    }
  }

  return rows;
}
