# E-Paper Layout XML v1

The E-Paper Designer imports and exports a self-contained XML description for a
200 × 200 black-and-white display. Coordinates are zero-based and inclusive.
The accompanying `epaper-layout-v1.xsd` formally defines this structure and is
available from the designer's **Download XSD** action.

## Root

`epaper-layout` identifies schema version `1`, the 200 × 200 screen, the
black-and-white palette, and Spleen 2.2.0. Its `typography` child records the
bitmap, font-box, line-padding, character-padding, line-height, and cell-width
values used by the renderer.

## Components

- `text-box` is one fixed-height line. Its width is a whole number of character
  cells. Extra content is shown with an ellipsis.
- `text-area` has a fixed number of character columns and text rows. Text wraps
  at words, with long words breaking at the cell boundary.
- `list-area` has a fixed number of columns and visible rows. Its parent font is
  used for every item. Each row contains equal left, middle, and right zones,
  and additional items form automatically derived pages.
- `region` has an arbitrary pixel width and a height measured in font line
  heights. Its `components` wrapper may contain complete `text-box`,
  `text-area`, and `list-area` elements, but never another Region. Nested
  components use absolute screen coordinates and inherit the Region's font.

Every component records its stable ID, editable name, font, Safe or Full anchor
area, alignment, inclusive corners, columns, rows, `selectable`, and `selected`.
Text Box and Text Area selection inverts that component. List Area and Region
both expose an Invert color toggle. Inversion flags compose as toggles: a child
in an inverted Region is black, while an inverted child in that Region is
inverted a second time and returns to white. A selectable list may also have at
most one item with `selected="true"`; that item row is inverted relative to its
parent background.

Components must be wholly inside their Region or wholly outside every Region.
The importer still accepts the earlier row-based Region `children` structure
and converts it to complete nested components; exports always use the canonical
`region/components` wrapper.

There is no separate background attribute. The default is white with black
text, while the Invert color toggle switches a Region or List Area to black
with white text.
Unsupported Unicode code points are exported as one `?` each. The complete
normalized source text remains in XML even when the preview must show an
ellipsis.
