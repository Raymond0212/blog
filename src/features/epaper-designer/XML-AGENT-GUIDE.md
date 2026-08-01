# Agent Guide: Generate a Page UI from E-Paper XML

## Purpose

This document is an implementation contract for an agent that receives an
E-Paper Designer XML file and must generate the corresponding page UI.

The XML describes a complete, fixed 200 × 200 pixel layout, its styling, and
its initial interaction state. The agent's job is to reproduce that structure
exactly. Values inside `<text>` elements are template placeholders rather than
authoritative page copy. The agent must not redesign the layout, substitute
normal web typography, add responsive reflow, or invent styles that are not
present in the XML contract.

Use the two files together:

- `epaper-layout-v1.xsd` defines the legal XML elements, attributes, ordering,
  and primitive values.
- This guide defines how those values become pixels, component state, nesting,
  clipping, and visible styling.

For annotated page-template examples, see `XML-LAYOUT-EXAMPLES.md`.

## Placeholder content policy

Every value inside every `<text>` element is a placeholder. This rule applies
to `<text>` under both Text Box and Text Area components, including components
nested inside Regions. It applies regardless of whether the placeholder looks
generic, such as `Text` or `Type here`, or realistic, such as `WIFI ON`, `BATT`,
`1/2`, or `|Text`.

When generating an actual page, an agent may:

- replace a `<text>` value with content supplied by the page-generation
  request, application state, or runtime data; or
- ignore the `<text>` value and render the component with an empty string when
  that slot has no actual content.

Never treat placeholder text as required product copy or infer application
meaning from the placeholder string itself. A component can still have a
documented semantic role. In particular, the Text Box named `Battery Status`
is reserved for actual battery status: replace its `BATT` placeholder with
runtime battery data when available, or leave it empty when unavailable. Do
not repurpose that Text Box for unrelated content.

The component itself, its documented role, bounds, capacity, alignment,
selection state, inherited font, and styling remain authoritative even when
its placeholder text is ignored. Ignoring `<text>` does not authorize removing
the component or changing its geometry.

A template preview may display the placeholder solely to make the layout easy
to inspect. A generated product page should use resolved actual content or an
empty value instead.

## Expected output

The generated UI must have these properties:

- A logical canvas of exactly `200 × 200` pixels.
- A black-and-white, 1-bit visual result.
- Absolute, inclusive component coordinates.
- Exact Spleen bitmap glyphs and fixed cell metrics.
- No antialiasing, grayscale, kerning, proportional text, or font
  substitution.
- Regions rendered as parent backgrounds with their child components above
  them.
- Selection and inversion composed with boolean XOR.
- Resolved text clipped or ellipsized within the declared component capacity.

The whole 200 × 200 canvas may be enlarged for display, but only by scaling the
finished canvas uniformly. Integer scaling with nearest-neighbor rendering is
preferred. Never independently resize or reflow components.

## Generation pipeline

An agent should implement the XML in this order:

1. Validate the XML against `epaper-layout-v1.xsd`.
2. Validate the root display contract.
3. Build a font-metric lookup from `typography/font`.
4. Parse top-level components into a scene tree.
5. Parse each Region's nested `components` and inherit the Region font.
6. Perform semantic geometry and state validation.
7. Resolve each placeholder `<text>` from actual page data or to an empty
   string.
8. Create a white 200 × 200 framebuffer or equivalent fixed-size UI surface.
9. Paint Region backgrounds.
10. Paint top-level and nested components.
11. Render glyphs, List Area fields, selection, and pagination.
12. Clip every draw operation to its component and screen bounds.
13. Compare the generated bounds and pixel output with the XML contract.

Suggested internal scene types:

```ts
type Scene = {
  width: 200;
  height: 200;
  fonts: Map<string, FontMetrics>;
  components: Component[];
};

type Component = TextBox | TextArea | ListArea | Region;

type Region = {
  kind: "region";
  font: FontMetrics;
  bounds: Bounds;
  inverted: boolean;
  children: Array<TextBox | TextArea | ListArea>;
};
```

The XML nesting should remain explicit in the scene model. Do not flatten a
Region child and then lose its parent styling context.

## Root and typography

Accept only this display contract:

```text
version      = 1
width        = 200
height       = 200
palette      = black-white
font-family  = Spleen
font-version = 2.2.0
```

The XML instance has no application namespace. It normally references the XSD
with:

```xml
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xsi:noNamespaceSchemaLocation="epaper-layout-v1.xsd"
```

Build the typography lookup before generating any component. For each font:

```text
cell width  = character-left + bitmap-width + character-right
line height = line-top + font-box-height + line-bottom
```

The exported `cell-width` and `line-height` values already contain these
results. Validate the formula, then use the recorded values consistently.

Every glyph occupies one fixed-width cell. Plot the glyph bitmap at the cell's
`character-left` offset. Vertically place it after `line-top`, centered within
the declared font box as required by the Spleen metrics.

