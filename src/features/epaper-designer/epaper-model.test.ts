import { describe, expect, it } from "vitest";
import {
  FONT_METRICS,
  boundsContain,
  componentBounds,
  fitComponentInsideRegion,
  makeStarterLayout,
  normalizeText,
  renderLayout,
  resolveComponentContainment,
  resolveRegionIntersections,
  serializeLayout,
  textBoxLine,
  validateLayout,
  wrapText,
  type LayoutDocument,
  type ListAreaComponent,
  type RegionComponent,
  type TextBoxComponent,
} from "./epaper-model";

class TestImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

Object.defineProperty(globalThis, "ImageData", {
  value: TestImageData,
  configurable: true,
});

describe("e-paper typography", () => {
  it("keeps every cell and line metric explicit", () => {
    expect(FONT_METRICS["5x8"]).toMatchObject({ cellWidth: 7, lineHeight: 13 });
    expect(FONT_METRICS["6x12"]).toMatchObject({
      cellWidth: 8,
      lineHeight: 17,
    });
    expect(FONT_METRICS["8x16"]).toMatchObject({
      cellWidth: 10,
      lineHeight: 25,
    });
    expect(FONT_METRICS["12x24"]).toMatchObject({
      cellWidth: 14,
      lineHeight: 33,
    });
    expect(FONT_METRICS["16x32"]).toMatchObject({
      cellWidth: 20,
      lineHeight: 43,
    });
    expect(FONT_METRICS["32x64"]).toMatchObject({
      cellWidth: 40,
      lineHeight: 86,
    });
  });

  it("normalizes unsupported code points one-for-one", () => {
    expect(normalizeText("Café 😀\nOK")).toBe("Caf? ?\nOK");
  });

  it("ellipsizes fixed one-line boxes without changing capacity", () => {
    expect(textBoxLine("ABCDEFGHI", 6)).toEqual({
      line: "ABC...",
      overflow: true,
    });
    expect(textBoxLine("ABCDE", 6)).toEqual({ line: "ABCDE", overflow: false });
  });

  it("word-wraps fixed text areas and ellipsizes their last row", () => {
    expect(wrapText("one two three four five", 8, 2)).toEqual({
      lines: ["one two", "three..."],
      overflow: true,
    });
  });
});

