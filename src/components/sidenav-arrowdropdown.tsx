import { useId, useLayoutEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildMenuIndex, type MenuNode } from "@/data/MenuItems";
import { useMenuItem } from "@/data/MenuItemProvider";

type NavMainProps = {
  open: boolean;
  onNavigate: () => void;
};

function getAncestorIds(
  selectedId: string,
  parentById: Map<string, string | null>,
): Set<string> {
  const ancestors = new Set<string>();
  let parentId = parentById.get(selectedId) ?? null;

  while (parentId) {
    ancestors.add(parentId);
    parentId = parentById.get(parentId) ?? null;
  }

  return ancestors;
}

type MenuItemRowProps = {
  item: MenuNode;
  depth: number;
  selectedId: string;
  activeIds: Set<string>;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onNavigate: () => void;
};

function MenuItemRow({
  item,
  depth,
  selectedId,
  activeIds,
  expandedIds,
  onSelect,
  onToggle,
  onNavigate,
}: MenuItemRowProps) {
  const children = item.items ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const isActive = activeIds.has(item.id);
  const childrenId = `navigation-children-${useId()}`;

  return (
    <li className="swiss-menu-item" data-depth={depth}>
      <div className="swiss-menu-row">
        <a
          className="swiss-menu-link"
          href={item.url ?? "#"}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          aria-label={
            item.external ? `${item.label} (opens in a new tab)` : undefined
          }
          aria-current={
            !item.external && selectedId === item.id ? "page" : undefined
          }
          data-active={item.external ? false : isActive}
          onClick={(event) => {
            if (item.external) {
              onNavigate();
              return;
            }
            event.preventDefault();
            onSelect(item.id);
            onNavigate();
          }}
        >
          {item.label}
        </a>
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="swiss-menu-disclosure hover:bg-transparent hover:text-inherit"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
            aria-expanded={isExpanded}
            aria-controls={childrenId}
            data-active={isActive}
            onClick={() => onToggle(item.id)}
          >
            <ChevronRight
              aria-hidden="true"
              className={
                isExpanded
                  ? "swiss-menu-chevron is-expanded"
                  : "swiss-menu-chevron"
              }
            />
          </Button>
        ) : null}
      </div>
      {hasChildren ? (
        <ul id={childrenId} className="swiss-menu-sublist" hidden={!isExpanded}>
          {children.map((child) => (
            <MenuItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedId={selectedId}
              activeIds={activeIds}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function NavMain({ open, onNavigate }: NavMainProps) {
  const { menuItems, selectedId, selectItem } = useMenuItem();
  const { parentById } = useMemo(() => buildMenuIndex(menuItems), [menuItems]);
  const [expandedIds, setExpandedIds] = useState(() =>
    getAncestorIds(selectedId, parentById),
  );
  const activeIds = useMemo(
    () => new Set([selectedId, ...getAncestorIds(selectedId, parentById)]),
    [parentById, selectedId],
  );

  useLayoutEffect(() => {
    if (open) {
      setExpandedIds(getAncestorIds(selectedId, parentById));
    }
  }, [open, parentById, selectedId]);

  const toggleItem = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <nav className="swiss-nav" aria-label="Main navigation">
      <p className="swiss-nav-label">
        <span className="swiss-accent">01</span> / Explore
      </p>
      <ul className="swiss-menu-list">
        {menuItems.map((item) => (
          <MenuItemRow
            key={item.id}
            item={item}
            depth={0}
            selectedId={selectedId}
            activeIds={activeIds}
            expandedIds={expandedIds}
            onSelect={selectItem}
            onToggle={toggleItem}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </nav>
  );
}
