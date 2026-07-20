import { SPLEEN_BITMAPS } from "./spleen-font-data";

export const SCREEN_WIDTH = 200;
export const SCREEN_HEIGHT = 200;
export const SAFE_LEFT = 8;
export const SAFE_RIGHT = 187;

export type FontId = "5x8" | "6x12" | "8x16" | "12x24" | "16x32" | "32x64";
export type Alignment = "left" | "middle" | "right";
export type AnchorArea = "safe" | "full";
export type ComponentKind = "text-box" | "text-area" | "list-area" | "region";

export type FontMetric = {
  id: FontId;
  bitmapWidth: number;
  bitmapHeight: number;
  fontBoxHeight: number;
  lineTop: number;
  lineBottom: number;
  lineHeight: number;
  characterLeft: number;
  characterRight: number;
  cellWidth: number;
};

export const FONT_METRICS: Record<FontId, FontMetric> = {
  "5x8": {
    id: "5x8",
    bitmapWidth: 5,
    bitmapHeight: 8,
    fontBoxHeight: 10,
    lineTop: 1,
    lineBottom: 2,
    lineHeight: 13,
    characterLeft: 1,
    characterRight: 1,
    cellWidth: 7,
  },
  "6x12": {
    id: "6x12",
    bitmapWidth: 6,
    bitmapHeight: 12,
    fontBoxHeight: 13,
    lineTop: 2,
    lineBottom: 2,
    lineHeight: 17,
    characterLeft: 1,
    characterRight: 1,
    cellWidth: 8,
  },
  "8x16": {
    id: "8x16",
    bitmapWidth: 8,
    bitmapHeight: 16,
    fontBoxHeight: 20,
    lineTop: 2,
    lineBottom: 3,
    lineHeight: 25,
    characterLeft: 1,
    characterRight: 1,
    cellWidth: 10,
  },
  "12x24": {
    id: "12x24",
    bitmapWidth: 12,
    bitmapHeight: 24,
    fontBoxHeight: 26,
    lineTop: 3,
    lineBottom: 4,
    lineHeight: 33,
    characterLeft: 1,
    characterRight: 1,
    cellWidth: 14,
  },
  "16x32": {
    id: "16x32",
    bitmapWidth: 16,
    bitmapHeight: 32,
    fontBoxHeight: 34,
    lineTop: 4,
    lineBottom: 5,
    lineHeight: 43,
    characterLeft: 2,
    characterRight: 2,
    cellWidth: 20,
  },
  "32x64": {
    id: "32x64",
    bitmapWidth: 32,
    bitmapHeight: 64,
    fontBoxHeight: 68,
    lineTop: 8,
    lineBottom: 10,
    lineHeight: 86,
    characterLeft: 4,
    characterRight: 4,
    cellWidth: 40,
  },
};

export const FONT_IDS = Object.keys(FONT_METRICS) as FontId[];

type BaseComponent = {
  id: string;
  name: string;
  kind: ComponentKind;
  font: FontId;
  area: AnchorArea;
  alignment: Alignment;
  x: number;
  y: number;
  columns: number;
  rows: number;
  selectable: boolean;
  selected: boolean;
  parentRegionId?: string;
};

export type TextBoxComponent = BaseComponent & {
  kind: "text-box";
  rows: 1;
  text: string;
};

export type TextAreaComponent = BaseComponent & {
  kind: "text-area";
  text: string;
};

export type ListItem = {
  id: string;
  left: string;
  middle: string;
  right: string;
  selected: boolean;
};

export type ListAreaComponent = BaseComponent & {
  kind: "list-area";
  invertColor: boolean;
  initialPage: number;
  items: ListItem[];
};

export type RegionComponent = BaseComponent & {
  kind: "region";
  pixelWidth: number;
  invertColor: boolean;
};

export type EpaperComponent =
  | TextBoxComponent
  | TextAreaComponent
  | ListAreaComponent
  | RegionComponent;

export type Bounds = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
};

export type LayoutDocument = {
  version: 1;
  components: EpaperComponent[];
};

export type ValidationIssue = {
  componentId?: string;
  message: string;
};

const glyphCache = new Map<FontId, Uint8Array>();

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function glyphBytes(font: FontId): Uint8Array {
  const cached = glyphCache.get(font);
  if (cached) return cached;
  const decoded = decodeBase64(SPLEEN_BITMAPS[font].data);
  glyphCache.set(font, decoded);
  return decoded;
}

export function normalizeText(value: string): string {
  return Array.from(value.replace(/\r\n?/g, "\n"))
    .map((character) => {
      if (character === "\n") return character;
      const codePoint = character.codePointAt(0) ?? 63;
      return codePoint >= 32 && codePoint <= 126 ? character : "?";
    })
    .join("");
}