describe("component geometry", () => {
  it("keeps component geometry at its explicit free-drag position", () => {
    const main = makeStarterLayout().components.find(
      (component) => component.id === "main",
    );
    expect(main && componentBounds(main)).toMatchObject({
      x1: 8,
      y1: 68,
      x2: 175,
      y2: 166,
      width: 168,
      height: 99,
    });
    if (!main) throw new Error("Missing starter component");
    expect(
      componentBounds({ ...main, alignment: "right", x: 20 }),
    ).toMatchObject({
      x1: 20,
      x2: 187,
    });
    expect(
      componentBounds({ ...main, alignment: "middle", x: 14 }),
    ).toMatchObject({
      x1: 14,
      x2: 181,
    });
  });

  it("keeps Region width in pixels while anchoring it with explicit alignment", () => {
    const region: RegionComponent = {
      id: "region",
      name: "Region",
      kind: "region",
      font: "8x16",
      area: "safe",
      alignment: "left",
      x: 8,
      y: 10,
      columns: 7,
      rows: 2,
      pixelWidth: 73,
      selectable: false,
      selected: false,
      invertColor: false,
    };
    expect(componentBounds(region)).toMatchObject({
      x1: 8,
      x2: 80,
      width: 73,
      height: 50,
    });
    expect(
      componentBounds({ ...region, alignment: "middle", x: 61 }),
    ).toMatchObject({
      x1: 61,
      x2: 133,
    });
    expect(
      componentBounds({ ...region, alignment: "right", x: 115 }),
    ).toMatchObject({
      x1: 115,
      x2: 187,
    });
  });

  it("accepts exact containment and snaps 49, 50, and 51 percent overlaps", () => {
    const region: RegionComponent = {
      id: "region",
      name: "Region",
      kind: "region",
      font: "8x16",
      area: "full",
      alignment: "left",
      x: 50,
      y: 0,
      columns: 10,
      rows: 2,
      pixelWidth: 100,
      selectable: false,
      selected: false,
      invertColor: false,
    };
    const box = (x: number): TextBoxComponent => ({
      id: "box",
      name: "Box",
      kind: "text-box",
      font: "8x16",
      area: "full",
      alignment: "left",
      x,
      y: 0,
      columns: 10,
      rows: 1,
      selectable: false,
      selected: false,
      text: "Text",
    });
    const exact = resolveComponentContainment(
      { version: 1, components: [region, box(50)] },
      "box",
    );
    const exactBox = exact.components.find(
      (component) => component.id === "box",
    );
    expect(exactBox?.parentRegionId).toBe("region");
    expect(
      exactBox &&
        boundsContain(componentBounds(region), componentBounds(exactBox)),
    ).toBe(true);

    for (const x of [101, 100]) {
      const resolved = resolveComponentContainment(
        { version: 1, components: [region, box(x)] },
        "box",
      );
      const resolvedBox = resolved.components.find(
        (component) => component.id === "box",
      );
      expect(resolvedBox?.parentRegionId).toBeUndefined();
    }

    const majority = resolveComponentContainment(
      { version: 1, components: [region, box(99)] },
      "box",
    );
    const majorityBox = majority.components.find(
      (component) => component.id === "box",
    );
    expect(majorityBox?.parentRegionId).toBe("region");
  });

  it("adopts enclosed components when a Region is created around them", () => {
    const region: RegionComponent = {
      id: "region",
      name: "Region",
      kind: "region",
      font: "8x16",
      area: "full",
      alignment: "left",
      x: 20,
      y: 20,
      columns: 10,
      rows: 2,
      pixelWidth: 100,
      selectable: false,
      selected: false,
      invertColor: false,
    };
    const box: TextBoxComponent = {
      id: "box",
      name: "Box",
      kind: "text-box",
      font: "5x8",
      area: "full",
      alignment: "left",
      x: 30,
      y: 25,
      columns: 8,
      rows: 1,
      selectable: false,
      selected: false,
      text: "Text",
    };
    const resolved = resolveRegionIntersections(
      { version: 1, components: [box, region] },
      "region",
    );
    expect(resolved.components[0]).toMatchObject({
      parentRegionId: "region",
      font: "8x16",
    });
  });

  it("shrinks inherited List Area capacity but preserves its minimum", () => {
    const region: RegionComponent = {
      id: "region",
      name: "Region",
      kind: "region",
      font: "16x32",
      area: "full",
      alignment: "left",
      x: 0,
      y: 0,
      columns: 5,
      rows: 2,
      pixelWidth: 100,
      selectable: false,
      selected: false,
      invertColor: false,
    };
    const list: ListAreaComponent = {
      id: "list",
      name: "List",
      kind: "list-area",
      font: "5x8",
      area: "full",
      alignment: "left",
      x: 0,
      y: 0,
      columns: 20,
      rows: 5,
      selectable: false,
      selected: false,
      invertColor: true,
      initialPage: 0,
      items: [],
    };
    expect(fitComponentInsideRegion(list, region)).toMatchObject({
      font: "16x32",
      columns: 5,
      rows: 2,
      parentRegionId: "region",
    });
    expect(
      fitComponentInsideRegion(list, { ...region, pixelWidth: 40, columns: 2 }),
    ).toBeNull();
  });

  it("detects overlapping components and invalid selection state", () => {
    const starter = makeStarterLayout();
    const invalid: LayoutDocument = {
      ...starter,
      components: [
        starter.components[0],
        {
          ...starter.components[0],
          id: "copy",
          name: "Copy",
          selectable: false,
          selected: true,
        },
      ],
    };
    expect(validateLayout(invalid).map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Selected requires selectable=true.",
        "Overlaps Status.",
      ]),
    );
  });
});