If the output is DOM-based, use a bitmap-glyph renderer or canvas rather than
browser font rasterization. CSS `font-family: Spleen` alone is not
pixel-equivalent because browser text rendering can introduce antialiasing and
different metrics.

## Coordinates and layout

Coordinates are absolute, zero-based, and inclusive:

```text
left   = x1
top    = y1
width  = x2 - x1 + 1
height = y2 - y1 + 1
```

For a DOM representation, the direct mapping is:

```css
position: absolute;
left: x1px;
top: y1px;
width: (x2 - x1 + 1) px;
height: (y2 - y1 + 1) px;
overflow: hidden;
```

For Text Box, Text Area, and List Area:

```text
expected width  = columns × font.cell-width
expected height = rows × font.line-height
```

For a Region:

```text
expected width  = pixel-width
expected height = rows × font.line-height
```

All bounds must remain inside `0..199`.

`area="full"` refers to horizontal anchor `x=0..199`. `area="safe"` refers to
`x=8..187`. The area and alignment fields are useful for editor anchoring and
resize behavior, but an XML-to-UI generator must render the explicit
`x1..y2` coordinates. Do not recalculate a component's position from `area` and
`alignment`.

## Common component state

| XML value    | UI-generation meaning                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `id`         | Stable unique key for the generated component and runtime state.                                           |
| `name`       | Human-readable Region name; useful for accessibility and diagnostics.                                      |
| `font`       | Font lookup key on top-level components and Regions. Region children inherit it.                           |
| `area`       | Editor anchor metadata; it does not replace explicit bounds.                                               |
| `alignment`  | Horizontal alignment of text inside its capacity. It also documents resize-growth direction for an editor. |
| `columns`    | Fixed character capacity per line.                                                                         |
| `rows`       | Fixed visible line or row capacity.                                                                        |
| `selectable` | Whether generated runtime logic may change selection state.                                                |
| `selected`   | Initial selection inversion state. It must be false if the component is not selectable.                    |

Use `id`, not array position or `name`, as the runtime key.

## Component-to-UI mapping

### Text Box

Generate one fixed-capacity line using resolved actual content or an empty
string, never mandatory placeholder copy.

- `rows` is always `1`.
- Replace input newlines with spaces.
- Use `alignment` to position visible cells left, middle, or right inside the
  declared `columns`.
- `wrap="none"` means never create a second line.
- `overflow="ellipsis"` means shorten overflowing text with `...` when three
  cells are available; otherwise hard-clip to the available cells.
- Fill the complete component bounds with its computed background before
  drawing glyphs.

### Text Area

Generate a fixed number of text lines using resolved actual content or an
empty string, never mandatory placeholder copy.

- Wrap at word boundaries up to `columns` cells.
- Break a single word at the cell boundary if it exceeds `columns`.
- Preserve explicit paragraph breaks.
- Stop after `rows` lines.
- If content remains, ellipsize the last visible line.
- Apply `alignment` independently to each rendered line.
- Fill and clip to the complete component bounds.

### List Area

Generate a paged list with exactly `rows` visible item slots.

Split every row into three fixed zones:

```text
left columns   = floor(columns / 3)
right columns  = floor(columns / 3)
middle columns = columns - left columns - right columns
```

Render the fields as follows:

- `left`: left-aligned within the left zone.
- `middle`: centered within the middle zone.
- `right`: right-aligned within the right zone.
- Ellipsize each field independently to its zone capacity.
- Each item occupies one font `line-height`.
- Display `rows` items per page.
- Start at zero-based `initial-page`.
- Additional items form later pages; do not increase the component height.
- At most one item may be initially selected.

If page controls are required by the target application, they should update the
current page in runtime state. Do not draw page controls inside the e-paper
canvas unless the XML contains components for them.

### Region

Generate a Region as a background and style context, then generate its nested
components above it.

- The Region width may be any positive `pixel-width` that fits its anchor and
  screen bounds.
- A Region contains a required nested `components` wrapper, which may be empty.
- Allowed children are Text Box, Text Area, and List Area.
- A Region cannot contain another Region.
- Nested components intentionally omit `font`; assign the Region font before
  calculating their geometry or drawing text.
- Nested `x1..y2` values are still absolute screen coordinates.
- Every child must be fully contained by the Region, including exact-boundary
  containment.
- A component outside a Region must have zero pixel intersection with it.
- Partial Region intersections are invalid and must not be silently clipped.
- Regions cannot overlap each other.

The XML wrapper establishes ownership. Do not infer ownership only from visual
intersection when a canonical XML tree is available.

The legacy row-based `<children>` structure is import compatibility for the
designer only. A UI-generation agent should normalize it to full components or
request canonical XML. It must not generate new output using the legacy form.

## Styling and inversion rules

The initial screen and default component background are white. Normal glyphs
are black. There are no arbitrary colors, gradients, opacity, borders, shadows,
font weights, or CSS theme values.

Inversion flags combine with boolean XOR, not logical OR:

```text
regionBase = region.invert-color XOR region.selected

textBackground = regionBase XOR text.selected

listBackground = regionBase
                 XOR list.invert-color
                 XOR list.selected

listRowBackground = listBackground XOR item.selected
```