function ellipsize(value: string, columns: number): string {
  if (value.length <= columns) return value;
  if (columns < 3) return value.slice(0, columns);
  return `${value.slice(0, Math.max(0, columns - 3))}...`;
}

function forceEllipsis(value: string, columns: number): string {
  if (columns < 3) return value.slice(0, columns);
  return `${value.slice(0, Math.max(0, columns - 3))}...`;
}

export function wrapText(
  value: string,
  columns: number,
  rows: number,
): { lines: string[]; overflow: boolean } {
  if (columns <= 0 || rows <= 0)
    return { lines: [], overflow: value.length > 0 };
  const normalized = normalizeText(value);
  const pending = normalized.split("\n");
  const lines: string[] = [];
  let overflow = false;

  while (pending.length > 0 && lines.length < rows) {
    let paragraph = pending.shift() ?? "";
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    while (paragraph.length > columns && lines.length < rows) {
      const candidate = paragraph.slice(0, columns + 1);
      const lastSpace = candidate.lastIndexOf(" ", columns);
      const breakAt = lastSpace > 0 ? lastSpace : columns;
      lines.push(paragraph.slice(0, breakAt).trimEnd());
      paragraph = paragraph
        .slice(breakAt + (lastSpace > 0 ? 1 : 0))
        .trimStart();
    }
    if (lines.length < rows) lines.push(paragraph);
    else if (paragraph.length > 0) overflow = true;
  }

  if (pending.length > 0) overflow = true;
  if (overflow && lines.length > 0) {
    const lastIndex = Math.min(rows, lines.length) - 1;
    lines[lastIndex] = forceEllipsis(lines[lastIndex], columns);
  }
  return { lines: lines.slice(0, rows), overflow };
}

export function textBoxLine(
  value: string,
  columns: number,
): { line: string; overflow: boolean } {
  const normalized = normalizeText(value).replace(/\n/g, " ");
  return {
    line: ellipsize(normalized, columns),
    overflow: normalized.length > columns,
  };
}

export function areaBounds(area: AnchorArea): {
  x1: number;
  x2: number;
  width: number;
} {
  const x1 = area === "safe" ? SAFE_LEFT : 0;
  const x2 = area === "safe" ? SAFE_RIGHT : SCREEN_WIDTH - 1;
  return { x1, x2, width: x2 - x1 + 1 };
}

export function maxColumns(font: FontId, area: AnchorArea): number {
  return Math.floor(areaBounds(area).width / FONT_METRICS[font].cellWidth);
}

export function componentBounds(component: EpaperComponent): Bounds {
  const metric = FONT_METRICS[component.font];
  const width =
    component.kind === "region"
      ? component.pixelWidth
      : component.columns * metric.cellWidth;
  const height = component.rows * metric.lineHeight;
  return {
    x1: component.x,
    y1: component.y,
    x2: component.x + width - 1,
    y2: component.y + height - 1,
    width,
    height,
  };
}

export function rectanglesOverlap(a: Bounds, b: Bounds): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}

export function boundsContain(container: Bounds, child: Bounds): boolean {
  return (
    child.x1 >= container.x1 &&
    child.y1 >= container.y1 &&
    child.x2 <= container.x2 &&
    child.y2 <= container.y2
  );
}

export function intersectionArea(a: Bounds, b: Bounds): number {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) + 1);
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) + 1);
  return width * height;
}

export function overlapRatio(target: Bounds, container: Bounds): number {
  return intersectionArea(target, container) / (target.width * target.height);
}

export function regionChildren(
  layout: LayoutDocument,
  regionId: string,
): Exclude<EpaperComponent, RegionComponent>[] {
  return layout.components.filter(
    (component): component is Exclude<EpaperComponent, RegionComponent> =>
      component.kind !== "region" && component.parentRegionId === regionId,
  );
}

export function componentAnchorBounds(
  layout: LayoutDocument,
  component: EpaperComponent,
): { x1: number; x2: number; width: number } {
  if (component.parentRegionId) {
    const parent = layout.components.find(
      (candidate): candidate is RegionComponent =>
        candidate.kind === "region" &&
        candidate.id === component.parentRegionId,
    );
    if (parent) {
      const bounds = componentBounds(parent);
      return { x1: bounds.x1, x2: bounds.x2, width: bounds.width };
    }
  }
  return areaBounds(component.area);
}

type NonRegionComponent = Exclude<EpaperComponent, RegionComponent>;