describe("rendering and XML", () => {
  it("renders a deterministic 200 by 200 monochrome buffer", () => {
    const image = renderLayout(makeStarterLayout());
    expect(image.width).toBe(200);
    expect(image.height).toBe(200);
    let blackPixels = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      expect([0, 255]).toContain(image.data[index]);
      if (image.data[index] === 0) blackPixels += 1;
    }
    expect(blackPixels).toBeGreaterThan(100);
  });

  it("inverts a Region background and renders children with inherited font", () => {
    const region: RegionComponent = {
      id: "region",
      name: "Region",
      kind: "region",
      font: "8x16",
      area: "full",
      alignment: "left",
      x: 0,
      y: 0,
      columns: 8,
      rows: 2,
      pixelWidth: 87,
      selectable: false,
      selected: false,
      invertColor: true,
    };
    const child: TextBoxComponent = {
      id: "child",
      name: "Label",
      kind: "text-box",
      font: "8x16",
      area: "full",
      alignment: "right",
      x: 0,
      y: 0,
      columns: 4,
      rows: 1,
      selectable: true,
      selected: true,
      parentRegionId: "region",
      text: "OK",
    };
    const image = renderLayout({ version: 1, components: [region, child] });
    expect(image.data[40 * 4]).toBe(0);
    expect(image.data[0]).toBe(255);
    expect(image.data[86 * 4]).toBe(0);
    expect(image.data[87 * 4]).toBe(255);
  });

  it("serializes component flags, list fields, pages, and typography", () => {
    const xml = serializeLayout(makeStarterLayout());
    expect(xml).toContain(
      'xsi:noNamespaceSchemaLocation="epaper-layout-v1.xsd"',
    );
    expect(xml).toContain('version="1" width="200" height="200"');
    expect(xml).toContain('<font id="spleen-32x64"');
    expect(xml).toContain('<text-box id="status"');
    expect(xml).toContain('<list-area id="options"');
    expect(xml).toContain('selectable="true"');
    expect(xml).toContain('invert-color="false"');
    expect(xml).toContain(
      "<left>WiFi</left><middle>ON</middle><right>&gt;</right>",
    );
  });

  it("serializes nested Region content without child font attributes", () => {
    const region: RegionComponent = {
      id: "region",
      name: "Header",
      kind: "region",
      font: "6x12",
      area: "safe",
      alignment: "middle",
      x: 20,
      y: 20,
      columns: 11,
      rows: 3,
      pixelWidth: 91,
      selectable: true,
      selected: false,
      invertColor: true,
    };
    const title: TextBoxComponent = {
      id: "title",
      name: "Title",
      kind: "text-box",
      font: "6x12",
      area: "safe",
      alignment: "middle",
      x: 20,
      y: 20,
      columns: 5,
      rows: 1,
      selectable: false,
      selected: false,
      parentRegionId: "region",
      text: "Hello",
    };
    const list: ListAreaComponent = {
      id: "menu",
      name: "Menu",
      kind: "list-area",
      font: "6x12",
      area: "safe",
      alignment: "right",
      x: 80,
      y: 37,
      columns: 3,
      rows: 2,
      selectable: true,
      selected: false,
      parentRegionId: "region",
      invertColor: true,
      initialPage: 0,
      items: [],
    };
    const xml = serializeLayout({
      version: 1,
      components: [region, title, list],
    });
    expect(xml).toContain(
      '<region id="region" name="Header" font="spleen-6x12"',
    );
    expect(xml).toContain('pixel-width="91" invert-color="true"');
    expect(xml).toContain(
      '<components>\n        <text-box id="title" name="Title" area="safe" alignment="middle"',
    );
    expect(xml).not.toContain('<text-box id="title" name="Title" font=');
    expect(xml).toContain('<list-area id="menu" name="Menu" area="safe"');
    expect(xml).not.toContain('<list-area id="menu" name="Menu" font=');
  });
});