For top-level components, use `false` as the missing `regionBase`.

Interpret the final boolean as:

```text
false = white background, black glyphs
true  = black background, white glyphs
```

Two active inversion sources cancel. For example, a List Area with
`invert-color="true"` inside an inverted Region has a white background.

Always paint a selected List Area row across the complete row bounds before
drawing its three fields.

## Text normalization

The supported character set is printable ASCII, code points `32..126`.

- Replace every unsupported Unicode code point with one `?`.
- Treat CRLF and CR line endings as LF before layout.
- Do not transliterate, combine, or silently remove unsupported characters.
- Decode XML entities before measuring text.
- XML producers must escape reserved characters normally.

After placeholder resolution, actual text can be longer than its visible
capacity. Capacity affects rendering, not the retained actual value. The XML
placeholder does not impose a default or fallback value.

## Reading the XSD for generation

The important XSD relationships are:

- `placementAttributes` defines identity, bounds, capacity, alignment, and
  selection.
- `componentAttributes` adds the required top-level `font`.
- `textBox`, `textArea`, and `listArea` describe top-level components.
- `nestedTextBox`, `nestedTextArea`, and `nestedListArea` omit `font` so that
  Region inheritance is mandatory.
- `regionType/components` uses an `xs:choice` that permits only the three
  non-Region child types.
- Attributes marked `fixed` are rendering constants, not suggestions.
- Element sequences are significant: for example, a List item contains
  `left`, then `middle`, then `right`.

XSD validation alone is insufficient. XSD 1.0 does not enforce calculated
geometry, complete containment, screen bounds, unique IDs/names, font
inheritance, non-overlap, selection consistency, or valid page range.

## Semantic validation before generation

Reject the layout or return actionable diagnostics when any of these checks
fail:

1. Root display values differ from the fixed 200 × 200 contract.
2. A referenced font is missing or unsupported.
3. IDs are duplicated or names are empty/duplicated case-insensitively.
4. Bounds are outside the screen or have inconsistent inclusive dimensions.
5. Non-Region bounds disagree with `columns`, `rows`, and inherited font
   metrics.
6. Region width disagrees with `pixel-width` or height disagrees with its rows.
7. A Region is nested, Regions overlap, or a child is not fully contained.
8. Unrelated components overlap.
9. `selected="true"` appears on a non-selectable component.
10. A List Area has fewer than three columns, selects multiple items, or uses
    an invalid `initial-page`.

Do not repair malformed canonical XML by guessing. Report the failing element
ID and rule. Automatic snapping and capacity reduction are editor behaviors,
not XML-renderer behaviors.

## Generation pseudocode

```ts
function generatePage(xml: Document, pageData: PageData): Framebuffer {
  validateWithXsd(xml);
  const scene = parseScene(xml);
  validateSemantics(scene);
  resolvePlaceholderText(scene, pageData, "");

  const framebuffer = create1BitFramebuffer(200, 200, "white");

  for (const region of scene.regions) {
    const regionBase = xor(region.invertColor, region.selected);
    fill(region.bounds, regionBase);

    for (const child of region.children) {
      child.font = region.font;
      renderComponent(child, regionBase, framebuffer);
    }
  }

  for (const component of scene.topLevelNonRegions) {
    renderComponent(component, false, framebuffer);
  }

  return framebuffer;
}
```

The actual implementation may use canvas, a byte framebuffer, HTML elements,
or firmware drawing calls. The resulting logical pixels and component state
must remain equivalent.

## What the agent must not invent

Unless a separate product requirement explicitly asks for them, do not add:

- responsive component rearrangement;
- automatic font substitution or font-size interpolation;
- colors other than black and white;
- padding beyond the declared font metrics;
- borders, rounded corners, shadows, icons, or decorative backgrounds;
- nested Regions;
- inferred buttons, navigation, page indicators, or interaction controls;
- extra text created from component names or IDs;
- clipping as a substitute for invalid Region containment;
- changes to coordinates based only on `area` or `alignment`.

## UI-generation acceptance checklist

Before declaring the generated page complete:

1. Validate the XML with `epaper-layout-v1.xsd`.
2. Confirm a 200 × 200 logical output surface.
3. Confirm every top-level font and inherited Region font resolves correctly.
4. Confirm component bounds match the XML exactly.
5. Confirm text uses bitmap cells and line metrics without antialiasing.
6. Confirm Text Box truncation and Text Area wrapping at capacity boundaries.
7. Confirm List Area zone widths, page slicing, and selected-row rendering.
8. Confirm Region backgrounds render before their children.
9. Confirm all inversion combinations use XOR, including double inversion.
10. Confirm no component leaks pixels outside its own bounds or the screen.
11. Confirm unsupported characters become one `?` per code point.
12. Compare a native 1× 200 × 200 preview before applying display zoom.
13. Confirm no `<text>` placeholder was treated as required final copy; every
    text slot uses supplied actual content or an intentional empty string.