export function fitComponentInsideRegion(
  component: NonRegionComponent,
  region: RegionComponent,
): NonRegionComponent | null {
  const regionBounds = componentBounds(region);
  const metric = FONT_METRICS[region.font];
  const minimumColumns = component.kind === "list-area" ? 3 : 1;
  const maximumColumns = Math.floor(regionBounds.width / metric.cellWidth);
  const maximumRows = Math.floor(regionBounds.height / metric.lineHeight);
  if (maximumColumns < minimumColumns || maximumRows < 1) return null;
  const columns = clampNumber(
    component.columns,
    minimumColumns,
    maximumColumns,
  );
  const rows =
    component.kind === "text-box"
      ? 1
      : clampNumber(component.rows, 1, maximumRows);
  const width = columns * metric.cellWidth;
  const height = rows * metric.lineHeight;
  return {
    ...component,
    font: region.font,
    columns,
    rows,
    x: clampNumber(component.x, regionBounds.x1, regionBounds.x2 - width + 1),
    y: clampNumber(component.y, regionBounds.y1, regionBounds.y2 - height + 1),
    parentRegionId: region.id,
  } as NonRegionComponent;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function nearestOutsidePosition(
  component: NonRegionComponent,
  region: RegionComponent,
): { x: number; y: number } | null {
  const bounds = componentBounds(component);
  const regionBounds = componentBounds(region);
  const candidates = [
    {
      x: regionBounds.x1 - bounds.width,
      y: clampNumber(component.y, 0, SCREEN_HEIGHT - bounds.height),
    },
    {
      x: regionBounds.x2 + 1,
      y: clampNumber(component.y, 0, SCREEN_HEIGHT - bounds.height),
    },
    {
      x: clampNumber(component.x, 0, SCREEN_WIDTH - bounds.width),
      y: regionBounds.y1 - bounds.height,
    },
    {
      x: clampNumber(component.x, 0, SCREEN_WIDTH - bounds.width),
      y: regionBounds.y2 + 1,
    },
  ].filter((candidate) => {
    const candidateBounds = {
      x1: candidate.x,
      y1: candidate.y,
      x2: candidate.x + bounds.width - 1,
      y2: candidate.y + bounds.height - 1,
      width: bounds.width,
      height: bounds.height,
    };
    return (
      candidateBounds.x1 >= 0 &&
      candidateBounds.y1 >= 0 &&
      candidateBounds.x2 < SCREEN_WIDTH &&
      candidateBounds.y2 < SCREEN_HEIGHT &&
      !rectanglesOverlap(candidateBounds, regionBounds)
    );
  });
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => {
    const leftDistance =
      (left.x - component.x) ** 2 + (left.y - component.y) ** 2;
    const rightDistance =
      (right.x - component.x) ** 2 + (right.y - component.y) ** 2;
    return leftDistance - rightDistance;
  })[0];
}

export function resolveComponentContainment(
  layout: LayoutDocument,
  componentId: string,
): LayoutDocument {
  const component = layout.components.find(
    (candidate): candidate is NonRegionComponent =>
      candidate.id === componentId && candidate.kind !== "region",
  );
  if (!component) return layout;
  const candidates = layout.components
    .filter(
      (candidate): candidate is RegionComponent => candidate.kind === "region",
    )
    .map((region) => ({
      region,
      area: intersectionArea(
        componentBounds(component),
        componentBounds(region),
      ),
    }))
    .filter((candidate) => candidate.area > 0)
    .sort((left, right) => right.area - left.area);
  if (candidates.length === 0) {
    return {
      ...layout,
      components: layout.components.map((candidate) =>
        candidate.id === component.id
          ? ({ ...component, parentRegionId: undefined } as EpaperComponent)
          : candidate,
      ),
    };
  }
  const target = candidates[0].region;
  const ratio = overlapRatio(
    componentBounds(component),
    componentBounds(target),
  );
  if (
    boundsContain(componentBounds(target), componentBounds(component)) ||
    ratio > 0.5
  ) {
    const fitted = fitComponentInsideRegion(component, target);
    if (fitted)
      return {
        ...layout,
        components: layout.components.map((candidate) =>
          candidate.id === component.id ? fitted : candidate,
        ),
      };
  }
  const detached = {
    ...component,
    parentRegionId: undefined,
  } as NonRegionComponent;
  const outside = nearestOutsidePosition(detached, target);
  return {
    ...layout,
    components: layout.components.map((candidate) =>
      candidate.id === component.id
        ? ({ ...detached, ...(outside ?? {}) } as EpaperComponent)
        : candidate,
    ),
  };
}

