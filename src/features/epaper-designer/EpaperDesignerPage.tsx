import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Download,
  FileCode2,
  FileUp,
  List,
  MousePointer2,
  Plus,
  RotateCcw,
  Rows3,
  SquareDashed,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FONT_IDS,
  FONT_METRICS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  areaBounds,
  boundsContain,
  componentAnchorBounds,
  componentBounds,
  createComponent,
  fitComponentInsideRegion,
  makeStarterLayout,
  maxColumns,
  parseLayout,
  rectanglesOverlap,
  regionChildren,
  renderLayout,
  resolveComponentContainment,
  resolveRegionIntersections,
  serializeLayout,
  validateLayout,
  type Alignment,
  type AnchorArea,
  type ComponentKind,
  type EpaperComponent,
  type FontId,
  type LayoutDocument,
  type ListAreaComponent,
  type RegionComponent,
} from "./epaper-model";
import xsdText from "./epaper-layout-v1.xsd?raw";

const PREVIEW_SCALES = [1, 2, 3, 4] as const;

type Point = { x: number; y: number };
type DrawState = { kind: ComponentKind; start: Point; current: Point };
type InteractionState = {
  id: string;
  mode: "move" | "resize";
  start: Point;
  original: EpaperComponent;
  originalLayout: LayoutDocument;
};
type EditingTarget = {
  componentId: string;
  itemId?: string;
  field?: "left" | "middle" | "right";
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function updateById(
  layout: LayoutDocument,
  id: string,
  updater: (component: EpaperComponent) => EpaperComponent,
): LayoutDocument {
  return {
    ...layout,
    components: layout.components.map((component) =>
      component.id === id ? updater(component) : component,
    ),
  };
}

function kindLabel(kind: ComponentKind): string {
  if (kind === "text-box") return "Text Box";
  if (kind === "text-area") return "Text Area";
  if (kind === "list-area") return "List Area";
  return "Region";
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export default function EpaperDesignerPage() {
  const [layout, setLayout] = useState<LayoutDocument>(() =>
    makeStarterLayout(),
  );
  const [selectedId, setSelectedId] = useState<string>("main");
  const [drawKind, setDrawKind] = useState<ComponentKind | null>(null);
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [pageByListId, setPageByListId] = useState<Record<string, number>>({});
  const [previewScale, setPreviewScale] = useState<number>(3);
  const [message, setMessage] = useState(
    "Double-click a component to type directly on the screen.",
  );
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected =
    layout.components.find((component) => component.id === selectedId) ?? null;
  const issues = useMemo(() => validateLayout(layout), [layout]);
  const issueIds = useMemo(
    () =>
      new Set(
        issues.flatMap((issue) =>
          issue.componentId ? [issue.componentId] : [],
        ),
      ),
    [issues],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.imageSmoothingEnabled = false;
    context.putImageData(renderLayout(layout, pageByListId), 0, 0);
  }, [layout, pageByListId]);

  const commitLayout = (next: LayoutDocument) => {
    setLayout(next);
    setDirty(true);
  };

  const updateComponent = (
    id: string,
    updater: (component: EpaperComponent) => EpaperComponent,
  ) => {
    commitLayout(updateById(layout, id, updater));
  };

  const commitResolvedPlacement = (
    next: LayoutDocument,
    componentId: string,
  ) => {
    const component = next.components.find(
      (candidate) => candidate.id === componentId,
    );
    commitLayout(
      component?.kind === "region"
        ? resolveRegionIntersections(next, componentId)
        : resolveComponentContainment(next, componentId),
    );
  };

  const screenPoint = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(
        Math.floor((event.clientX - rectangle.left) / previewScale),
        0,
        SCREEN_WIDTH - 1,
      ),
      y: clamp(
        Math.floor((event.clientY - rectangle.top) / previewScale),
        0,
        SCREEN_HEIGHT - 1,
      ),
    };
  };

  const handleCanvasPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!drawKind) {
      setSelectedId("");
      setEditing(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = screenPoint(event);
    setDrawState({ kind: drawKind, start: point, current: point });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = screenPoint(event);
    if (drawState) {
      setDrawState({ ...drawState, current: point });
      return;
    }
    if (!interaction) return;
    const metric = FONT_METRICS[interaction.original.font];
    const deltaX = point.x - interaction.start.x;
    const deltaY = point.y - interaction.start.y;
    if (interaction.mode === "move") {
      const originalBounds = componentBounds(interaction.original);
      if (interaction.original.kind === "region") {
        const group = [
          interaction.original,
          ...regionChildren(
            interaction.originalLayout,
            interaction.original.id,
          ),
        ];
        const groupBounds = group.map(componentBounds);
        const minimumX = Math.min(...groupBounds.map((bounds) => bounds.x1));
        const maximumX = Math.max(...groupBounds.map((bounds) => bounds.x2));
        const minimumY = Math.min(...groupBounds.map((bounds) => bounds.y1));
        const maximumY = Math.max(...groupBounds.map((bounds) => bounds.y2));
        const boundedDeltaX = clamp(
          deltaX,
          -minimumX,
          SCREEN_WIDTH - 1 - maximumX,
        );
        const boundedDeltaY = clamp(
          deltaY,
          -minimumY,
          SCREEN_HEIGHT - 1 - maximumY,
        );
        const groupIds = new Set(group.map((component) => component.id));
        const next = {
          ...interaction.originalLayout,
          components: interaction.originalLayout.components.map((component) =>
            groupIds.has(component.id)
              ? {
                  ...component,
                  x: component.x + boundedDeltaX,
                  y: component.y + boundedDeltaY,
                }
              : component,
          ),
        };
        const movedRegion = next.components.find(
          (component) => component.id === interaction.id,
        );
        const overlapsRegion =
          movedRegion?.kind === "region" &&
          next.components.some(
            (component) =>
              component.kind === "region" &&
              component.id !== movedRegion.id &&
              rectanglesOverlap(
                componentBounds(component),
                componentBounds(movedRegion),
              ),
          );
        if (!overlapsRegion) commitLayout(next);
        return;
      }
      commitLayout({
        ...interaction.originalLayout,
        components: interaction.originalLayout.components.map((component) =>
          component.id === interaction.id
            ? {
                ...component,
                x: clamp(
                  interaction.original.x + deltaX,
                  0,
                  SCREEN_WIDTH - originalBounds.width,
                ),
                y: clamp(
                  interaction.original.y + deltaY,
                  0,
                  SCREEN_HEIGHT - originalBounds.height,
                ),
              }
            : component,
        ),
      });
      return;
    }
    const widthDelta =
      interaction.original.alignment === "right"
        ? -deltaX
        : interaction.original.alignment === "middle"
          ? deltaX * 2
          : deltaX;
    const deltaColumns = Math.round(widthDelta / metric.cellWidth);
    const deltaRows = Math.round(deltaY / metric.lineHeight);
    const next = updateById(
      interaction.originalLayout,
      interaction.id,
      (component) => {
        const maxRows = Math.max(
          1,
          Math.floor((SCREEN_HEIGHT - component.y) / metric.lineHeight),
        );
        const rows =
          component.kind === "text-box"
            ? 1
            : clamp(interaction.original.rows + deltaRows, 1, maxRows);
        if (component.kind === "region") {
          const originalPixelWidth =
            interaction.original.kind === "region"
              ? interaction.original.pixelWidth
              : component.pixelWidth;
          const pixelWidth = clamp(
            originalPixelWidth + widthDelta,
            metric.cellWidth,
            areaBounds(component.area).width,
          );
          const x =
            component.alignment === "right"
              ? interaction.original.x + originalPixelWidth - pixelWidth
              : component.alignment === "middle"
                ? Math.round(
                    interaction.original.x +
                      (originalPixelWidth - pixelWidth) / 2,
                  )
                : interaction.original.x;
          const proposed = {
            ...component,
            x: clamp(x, 0, SCREEN_WIDTH - pixelWidth),
            pixelWidth,
            columns: Math.max(1, Math.floor(pixelWidth / metric.cellWidth)),
            rows,
          };
          const containsChildren = regionChildren(
            interaction.originalLayout,
            component.id,
          ).every((child) =>
            boundsContain(componentBounds(proposed), componentBounds(child)),
          );
          return containsChildren ? proposed : component;
        }
        const minimumColumns = component.kind === "list-area" ? 3 : 1;
        const columns = clamp(
          interaction.original.columns + deltaColumns,
          minimumColumns,
          Math.floor(SCREEN_WIDTH / metric.cellWidth),
        );
        const originalWidth = interaction.original.columns * metric.cellWidth;
        const width = columns * metric.cellWidth;
        const x =
          component.alignment === "right"
            ? interaction.original.x + originalWidth - width
            : component.alignment === "middle"
              ? Math.round(interaction.original.x + (originalWidth - width) / 2)
              : interaction.original.x;
        return {
          ...component,
          x: clamp(x, 0, SCREEN_WIDTH - width),
          columns,
          rows,
        } as EpaperComponent;
      },
    );
    const resized = next.components.find(
      (component) => component.id === interaction.id,
    );
    if (
      resized?.kind === "region" &&
      next.components.some(
        (component) =>
          component.kind === "region" &&
          component.id !== resized.id &&
          rectanglesOverlap(
            componentBounds(component),
            componentBounds(resized),
          ),
      )
    )
      return;
    commitLayout(next);
  };

  const finishPointerInteraction = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (drawState) {
      const point = screenPoint(event);
      const x1 = Math.min(drawState.start.x, point.x);
      const x2 = Math.max(drawState.start.x, point.x);
      const y1 = Math.min(drawState.start.y, point.y);
      const y2 = Math.max(drawState.start.y, point.y);
      const area: AnchorArea = x1 < 8 || x2 > 187 ? "full" : "safe";
      const alignment: Alignment = "left";
      const metric = FONT_METRICS["8x16"];
      const pixelWidth = clamp(
        x2 - x1 + 1,
        metric.cellWidth,
        areaBounds(area).width,
      );
      const columns = clamp(
        Math.max(1, Math.round((x2 - x1 + 1) / metric.cellWidth)),
        drawState.kind === "list-area" ? 3 : 1,
        maxColumns("8x16", area),
      );
      const rows =
        drawState.kind === "text-box"
          ? 1
          : Math.max(1, Math.round((y2 - y1 + 1) / metric.lineHeight));
      const component = createComponent(
        drawState.kind,
        x1,
        y1,
        columns,
        rows,
        area,
        alignment,
        drawState.kind === "region" ? pixelWidth : undefined,
      );
      const height = componentBounds(component).height;
      const fitted = {
        ...component,
        x: clamp(
          component.x,
          0,
          SCREEN_WIDTH - componentBounds(component).width,
        ),
        y: clamp(component.y, 0, SCREEN_HEIGHT - height),
      } as EpaperComponent;
      if (
        fitted.kind === "region" &&
        layout.components.some(
          (existing) =>
            existing.kind === "region" &&
            rectanglesOverlap(
              componentBounds(existing),
              componentBounds(fitted),
            ),
        )
      ) {
        setDrawState(null);
        setDrawKind(null);
        setMessage("Regions cannot overlap or contain other Regions.");
        return;
      }
      const withComponent = {
        ...layout,
        components: [...layout.components, fitted],
      };
      const resolved =
        fitted.kind === "region"
          ? resolveRegionIntersections(withComponent, fitted.id)
          : resolveComponentContainment(withComponent, fitted.id);
      commitLayout(resolved);
      setSelectedId(fitted.id);
      setDrawState(null);
      setDrawKind(null);
      setMessage(
        `${kindLabel(fitted.kind)} created. Double-click it to enter content.`,
      );
    } else if (interaction) {
      const current = layout.components.find(
        (component) => component.id === interaction.id,
      );
      const resolved =
        current?.kind === "region"
          ? resolveRegionIntersections(layout, current.id)
          : resolveComponentContainment(layout, interaction.id);
      commitLayout(resolved);
      const placed = resolved.components.find(
        (component) => component.id === interaction.id,
      );
      const parent = placed?.parentRegionId
        ? resolved.components.find(
            (component) => component.id === placed.parentRegionId,
          )
        : undefined;
      setMessage(
        parent
          ? `${placed?.name} is fully contained by ${parent.name}.`
          : `${placed?.name ?? "Component"} is outside all Regions.`,
      );
    }
    setInteraction(null);
  };

  const beginInteraction = (
    event: React.PointerEvent,
    component: EpaperComponent,
    mode: "move" | "resize",
  ) => {
    if (drawKind) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const parent = (event.currentTarget as HTMLElement).closest(
      "[data-epaper-screen]",
    ) as HTMLElement | null;
    if (!parent) return;
    const rectangle = parent.getBoundingClientRect();
    const point = {
      x: Math.floor((event.clientX - rectangle.left) / previewScale),
      y: Math.floor((event.clientY - rectangle.top) / previewScale),
    };
    setSelectedId(component.id);
    setEditing(null);
    setInteraction({
      id: component.id,
      mode,
      start: point,
      original: component,
      originalLayout: layout,
    });
  };

  const beginEditing = (
    event: React.MouseEvent,
    component: EpaperComponent,
  ) => {
    event.stopPropagation();
    setSelectedId(component.id);
    if (component.kind === "text-box" || component.kind === "text-area") {
      setEditing({ componentId: component.id });
      return;
    }
    if (component.kind === "region") return;
    const target = event.currentTarget as HTMLElement;
    const rectangle = target.getBoundingClientRect();
    const localX = Math.floor((event.clientX - rectangle.left) / previewScale);
    const localY = Math.floor((event.clientY - rectangle.top) / previewScale);
    const metric = FONT_METRICS[component.font];
    const row = clamp(
      Math.floor(localY / metric.lineHeight),
      0,
      component.rows - 1,
    );
    const page = pageByListId[component.id] ?? component.initialPage;
    const item = component.items[page * component.rows + row];
    if (!item) return;
    const relative = localX / Math.max(1, componentBounds(component).width);
    const field =
      relative < 1 / 3 ? "left" : relative > 2 / 3 ? "right" : "middle";
    setEditing({ componentId: component.id, itemId: item.id, field });
  };

  const activeEditor = (() => {
    if (!editing) return null;
    const component = layout.components.find(
      (item) => item.id === editing.componentId,
    );
    if (!component) return null;
    const bounds = componentBounds(component);
    if (component.kind === "text-box" || component.kind === "text-area") {
      return {
        component,
        bounds,
        value: component.text,
        multiline: component.kind === "text-area",
        editorRows: component.rows,
      };
    }
    if (component.kind === "region") return null;
    const item = component.items.find(
      (candidate) => candidate.id === editing.itemId,
    );
    const field = editing.field;
    if (!item || !field) return null;
    const page = pageByListId[component.id] ?? component.initialPage;
    const itemIndex =
      component.items.findIndex((candidate) => candidate.id === item.id) -
      page * component.rows;
    if (itemIndex < 0 || itemIndex >= component.rows) return null;
    const zoneColumns = [
      Math.floor(component.columns / 3),
      component.columns - Math.floor(component.columns / 3) * 2,
      Math.floor(component.columns / 3),
    ];
    const zoneIndex = field === "left" ? 0 : field === "middle" ? 1 : 2;
    const cellStart = zoneColumns
      .slice(0, zoneIndex)
      .reduce((sum, value) => sum + value, 0);
    const metric = FONT_METRICS[component.font];
    return {
      component,
      bounds: {
        ...bounds,
        x1: bounds.x1 + cellStart * metric.cellWidth,
        x2:
          bounds.x1 +
          (cellStart + zoneColumns[zoneIndex]) * metric.cellWidth -
          1,
        y1: bounds.y1 + itemIndex * metric.lineHeight,
        y2: bounds.y1 + (itemIndex + 1) * metric.lineHeight - 1,
        width: zoneColumns[zoneIndex] * metric.cellWidth,
        height: metric.lineHeight,
      },
      value: item[field],
      multiline: false,
      editorRows: 1,
    };
  })();

  const changeEditorText = (value: string) => {
    if (!editing) return;
    updateComponent(editing.componentId, (component) => {
      if (component.kind === "text-box" || component.kind === "text-area")
        return { ...component, text: value };
      if (component.kind === "region") return component;
      if (!editing.itemId || !editing.field) return component;
      return {
        ...component,
        items: component.items.map((item) =>
          item.id === editing.itemId
            ? { ...item, [editing.field!]: value }
            : item,
        ),
      };
    });
  };

  const resetLayout = () => {
    if (
      dirty &&
      !window.confirm("Replace the current layout with the starter layout?")
    )
      return;
    setLayout(makeStarterLayout());
    setSelectedId("main");
    setPageByListId({});
    setDirty(false);
    setMessage("Starter layout restored.");
  };

  const importXml = async (file: File) => {
    if (
      dirty &&
      !window.confirm("Importing will replace the current layout. Continue?")
    )
      return;
    try {
      const imported = parseLayout(await file.text());
      setLayout(imported);
      setSelectedId(imported.components[0]?.id ?? "");
      setPageByListId({});
      setDirty(false);
      setMessage(`${file.name} imported successfully.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to import that XML file.",
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exportXml = () => {
    if (issues.length > 0) return;
    const blob = new Blob([serializeLayout(layout)], {
      type: "application/xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "epaper-layout.xml";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setDirty(false);
    setMessage("epaper-layout.xml downloaded.");
  };

  const downloadXsd = () => {
    const blob = new Blob([xsdText], {
      type: "application/xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "epaper-layout-v1.xsd";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage("epaper-layout-v1.xsd downloaded.");
  };

  const deleteSelected = () => {
    if (!selected) return;
    commitLayout({
      ...layout,
      components: layout.components
        .filter((component) => component.id !== selected.id)
        .map((component) =>
          selected.kind === "region" && component.parentRegionId === selected.id
            ? { ...component, parentRegionId: undefined }
            : component,
        ),
    });
    setSelectedId("");
    setEditing(null);
  };

  const changeFont = (font: FontId) => {
    if (!selected) return;
    if (selected.parentRegionId) return;
    if (selected.kind === "region") {
      const metric = FONT_METRICS[font];
      const pixelWidth = clamp(
        selected.pixelWidth,
        metric.cellWidth,
        areaBounds(selected.area).width,
      );
      const rows = Math.min(
        selected.rows,
        Math.max(
          1,
          Math.floor((SCREEN_HEIGHT - selected.y) / metric.lineHeight),
        ),
      );
      const region: RegionComponent = {
        ...selected,
        font,
        pixelWidth,
        columns: Math.max(1, Math.floor(pixelWidth / metric.cellWidth)),
        rows,
        x: clamp(selected.x, 0, SCREEN_WIDTH - pixelWidth),
      };
      const fittedChildren = regionChildren(layout, selected.id).map((child) =>
        fitComponentInsideRegion(child, region),
      );
      if (fittedChildren.some((child) => child === null)) {
        setMessage(
          "That font cannot preserve the minimum child capacity in this Region.",
        );
        return;
      }
      const fittedById = new Map(
        fittedChildren
          .filter((child) => child !== null)
          .map((child) => [child.id, child]),
      );
      const next = {
        ...layout,
        components: layout.components.map((component) =>
          component.id === region.id
            ? region
            : (fittedById.get(component.id) ?? component),
        ),
      };
      commitResolvedPlacement(next, region.id);
      return;
    }
    const next = updateById(layout, selected.id, (component) => {
      const columns = clamp(
        component.columns,
        component.kind === "list-area" ? 3 : 1,
        maxColumns(font, component.area),
      );
      const metric = FONT_METRICS[font];
      const maxRows = Math.max(
        1,
        Math.floor((SCREEN_HEIGHT - component.y) / metric.lineHeight),
      );
      return {
        ...component,
        font,
        columns,
        x: clamp(
          component.x,
          0,
          SCREEN_WIDTH - columns * FONT_METRICS[font].cellWidth,
        ),
        rows:
          component.kind === "text-box" ? 1 : Math.min(component.rows, maxRows),
      } as EpaperComponent;
    });
    commitResolvedPlacement(next, selected.id);
  };

  const changeArea = (area: AnchorArea) => {
    if (!selected) return;
    if (selected.parentRegionId) return;
    const next = updateById(layout, selected.id, (component) => {
      if (component.kind === "region") {
        const pixelWidth = Math.min(
          component.pixelWidth,
          areaBounds(area).width,
        );
        return {
          ...component,
          area,
          pixelWidth,
          x: clamp(component.x, 0, SCREEN_WIDTH - pixelWidth),
          columns: Math.max(
            1,
            Math.floor(pixelWidth / FONT_METRICS[component.font].cellWidth),
          ),
        };
      }
      return {
        ...component,
        area,
        columns: Math.min(component.columns, maxColumns(component.font, area)),
      };
    });
    const changed = next.components.find(
      (component) => component.id === selected.id,
    );
    if (changed?.kind === "region") {
      const fittedChildren = regionChildren(next, changed.id).map((child) =>
        fitComponentInsideRegion(child, changed),
      );
      if (fittedChildren.some((child) => child === null)) {
        setMessage("That anchor area is too narrow for a contained component.");
        return;
      }
      const fittedById = new Map(
        fittedChildren
          .filter((child) => child !== null)
          .map((child) => [child.id, child]),
      );
      commitResolvedPlacement(
        {
          ...next,
          components: next.components.map(
            (component) => fittedById.get(component.id) ?? component,
          ),
        },
        selected.id,
      );
      return;
    }
    commitResolvedPlacement(next, selected.id);
  };

  const alignSelected = (alignment: Alignment) => {
    if (!selected) return;
    const anchor = componentAnchorBounds(layout, selected);
    const bounds = componentBounds(selected);
    const x =
      alignment === "right"
        ? anchor.x2 - bounds.width + 1
        : alignment === "middle"
          ? anchor.x1 + Math.floor((anchor.width - bounds.width) / 2)
          : anchor.x1;
    if (selected.kind === "region") {
      const deltaX = x - selected.x;
      const childIds = new Set(
        regionChildren(layout, selected.id).map((child) => child.id),
      );
      const next = {
        ...layout,
        components: layout.components.map((component) =>
          component.id === selected.id
            ? { ...component, alignment, x }
            : childIds.has(component.id)
              ? { ...component, x: component.x + deltaX }
              : component,
        ),
      };
      commitResolvedPlacement(next, selected.id);
      return;
    }
    commitResolvedPlacement(
      updateById(layout, selected.id, (component) => ({
        ...component,
        alignment,
        x,
      })),
      selected.id,
    );
  };

  const selectedBounds = selected ? componentBounds(selected) : null;
  const selectedMetric = selected ? FONT_METRICS[selected.font] : null;
  const currentList = selected?.kind === "list-area" ? selected : null;
  const currentListPage = currentList
    ? (pageByListId[currentList.id] ?? currentList.initialPage)
    : 0;
  const currentListPageCount = currentList
    ? Math.max(1, Math.ceil(currentList.items.length / currentList.rows))
    : 1;
  const parentRegion = selected?.parentRegionId
    ? layout.components.find(
        (component): component is RegionComponent =>
          component.kind === "region" &&
          component.id === selected.parentRegionId,
      )
    : null;
  const previewScaleIndex = PREVIEW_SCALES.findIndex(
    (scale) => scale === previewScale,
  );
  const canvasComponents = [
    ...layout.components.filter((component) => component.kind === "region"),
    ...layout.components.filter((component) => component.kind !== "region"),
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-1 md:p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <MousePointer2 className="h-3.5 w-3.5" /> 200 × 200 · 1-bit · Spleen
            2.2.0
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            E-Paper UI Designer
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Draw fixed-capacity components, type directly on the enlarged
            pixels, and export the exact layout as XML.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={resetLayout}>
            <RotateCcw /> Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp /> Import XML
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importXml(file);
            }}
          />
          <Button variant="outline" size="sm" onClick={downloadXsd}>
            <FileCode2 /> Download XSD
          </Button>
          <Button size="sm" disabled={issues.length > 0} onClick={exportXml}>
            <Download /> Export XML
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(650px,1fr)_360px]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-3">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Draw
            </span>
            {(
              [
                "text-box",
                "text-area",
                "list-area",
                "region",
              ] as ComponentKind[]
            ).map((kind) => {
              const Icon =
                kind === "text-box"
                  ? Type
                  : kind === "text-area"
                    ? Rows3
                    : kind === "list-area"
                      ? List
                      : SquareDashed;
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant={drawKind === kind ? "default" : "outline"}
                  onClick={() => setDrawKind(drawKind === kind ? null : kind)}
                >
                  <Icon /> {kindLabel(kind)}
                </Button>
              );
            })}
            {drawKind && (
              <span className="text-xs text-muted-foreground">
                Drag a rectangle on the screen.
              </span>
            )}
            <div className="ml-auto flex items-center gap-1 rounded-md border bg-background p-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={previewScaleIndex <= 0}
                aria-label="Zoom preview out"
                onClick={() =>
                  setPreviewScale(PREVIEW_SCALES[previewScaleIndex - 1])
                }
              >
                <ZoomOut />
              </Button>
              <button
                type="button"
                className="min-w-24 px-2 text-center text-xs font-medium"
                title="Show the screen at its 200 by 200 browser-pixel size"
                onClick={() => setPreviewScale(1)}
              >
                {previewScale === 1
                  ? "1× · actual pixels"
                  : `${previewScale}× preview`}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={previewScaleIndex >= PREVIEW_SCALES.length - 1}
                aria-label="Zoom preview in"
                onClick={() =>
                  setPreviewScale(PREVIEW_SCALES[previewScaleIndex + 1])
                }
              >
                <ZoomIn />
              </Button>
            </div>
          </div>

          <div className="overflow-auto bg-[radial-gradient(circle_at_top,_hsl(var(--muted)),_hsl(var(--background))_70%)] p-5">
            <div
              data-epaper-screen
              className={`relative mx-auto touch-none select-none bg-white shadow-[0_24px_80px_rgba(0,0,0,0.25)] ${drawKind ? "cursor-crosshair" : "cursor-default"}`}
              style={{
                width: SCREEN_WIDTH * previewScale,
                height: SCREEN_HEIGHT * previewScale,
              }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerInteraction}
              onPointerCancel={finishPointerInteraction}
            >
              <canvas
                ref={canvasRef}
                width={SCREEN_WIDTH}
                height={SCREEN_HEIGHT}
                className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
                aria-label="200 by 200 pixel e-paper preview"
              />

              <div
                className="pointer-events-none absolute border border-dashed border-sky-500/50"
                style={{
                  left: 8 * previewScale,
                  top: 25 * previewScale,
                  width: 180 * previewScale,
                  height: 43 * previewScale,
                }}
              />
              <div
                className="pointer-events-none absolute border border-dashed border-sky-500/50"
                style={{
                  left: 8 * previewScale,
                  top: 68 * previewScale,
                  width: 180 * previewScale,
                  height: 120 * previewScale,
                }}
              />

              {canvasComponents.map((component) => {
                const bounds = componentBounds(component);
                const isSelected = component.id === selectedId;
                const hasIssue = issueIds.has(component.id);
                return (
                  <div
                    key={component.id}
                    className={`absolute group ${drawKind ? "pointer-events-none" : "cursor-move"} ${hasIssue ? "outline outline-2 outline-red-500" : isSelected ? "outline outline-2 outline-sky-500" : "outline outline-1 outline-sky-500/35 hover:outline-sky-500"}`}
                    style={{
                      left: bounds.x1 * previewScale,
                      top: bounds.y1 * previewScale,
                      width: bounds.width * previewScale,
                      height: bounds.height * previewScale,
                    }}
                    onPointerDown={(event) =>
                      beginInteraction(event, component, "move")
                    }
                    onDoubleClick={(event) => beginEditing(event, component)}
                    title={`${component.name} · ${kindLabel(component.kind)}`}
                  >
                    <span
                      className={`pointer-events-none absolute -top-6 left-0 rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${hasIssue ? "bg-red-500 text-white" : "bg-sky-500 text-white"}`}
                    >
                      {component.name}
                    </span>
                    {isSelected && !drawKind && (
                      <button
                        type="button"
                        aria-label={`Resize ${component.name}`}
                        className={`absolute -bottom-2 h-4 w-4 rounded-sm border-2 border-white bg-sky-500 shadow ${component.alignment === "right" ? "-left-2 cursor-nesw-resize" : "-right-2 cursor-nwse-resize"}`}
                        onPointerDown={(event) =>
                          beginInteraction(event, component, "resize")
                        }
                      />
                    )}
                  </div>
                );
              })}

              {drawState && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-emerald-500 bg-emerald-400/10"
                  style={{
                    left:
                      Math.min(drawState.start.x, drawState.current.x) *
                      previewScale,
                    top:
                      Math.min(drawState.start.y, drawState.current.y) *
                      previewScale,
                    width: Math.max(
                      3,
                      Math.abs(drawState.current.x - drawState.start.x) *
                        previewScale,
                    ),
                    height: Math.max(
                      3,
                      Math.abs(drawState.current.y - drawState.start.y) *
                        previewScale,
                    ),
                  }}
                />
              )}

              {activeEditor && (
                <textarea
                  autoFocus
                  value={activeEditor.value}
                  rows={activeEditor.multiline ? activeEditor.editorRows : 1}
                  className="absolute z-30 resize-none overflow-hidden border-2 border-amber-400 bg-transparent p-0 font-mono text-transparent outline-none caret-amber-500 selection:bg-amber-300/40"
                  style={{
                    left: activeEditor.bounds.x1 * previewScale,
                    top: activeEditor.bounds.y1 * previewScale,
                    width: activeEditor.bounds.width * previewScale,
                    height: activeEditor.bounds.height * previewScale,
                    fontSize:
                      FONT_METRICS[activeEditor.component.font].bitmapHeight *
                      previewScale,
                    lineHeight: `${FONT_METRICS[activeEditor.component.font].lineHeight * previewScale}px`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => changeEditorText(event.target.value)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditing(null);
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-xs">
            <span
              className={
                issues.length
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              }
            >
              {issues.length
                ? `${issues.length} validation issue${issues.length === 1 ? "" : "s"} · Export is disabled`
                : message}
            </span>
            {selected && selectedBounds && selectedMetric ? (
              <span className="font-mono text-muted-foreground">
                {selected.name} · {selected.font} · {selected.alignment} · (
                {selectedBounds.x1},{selectedBounds.y1})–({selectedBounds.x2},
                {selectedBounds.y2}) · {selected.columns}c × {selected.rows}r
              </span>
            ) : (
              <span className="text-muted-foreground">
                No component selected
              </span>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Component</h2>
                <p className="text-xs text-muted-foreground">
                  Geometry changes in whole cells and lines.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={!selected}
                onClick={deleteSelected}
                aria-label="Delete selected component"
              >
                <Trash2 />
              </Button>
            </div>
            {!selected ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Select a component or draw a new one.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="component-name">Component name</Label>
                  <Input
                    id="component-name"
                    value={selected.name}
                    onChange={(event) =>
                      updateComponent(selected.id, (component) => ({
                        ...component,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Font</Label>
                    <Select
                      value={selected.font}
                      disabled={Boolean(parentRegion)}
                      onValueChange={(value) => changeFont(value as FontId)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_IDS.map((font) => (
                          <SelectItem key={font} value={font}>
                            Spleen {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {parentRegion && (
                      <p className="text-[11px] text-muted-foreground">
                        Inherited from {parentRegion.name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Anchor area</Label>
                    <Select
                      value={selected.area}
                      disabled={Boolean(parentRegion)}
                      onValueChange={(value) => changeArea(value as AnchorArea)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="safe">Safe 8–187</SelectItem>
                        <SelectItem value="full">Full 0–199</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Box and text alignment</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["left", "middle", "right"] as Alignment[]).map(
                      (alignment) => {
                        const Icon =
                          alignment === "left"
                            ? AlignLeft
                            : alignment === "middle"
                              ? AlignCenter
                              : AlignRight;
                        return (
                          <Button
                            key={alignment}
                            type="button"
                            size="sm"
                            variant={
                              selected.alignment === alignment
                                ? "default"
                                : "outline"
                            }
                            onClick={() => alignSelected(alignment)}
                          >
                            <Icon />
                            <span className="sr-only">{alignment}</span>
                          </Button>
                        );
                      },
                    )}
                  </div>
                </div>
                <ToggleRow
                  label="Selectable"
                  description="Allow this component or its list rows to hold selection state."
                  checked={selected.selectable}
                  onCheckedChange={(checked) =>
                    updateComponent(
                      selected.id,
                      (component) =>
                        ({
                          ...component,
                          selectable: checked,
                          selected: checked ? component.selected : false,
                          ...(component.kind === "list-area" && !checked
                            ? {
                                items: component.items.map((item) => ({
                                  ...item,
                                  selected: false,
                                })),
                              }
                            : {}),
                        }) as EpaperComponent,
                    )
                  }
                />
                <ToggleRow
                  label="Selected"
                  description={
                    selected.kind === "list-area"
                      ? "Invert the whole list and all of its child fields."
                      : "Invert this component to white text on black."
                  }
                  checked={selected.selected}
                  disabled={!selected.selectable}
                  onCheckedChange={(checked) =>
                    updateComponent(selected.id, (component) => ({
                      ...component,
                      selected: checked,
                    }))
                  }
                />
                {(selected.kind === "list-area" ||
                  selected.kind === "region") && (
                  <ToggleRow
                    label="Invert color"
                    description={`Invert the entire ${kindLabel(selected.kind)}, including every child field.`}
                    checked={selected.invertColor}
                    onCheckedChange={(checked) =>
                      updateComponent(selected.id, (component) =>
                        component.kind === "list-area" ||
                        component.kind === "region"
                          ? { ...component, invertColor: checked }
                          : component,
                      )
                    }
                  />
                )}
                <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  {parentRegion && (
                    <div className="mb-1 flex justify-between">
                      <span>Contained by</span>
                      <span className="font-medium text-foreground">
                        {parentRegion.name}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Capacity</span>
                    <span className="font-mono text-foreground">
                      {selected.kind === "region"
                        ? `${selected.pixelWidth}px (${selected.columns} columns)`
                        : `${selected.columns} columns`}{" "}
                      × {selected.rows} {selected.rows === 1 ? "row" : "rows"}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>Step size</span>
                    <span className="font-mono text-foreground">
                      {selectedMetric?.cellWidth}px ×{" "}
                      {selectedMetric?.lineHeight}px
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {currentList && (
            <ListEditor
              list={currentList}
              page={currentListPage}
              pageCount={currentListPageCount}
              onPageChange={(page) =>
                setPageByListId((current) => ({
                  ...current,
                  [currentList.id]: page,
                }))
              }
              onChange={(updated) =>
                updateComponent(currentList.id, () => updated)
              }
            />
          )}

          {issues.length > 0 && (
            <section className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
              <h2 className="font-semibold text-red-700 dark:text-red-300">
                Fix before export
              </h2>
              <ul className="mt-2 space-y-1 text-xs text-red-700 dark:text-red-300">
                {issues.map((issue, index) => (
                  <li key={`${issue.componentId}-${index}`}>
                    • {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ListEditor({
  list,
  page,
  pageCount,
  onPageChange,
  onChange,
}: {
  list: ListAreaComponent;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onChange: (list: ListAreaComponent) => void;
}) {
  const visibleItems = list.items.slice(
    page * list.rows,
    page * list.rows + list.rows,
  );
  const addItem = () => {
    const nextItems = [
      ...list.items,
      {
        id: crypto.randomUUID(),
        left: "Item",
        middle: "",
        right: ">",
        selected: false,
      },
    ];
    onChange({ ...list, items: nextItems });
    onPageChange(Math.floor((nextItems.length - 1) / list.rows));
  };
  const updateItem = (
    id: string,
    field: "left" | "middle" | "right",
    value: string,
  ) =>
    onChange({
      ...list,
      items: list.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    });
  const selectItem = (id: string, checked: boolean) =>
    onChange({
      ...list,
      items: list.items.map((item) => ({
        ...item,
        selected: checked && item.id === id,
      })),
    });
  const removeItem = (id: string) => {
    const items = list.items.filter((item) => item.id !== id);
    onChange({
      ...list,
      items,
      initialPage: Math.min(
        list.initialPage,
        Math.max(0, Math.ceil(items.length / list.rows) - 1),
      ),
    });
    onPageChange(
      Math.min(page, Math.max(0, Math.ceil(items.length / list.rows) - 1)),
    );
  };
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">List rows</h2>
          <p className="text-xs text-muted-foreground">
            Left, middle, and right fields repeat on every row.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus /> Row
        </Button>
      </div>
      <div className="mb-3 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs">
        <Button
          variant="ghost"
          size="sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page + 1} of {pageCount}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
      <div className="space-y-2">
        {visibleItems.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            This page has no rows.
          </p>
        )}
        {visibleItems.map((item, index) => (
          <div key={item.id} className="rounded-lg border p-2">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">
                Row {page * list.rows + index + 1}
              </span>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Selected</Label>
                <Switch
                  checked={item.selected}
                  disabled={!list.selectable}
                  onCheckedChange={(checked) => selectItem(item.id, checked)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["left", "middle", "right"] as const).map((field) => (
                <Input
                  key={field}
                  value={item[field]}
                  className="h-8 px-2 text-xs"
                  aria-label={`${field} text for row ${index + 1}`}
                  onChange={(event) =>
                    updateItem(item.id, field, event.target.value)
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