export function resolveRegionIntersections(
  layout: LayoutDocument,
  regionId: string,
): LayoutDocument {
  return layout.components
    .filter(
      (component) =>
        component.kind !== "region" && component.parentRegionId !== regionId,
    )
    .reduce(
      (current, component) => {
        const resolved = resolveComponentContainment(current, component.id);
        return resolved;
      },
      {
        ...layout,
        components: layout.components.map((component) => {
          if (
            component.kind === "region" ||
            component.parentRegionId !== regionId
          )
            return component;
          const region = layout.components.find(
            (candidate): candidate is RegionComponent =>
              candidate.kind === "region" && candidate.id === regionId,
          );
          return region
            ? (fitComponentInsideRegion(component, region) ?? component)
            : component;
        }),
      } as LayoutDocument,
    );
}

export function validateLayout(layout: LayoutDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = new Set<string>();
  layout.components.forEach((component) => {
    const normalizedName = component.name.trim().toLowerCase();
    if (!normalizedName)
      issues.push({
        componentId: component.id,
        message: "Component name is required.",
      });
    else if (names.has(normalizedName))
      issues.push({
        componentId: component.id,
        message: `Component name “${component.name}” is duplicated.`,
      });
    names.add(normalizedName);
    const parent = component.parentRegionId
      ? layout.components.find(
          (candidate): candidate is RegionComponent =>
            candidate.kind === "region" &&
            candidate.id === component.parentRegionId,
        )
      : undefined;
    const availableWidth = parent
      ? componentBounds(parent).width
      : areaBounds(component.area).width;
    if (
      component.columns < 1 ||
      component.columns * FONT_METRICS[component.font].cellWidth >
        availableWidth
    ) {
      issues.push({
        componentId: component.id,
        message: "Width does not fit its containing area.",
      });
    }
    if (component.kind === "list-area" && component.columns < 3) {
      issues.push({
        componentId: component.id,
        message: "List Area needs at least three character cells.",
      });
    }
    if (component.kind === "region") {
      const anchorWidth = areaBounds(component.area).width;
      if (component.parentRegionId) {
        issues.push({
          componentId: component.id,
          message: "Regions cannot be nested inside other Regions.",
        });
      }
      if (
        component.pixelWidth < FONT_METRICS[component.font].cellWidth ||
        component.pixelWidth > anchorWidth
      ) {
        issues.push({
          componentId: component.id,
          message: "Region width does not fit its anchor area.",
        });
      }
    } else if (component.parentRegionId) {
      if (!parent) {
        issues.push({
          componentId: component.id,
          message: "Component references a missing parent Region.",
        });
      } else {
        if (component.font !== parent.font)
          issues.push({
            componentId: component.id,
            message: `Font must inherit from ${parent.name}.`,
          });
        if (!boundsContain(componentBounds(parent), componentBounds(component)))
          issues.push({
            componentId: component.id,
            message: `Must be fully contained by ${parent.name}.`,
          });
      }
    }
    const bounds = componentBounds(component);
    if (
      bounds.x1 < 0 ||
      bounds.x2 >= SCREEN_WIDTH ||
      bounds.y1 < 0 ||
      bounds.y2 >= SCREEN_HEIGHT
    ) {
      issues.push({
        componentId: component.id,
        message: "Component extends beyond the screen.",
      });
    }
    if (component.selected && !component.selectable) {
      issues.push({
        componentId: component.id,
        message: "Selected requires selectable=true.",
      });
    }
    if (component.kind === "list-area") {
      const selectedItems = component.items.filter((item) => item.selected);
      if (selectedItems.length > 1)
        issues.push({
          componentId: component.id,
          message: "Only one list row may be selected.",
        });
      if (selectedItems.length > 0 && !component.selectable)
        issues.push({
          componentId: component.id,
          message: "A selected list row requires selectable=true.",
        });
      const pageCount = Math.max(
        1,
        Math.ceil(component.items.length / Math.max(1, component.rows)),
      );
      if (component.initialPage < 0 || component.initialPage >= pageCount)
        issues.push({
          componentId: component.id,
          message: "Initial list page is outside the available pages.",
        });
    }
  });
  for (let left = 0; left < layout.components.length; left += 1) {
    for (let right = left + 1; right < layout.components.length; right += 1) {
      const leftComponent = layout.components[left];
      const rightComponent = layout.components[right];
      const isParentPair =
        leftComponent.id === rightComponent.parentRegionId ||
        rightComponent.id === leftComponent.parentRegionId;
      if (
        !isParentPair &&
        rectanglesOverlap(
          componentBounds(leftComponent),
          componentBounds(rightComponent),
        )
      ) {
        issues.push({
          componentId: rightComponent.id,
          message: `Overlaps ${leftComponent.name}.`,
        });
      }
    }
  }
  return issues;
}

function putPixel(
  buffer: Uint8ClampedArray,
  x: number,
  y: number,
  black: boolean,
): void {
  if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
  const offset = (y * SCREEN_WIDTH + x) * 4;
  const value = black ? 0 : 255;
  buffer[offset] = value;
  buffer[offset + 1] = value;
  buffer[offset + 2] = value;
  buffer[offset + 3] = 255;
}

function fillRect(
  buffer: Uint8ClampedArray,
  bounds: Bounds,
  black: boolean,
): void {
  for (
    let y = Math.max(0, bounds.y1);
    y <= Math.min(SCREEN_HEIGHT - 1, bounds.y2);
    y += 1
  ) {
    for (
      let x = Math.max(0, bounds.x1);
      x <= Math.min(SCREEN_WIDTH - 1, bounds.x2);
      x += 1
    )
      putPixel(buffer, x, y, black);
  }
}

function drawLine(
  buffer: Uint8ClampedArray,
  text: string,
  component: EpaperComponent,
  lineIndex: number,
  inverted: boolean,
  zoneStart = 0,
  zoneColumns = component.columns,
  textAlignment: Alignment = component.alignment,
): void {
  const metric = FONT_METRICS[component.font];
  const bitmap = SPLEEN_BITMAPS[component.font];
  const bytes = glyphBytes(component.font);
  const bounds = componentBounds(component);
  const visible = text.slice(0, zoneColumns);
  let cellOffset = 0;
  if (textAlignment === "right") cellOffset = zoneColumns - visible.length;
  if (textAlignment === "middle")
    cellOffset = Math.floor((zoneColumns - visible.length) / 2);
  const verticalOffset =
    metric.lineTop +
    Math.floor((metric.fontBoxHeight - metric.bitmapHeight) / 2);
  const originY = bounds.y1 + lineIndex * metric.lineHeight + verticalOffset;

  Array.from(visible).forEach((character, characterIndex) => {
    const codePoint = character.codePointAt(0) ?? 63;
    const glyphIndex = Math.max(0, Math.min(94, codePoint - 32));
    const originX =
      bounds.x1 +
      (zoneStart + cellOffset + characterIndex) * metric.cellWidth +
      metric.characterLeft;
    for (let row = 0; row < bitmap.height; row += 1) {
      const rowOffset = (glyphIndex * bitmap.height + row) * bitmap.bytesPerRow;
      for (let column = 0; column < bitmap.width; column += 1) {
        const byte = bytes[rowOffset + Math.floor(column / 8)];
        const isSet = (byte & (0x80 >> (column % 8))) !== 0;
        if (isSet) putPixel(buffer, originX + column, originY + row, !inverted);
      }
    }
  });
}

function listZones(columns: number): {
  left: number;
  middle: number;
  right: number;
} {
  const left = Math.floor(columns / 3);
  const right = Math.floor(columns / 3);
  return { left, middle: columns - left - right, right };
}

export function renderLayout(
  layout: LayoutDocument,
  pageByListId: Record<string, number> = {},
): ImageData {
  const buffer = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  for (let offset = 0; offset < buffer.length; offset += 4) {
    buffer[offset] = 255;
    buffer[offset + 1] = 255;
    buffer[offset + 2] = 255;
    buffer[offset + 3] = 255;
  }

  const regions = new Map(
    layout.components
      .filter(
        (component): component is RegionComponent =>
          component.kind === "region",
      )
      .map((region) => [region.id, region]),
  );
  const orderedComponents = [
    ...layout.components.filter((component) => component.kind === "region"),
    ...layout.components.filter((component) => component.kind !== "region"),
  ];

  orderedComponents.forEach((component) => {
    const bounds = componentBounds(component);
    const parent = component.parentRegionId
      ? regions.get(component.parentRegionId)
      : undefined;
    const inheritedInversion = parent
      ? parent.invertColor !== parent.selected
      : false;
    if (component.kind === "text-box") {
      const inverted = inheritedInversion !== component.selected;
      fillRect(buffer, bounds, inverted);
      drawLine(
        buffer,
        textBoxLine(component.text, component.columns).line,
        component,
        0,
        inverted,
      );
      return;
    }
    if (component.kind === "text-area") {
      const inverted = inheritedInversion !== component.selected;
      fillRect(buffer, bounds, inverted);
      const wrapped = wrapText(
        component.text,
        component.columns,
        component.rows,
      );
      wrapped.lines.forEach((line, index) =>
        drawLine(buffer, line, component, index, inverted),
      );
      return;
    }

    if (component.kind === "region") {
      const inverted = component.invertColor !== component.selected;
      fillRect(buffer, bounds, inverted);
      return;
    }

    const parentInverted =
      (inheritedInversion !== component.invertColor) !== component.selected;
    fillRect(buffer, bounds, parentInverted);
    const page = pageByListId[component.id] ?? component.initialPage;
    const pageItems = component.items.slice(
      page * component.rows,
      page * component.rows + component.rows,
    );
    const zones = listZones(component.columns);
    pageItems.forEach((item, rowIndex) => {
      const rowInverted = parentInverted !== item.selected;
      if (rowInverted !== parentInverted) {
        const metric = FONT_METRICS[component.font];
        fillRect(
          buffer,
          {
            ...bounds,
            y1: bounds.y1 + rowIndex * metric.lineHeight,
            y2: bounds.y1 + (rowIndex + 1) * metric.lineHeight - 1,
            height: metric.lineHeight,
          },
          rowInverted,
        );
      }
      drawLine(
        buffer,
        textBoxLine(item.left, zones.left).line,
        component,
        rowIndex,
        rowInverted,
        0,
        zones.left,
        "left",
      );
      drawLine(
        buffer,
        textBoxLine(item.middle, zones.middle).line,
        component,
        rowIndex,
        rowInverted,
        zones.left,
        zones.middle,
        "middle",
      );
      drawLine(
        buffer,
        textBoxLine(item.right, zones.right).line,
        component,
        rowIndex,
        rowInverted,
        zones.left + zones.middle,
        zones.right,
        "right",
      );
    });
  });
  return new ImageData(buffer, SCREEN_WIDTH, SCREEN_HEIGHT);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function componentAttributes(
  component: EpaperComponent,
  includeFont: boolean,
): string {
  const bounds = componentBounds(component);
  return [
    `id="${escapeXml(component.id)}"`,
    `name="${escapeXml(component.name)}"`,
    ...(includeFont ? [`font="spleen-${component.font}"`] : []),
    `area="${component.area}"`,
    `alignment="${component.alignment}"`,
    `x1="${bounds.x1}"`,
    `y1="${bounds.y1}"`,
    `x2="${bounds.x2}"`,
    `y2="${bounds.y2}"`,
    `columns="${component.columns}"`,
    `rows="${component.rows}"`,
    `selectable="${component.selectable}"`,
    `selected="${component.selected}"`,
    ...(component.kind === "region"
      ? [`pixel-width="${component.pixelWidth}"`]
      : []),
  ].join(" ");
}

function serializeComponent(
  layout: LayoutDocument,
  component: EpaperComponent,
  indent: string,
  nested: boolean,
): string {
  const attributes = componentAttributes(component, !nested);
  if (component.kind === "text-box")
    return `${indent}<text-box ${attributes} wrap="none" overflow="ellipsis"><text>${escapeXml(normalizeText(component.text))}</text></text-box>`;
  if (component.kind === "text-area")
    return `${indent}<text-area ${attributes} wrap="word" overflow="ellipsis"><text>${escapeXml(normalizeText(component.text))}</text></text-area>`;
  if (component.kind === "region") {
    const children = regionChildren(layout, component.id)
      .map((child) => serializeComponent(layout, child, `${indent}    `, true))
      .join("\n");
    return `${indent}<region ${attributes} invert-color="${component.invertColor}">\n${indent}  <components>\n${children}\n${indent}  </components>\n${indent}</region>`;
  }
  const items = component.items
    .map(
      (item) =>
        `${indent}    <item id="${escapeXml(item.id)}" selected="${item.selected}"><left>${escapeXml(normalizeText(item.left))}</left><middle>${escapeXml(normalizeText(item.middle))}</middle><right>${escapeXml(normalizeText(item.right))}</right></item>`,
    )
    .join("\n");
  return `${indent}<list-area ${attributes} invert-color="${component.invertColor}" initial-page="${component.initialPage}" overflow="ellipsis">\n${indent}  <items>\n${items}\n${indent}  </items>\n${indent}</list-area>`;
}

export function serializeLayout(layout: LayoutDocument): string {
  const typography = FONT_IDS.map((font) => {
    const metric = FONT_METRICS[font];
    return `    <font id="spleen-${font}" bitmap-width="${metric.bitmapWidth}" bitmap-height="${metric.bitmapHeight}" font-box-height="${metric.fontBoxHeight}" line-top="${metric.lineTop}" line-bottom="${metric.lineBottom}" line-height="${metric.lineHeight}" character-left="${metric.characterLeft}" character-right="${metric.characterRight}" cell-width="${metric.cellWidth}" />`;
  }).join("\n");
  const components = layout.components
    .filter((component) => !component.parentRegionId)
    .map((component) => serializeComponent(layout, component, "    ", false))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<epaper-layout xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="epaper-layout-v1.xsd" version="1" width="200" height="200" palette="black-white" font-family="Spleen" font-version="2.2.0">\n  <typography>\n${typography}\n  </typography>\n  <components>\n${components}\n  </components>\n</epaper-layout>\n`;
}

function boolAttribute(element: Element, name: string): boolean {
  return element.getAttribute(name) === "true";
}

function numberAttribute(element: Element, name: string): number {
  const value = Number(element.getAttribute(name));
  if (!Number.isInteger(value))
    throw new Error(
      `${element.tagName} requires an integer ${name} attribute.`,
    );
  return value;
}

function directChild(element: Element, tagName: string): Element | undefined {
  return Array.from(element.children).find(
    (child) => child.tagName === tagName,
  );
}

export function parseLayout(xml: string): LayoutDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = document.querySelector("parsererror");
  if (parseError) throw new Error("The selected file is not valid XML.");
  const root = document.documentElement;
  if (root.tagName !== "epaper-layout" || root.getAttribute("version") !== "1")
    throw new Error("Unsupported e-paper layout schema.");
  if (
    root.getAttribute("width") !== "200" ||
    root.getAttribute("height") !== "200"
  )
    throw new Error("Layout must target a 200 × 200 screen.");
  const container = directChild(root, "components");
  if (!container) throw new Error("Layout is missing its components element.");

  const components: EpaperComponent[] = [];

  const parseComponent = (
    element: Element,
    inherited?: { font: FontId; parentRegionId: string },
  ): EpaperComponent => {
    const kind = element.tagName as ComponentKind;
    if (
      !(["text-box", "text-area", "list-area", "region"] as string[]).includes(
        kind,
      )
    )
      throw new Error(`Unknown component ${element.tagName}.`);
    if (kind === "region" && inherited)
      throw new Error("Regions cannot be nested inside Regions.");
    const fontValue = inherited
      ? inherited.font
      : (element.getAttribute("font")?.replace(/^spleen-/, "") as FontId);
    if (!FONT_IDS.includes(fontValue))
      throw new Error(`Unsupported font ${element.getAttribute("font")}.`);
    const area = element.getAttribute("area") as AnchorArea;
    const alignment = element.getAttribute("alignment") as Alignment;
    if (!(["safe", "full"] as string[]).includes(area))
      throw new Error("Invalid anchor area.");
    if (!(["left", "middle", "right"] as string[]).includes(alignment))
      throw new Error("Invalid alignment.");
    const base = {
      id: element.getAttribute("id") || crypto.randomUUID(),
      name: element.getAttribute("name") || "Unnamed",
      font: fontValue,
      area,
      alignment,
      x: numberAttribute(element, "x1"),
      y: numberAttribute(element, "y1"),
      columns: numberAttribute(element, "columns"),
      rows: numberAttribute(element, "rows"),
      selectable: boolAttribute(element, "selectable"),
      selected: boolAttribute(element, "selected"),
      ...(inherited ? { parentRegionId: inherited.parentRegionId } : {}),
    };
    if (kind === "text-box")
      return {
        ...base,
        kind,
        rows: 1,
        text: directChild(element, "text")?.textContent ?? "",
      };
    if (kind === "text-area")
      return {
        ...base,
        kind,
        text: directChild(element, "text")?.textContent ?? "",
      };
    if (kind === "list-area") {
      const itemsContainer = directChild(element, "items");
      const items = itemsContainer
        ? Array.from(itemsContainer.children)
            .filter((child) => child.tagName === "item")
            .map(
              (item): ListItem => ({
                id: item.getAttribute("id") || crypto.randomUUID(),
                selected: boolAttribute(item, "selected"),
                left: directChild(item, "left")?.textContent ?? "",
                middle: directChild(item, "middle")?.textContent ?? "",
                right: directChild(item, "right")?.textContent ?? "",
              }),
            )
        : [];
      return {
        ...base,
        kind,
        invertColor: boolAttribute(element, "invert-color"),
        initialPage: numberAttribute(element, "initial-page"),
        items,
      };
    }
    const region: RegionComponent = {
      ...base,
      kind,
      pixelWidth: numberAttribute(element, "pixel-width"),
      invertColor: boolAttribute(element, "invert-color"),
    };
    components.push(region);
    const nestedContainer = directChild(element, "components");
    if (nestedContainer) {
      Array.from(nestedContainer.children).forEach((child) => {
        components.push(
          parseComponent(child, {
            font: region.font,
            parentRegionId: region.id,
          }),
        );
      });
    }
    const legacyContainer = directChild(element, "children");
    if (legacyContainer) {
      const regionBounds = componentBounds(region);
      const metric = FONT_METRICS[region.font];
      Array.from(legacyContainer.children).forEach((child) => {
        if (!(["text-box", "text-area"] as string[]).includes(child.tagName))
          return;
        const childAlignment = child.getAttribute("alignment") as Alignment;
        const rows = numberAttribute(child, "rows");
        const width = region.columns * metric.cellWidth;
        const x =
          childAlignment === "right"
            ? regionBounds.x2 - width + 1
            : childAlignment === "middle"
              ? regionBounds.x1 + Math.floor((regionBounds.width - width) / 2)
              : regionBounds.x1;
        const legacyBase = {
          id: child.getAttribute("id") || crypto.randomUUID(),
          name: child.getAttribute("name") || "Unnamed",
          font: region.font,
          area: region.area,
          alignment: childAlignment,
          x,
          y:
            regionBounds.y1 + numberAttribute(child, "row") * metric.lineHeight,
          columns: region.columns,
          rows,
          selectable: false,
          selected: false,
          parentRegionId: region.id,
          text: directChild(child, "text")?.textContent ?? "",
        };
        components.push(
          child.tagName === "text-box"
            ? { ...legacyBase, kind: "text-box", rows: 1 }
            : { ...legacyBase, kind: "text-area" },
        );
      });
    }
    return region;
  };

  Array.from(container.children).forEach((element) => {
    const component = parseComponent(element);
    if (component.kind !== "region") components.push(component);
  });
  return { version: 1, components };
}

export function makeStarterLayout(): LayoutDocument {
  return {
    version: 1,
    components: [
      {
        id: "status",
        name: "Status",
        kind: "text-box",
        font: "8x16",
        area: "full",
        alignment: "left",
        x: 0,
        y: 0,
        columns: 20,
        rows: 1,
        selectable: false,
        selected: false,
        text: "12:45 READY",
      },
      {
        id: "title",
        name: "Title",
        kind: "text-box",
        font: "16x32",
        area: "safe",
        alignment: "left",
        x: 8,
        y: 25,
        columns: 9,
        rows: 1,
        selectable: false,
        selected: false,
        text: "EPAPER UI",
      },
      {
        id: "main",
        name: "Main",
        kind: "text-area",
        font: "12x24",
        area: "safe",
        alignment: "left",
        x: 8,
        y: 68,
        columns: 12,
        rows: 3,
        selectable: false,
        selected: false,
        text: "Type directly in this area.",
      },
      {
        id: "options",
        name: "Options",
        kind: "list-area",
        font: "5x8",
        area: "full",
        alignment: "middle",
        x: 2,
        y: 174,
        columns: 28,
        rows: 2,
        selectable: true,
        selected: false,
        invertColor: false,
        initialPage: 0,
        items: [
          {
            id: "wifi",
            left: "WiFi",
            middle: "ON",
            right: ">",
            selected: true,
          },
          {
            id: "bluetooth",
            left: "Bluetooth",
            middle: "OFF",
            right: ">",
            selected: false,
          },
          {
            id: "display",
            left: "Display",
            middle: "",
            right: ">",
            selected: false,
          },
        ],
      },
    ],
  };
}

export function createComponent(
  kind: ComponentKind,
  x: number,
  y: number,
  columns: number,
  rows: number,
  area: AnchorArea,
  alignment: Alignment,
  pixelWidth?: number,
): EpaperComponent {
  const id = crypto.randomUUID();
  const base = {
    id,
    name:
      kind === "text-box"
        ? "Text Box"
        : kind === "text-area"
          ? "Text Area"
          : kind === "list-area"
            ? "List Area"
            : "Region",
    font: "8x16" as FontId,
    area,
    alignment,
    x,
    y,
    columns,
    rows,
    selectable: false,
    selected: false,
  };
  if (kind === "text-box") return { ...base, kind, rows: 1, text: "Text" };
  if (kind === "text-area") return { ...base, kind, text: "Type here" };
  if (kind === "region") {
    const resolvedPixelWidth = Math.max(
      FONT_METRICS[base.font].cellWidth,
      pixelWidth ?? columns * FONT_METRICS[base.font].cellWidth,
    );
    return {
      ...base,
      kind,
      columns: Math.max(
        1,
        Math.floor(resolvedPixelWidth / FONT_METRICS[base.font].cellWidth),
      ),
      pixelWidth: resolvedPixelWidth,
      invertColor: false,
    };
  }
  return {
    ...base,
    kind,
    columns: Math.max(3, columns),
    invertColor: false,
    initialPage: 0,
    items: [
      {
        id: crypto.randomUUID(),
        left: "Item",
        middle: "",
        right: ">",
        selected: false,
      },
    ],
  };
}
