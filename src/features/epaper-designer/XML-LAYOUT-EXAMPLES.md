# E-Paper XML Layout Examples

## Purpose

This document explains the six supplied XML files as page-generation
templates. An agent should use it with `XML-AGENT-GUIDE.md` and
`epaper-layout-v1.xsd` when deciding which layout to render or adapt.

Four files fully specify either list or prose content. Two Region-only files
provide the page shell and content geometry while intentionally leaving the
Content Region's `<components>` collection empty:

| File                               | Subtitle band | Main content         | Visible capacity | Intended use                                                    |
| ---------------------------------- | ------------- | -------------------- | ---------------- | --------------------------------------------------------------- |
| `subtitle listing.xml`             | Yes           | List Area            | 7 list rows      | A menu or selection page that needs title and subtitle context. |
| `subtitle long content.xml`        | Yes           | Text Area            | 7 text lines     | A detail or reading page that needs title and subtitle context. |
| `listing.xml`                      | No            | List Area            | 8 list rows      | A compact menu or selection page with maximum list capacity.    |
| `Long content.xml`                 | No            | Text Area            | 8 text lines     | A compact detail or reading page with maximum body capacity.    |
| `subtitle content region only.xml` | Yes           | Unspecified children | 7 font rows      | A title/subtitle shell for custom content components.           |
| `content region only.xml`          | No            | Unspecified children | 8 font rows      | A compact title shell for custom content components.            |

All six files validate against `epaper-layout-v1.xsd`.

## Placeholder text rule

Every value inside every `<text>` element in these six templates is a
placeholder, including values that look meaningful: `Text`, `Type here`,
`WIFI ON`, `BATT`, `1/2`, and `|Text`. These values demonstrate placement and
capacity; they are not required page copy.

When using a template to generate an actual page, an agent may replace each
placeholder with supplied actual content or ignore it and render that text slot
empty. The agent must not preserve a placeholder merely because it appears in
the XML. Ignoring a placeholder changes only the displayed string: the Text
Box or Text Area, its bounds, alignment, font, selection state, and styling
still remain part of the layout.

Placeholder text and component purpose are separate. The `BATT` value is a
placeholder, but the Text Box named `Battery Status` is specifically reserved
for actual battery status. Populate it from runtime battery data when
available, leave it empty when unavailable, and never reuse it for unrelated
page content.

List item `<left>`, `<middle>`, and `<right>` values are separate from `<text>`.
In these examples, values such as `Item` are also sample content and should be
resolved from actual list data rather than treated as product copy.

## Shared display contract

Every file targets the same fixed output:

```text
Resolution:   200 × 200 pixels
Palette:      black and white
Font family:  Spleen 2.2.0
Schema:       E-Paper Layout XML version 1
Coordinates:  absolute, zero-based, inclusive
```

Each file includes all six supported font definitions, although these examples
use only three:

| Usage                | Font          | Cell width | Line height |
| -------------------- | ------------- | ---------: | ----------: |
| Status bar           | `spleen-5x8`  |       7 px |       13 px |
| Main title           | `spleen-8x16` |      10 px |       25 px |
| Subtitle and content | `spleen-6x12` |       8 px |       17 px |

Nested components omit `font` and inherit it from their Region. An agent must
apply that inheritance before calculating text capacity or drawing glyphs.

## Components shared by all six files

### Status bar

All layouts begin with the same full-width status Region:

```text
Bounds:       x=0..199, y=0..12
Size:         200 × 13 px
Font:         spleen-5x8
Background:   inverted
Selectable:   no
```

It contains two Text Boxes:

| Child          | Bounds       | Capacity | Alignment | Text      |
| -------------- | ------------ | -------: | --------- | --------- |
| Main Status    | `x=0..167`   | 24 cells | Left      | `WIFI ON` |
| Battery Status | `x=172..199` |  4 cells | Right     | `BATT`    |

Pixels `x=168..171` form a four-pixel gap between the two children. Because the
Region has `invert-color="true"`, it renders as a black bar with white text.
`BATT` is not final copy: it marks the location of the Battery Status Text Box.
The generated page should display actual battery status in that four-cell,
right-aligned slot.

### Title

All layouts contain a Title Region using `spleen-8x16`:

```text
Bounds:       x=8..187, y=25..49
Size:         180 × 25 px
Background:   white
Selectable:   no
```

The Region contains three adjacent Text Boxes:

- **Main Title** displays the primary page label, currently `Text`.
- **Divider** has one character cell. Its source value is `|Text`, but its
  one-cell capacity means the generated UI visibly renders only `|`.
- **Secondary Title** displays the page indicator `1/2` and is right-aligned.

The title widths differ slightly between the subtitle and non-subtitle
templates:

| Template         | Main Title           | Divider              | Secondary Title       |
| ---------------- | -------------------- | -------------------- | --------------------- |
| With subtitle    | `x=8..147`, 14 cells | `x=148..157`, 1 cell | `x=158..187`, 3 cells |
| Without subtitle | `x=8..137`, 13 cells | `x=138..147`, 1 cell | `x=148..187`, 4 cells |

The source text `1/2` fills all three cells in the subtitle variant. In the
non-subtitle variant it uses three of four right-aligned cells.

### Reserved screen bands

All examples leave `y=13..24` blank between the status bar and title. The XML
contains no component in this band, so the generated UI must leave it white.

The bottom of the screen is also intentionally unused:

- Subtitle templates leave `y=188..199` blank.
- Non-subtitle templates leave `y=186..199` blank.

Do not stretch the content to fill these pixels.

## `subtitle listing.xml`

### Page purpose

Use this template for a selectable list page where the user needs both a main
title and a smaller subtitle or secondary context line.

### Vertical structure

| Screen band | Bounds       | Height | Content                           |
| ----------- | ------------ | -----: | --------------------------------- |
| Status      | `y=0..12`    |  13 px | Inverted status bar               |
| Blank       | `y=13..24`   |  12 px | Reserved whitespace               |
| Title       | `y=25..49`   |  25 px | Main title, divider, page count   |
| Blank       | `y=50`       |   1 px | Separation                        |
| Subtitle    | `y=51..67`   |  17 px | Subtitle text and secondary value |
| Blank       | `y=68`       |   1 px | Separation                        |
| Content     | `y=69..187`  | 119 px | Seven-row List Area               |
| Blank       | `y=188..199` |  12 px | Bottom whitespace                 |

### Subtitle Region

```text
Bounds:       x=8..187, y=51..67
Font:         spleen-6x12
Rows:         1
Background:   white
```

It contains:

| Child              | Bounds       | Capacity | Text   |
| ------------------ | ------------ | -------: | ------ |
| Main Subtitle      | `x=8..159`   | 19 cells | `Text` |
| Secondary Subtitle | `x=164..187` |  3 cells | `1/2`  |

Pixels `x=160..163` are a four-pixel gap. Both children are left-aligned in the
source XML, although the secondary value exactly fills its three cells.

### Content Region and List Area

```text
Region bounds:  x=8..187, y=69..187
List bounds:    x=8..183, y=69..187
Font:           spleen-6x12
Columns:        22
Rows:           7
Items:          7
Initial page:   0
Selectable:     yes
```

The List Area is 176 pixels wide (`22 × 8`) inside a 180-pixel Region, leaving
four white pixels at `x=184..187`.

With 22 columns, each row is divided into:

```text
Left zone:    7 cells / 56 px
Middle zone:  8 cells / 64 px
Right zone:   7 cells / 56 px
```

Every item displays `Item` on the left, an empty middle field, and `>` on the
right. The first item has `selected="true"`, so the generated UI renders the
first row black with white text. The remaining rows are white with black text.
All seven items fit on the initial page.

### Component tree

```text
Page
├── status bar Region
│   ├── Main Status Text Box
│   └── Battery Status Text Box
├── Title Region
│   ├── Main Title Text Box
│   ├── Divider Text Box
│   └── Secondary Title Text Box
├── Subtitle Region
│   ├── Main Subtitle Text Box
│   └── Secondary Subtitle Text Box
└── Content Region
    └── List Area
        └── 7 items
```

## `subtitle long content.xml`

### Page purpose

Use this template for a detail, help, message, or article page where the main
body needs wrapping text and the page also needs a subtitle.

### Structure

The status, title, subtitle, whitespace, fonts, and coordinates are identical
to `subtitle listing.xml`. Only the child of the Content Region changes.

```text
Content Region:  x=8..187, y=69..187
Text Area:       x=8..183, y=69..187
Font:            spleen-6x12
Columns:         22
Rows:            7
Wrap:            word
Overflow:        ellipsis
Source text:     Type here
```

The Text Area is 176 pixels wide inside the 180-pixel Region, leaving the same
four-pixel right gap as the listing template.

`Type here` is only a placeholder. An agent should replace it when actual page
content is supplied or ignore it and leave the Text Area empty. The generated
component must retain a maximum of seven visible lines. Text wraps at word
boundaries, long words break at 22 cells, and overflow is ellipsized on the
seventh line.

### Component tree

```text
Page
├── status bar Region
│   ├── Main Status Text Box
│   └── Battery Status Text Box
├── Title Region
│   ├── Main Title Text Box
│   ├── Divider Text Box
│   └── Secondary Title Text Box
├── Subtitle Region
│   ├── Main Subtitle Text Box
│   └── Secondary Subtitle Text Box
└── Content Region
    └── Content Text Area (22 columns × 7 lines)
```

## `listing.xml`

### Page purpose

Use this template for a compact selectable list that does not need a subtitle.
Removing the subtitle makes one additional list row available.

### Vertical structure

| Screen band | Bounds       | Height | Content                         |
| ----------- | ------------ | -----: | ------------------------------- |
| Status      | `y=0..12`    |  13 px | Inverted status bar             |
| Blank       | `y=13..24`   |  12 px | Reserved whitespace             |
| Title       | `y=25..49`   |  25 px | Main title, divider, page count |
| Content     | `y=50..185`  | 136 px | Eight-row List Area             |
| Blank       | `y=186..199` |  14 px | Bottom whitespace               |

There is no gap between the Title Region and Content Region: the title ends at
`y=49` and content begins at `y=50`.

### Content Region and List Area

```text
Region bounds:  x=8..187, y=50..185
List bounds:    x=8..183, y=50..185
Font:           spleen-6x12
Columns:        22
Rows:           8
Items:          8
Initial page:   0
Selectable:     yes
```

The List Area uses the same 7/8/7 cell zones as the subtitle listing. It adds an
eighth visible row because the content starts 19 pixels higher. The first row
is selected and inverted; the remaining seven rows use the normal white
background. All items fit on one page.

### Component tree

```text
Page
├── status bar Region
│   ├── Main Status Text Box
│   └── Battery Status Text Box
├── Title Region
│   ├── Main Title Text Box
│   ├── Divider Text Box
│   └── Secondary Title Text Box
└── Content Region
    └── List Area
        └── 8 items
```

## `Long content.xml`

### Page purpose

Use this template for a detail, help, message, or article page that does not
need a subtitle and should maximize body-text capacity.

### Structure

The status, title, content coordinates, and whitespace match `listing.xml`.
The Content Region contains a Text Area instead of a List Area:

```text
Content Region:  x=8..187, y=50..185
Text Area:       x=8..183, y=50..185
Font:            spleen-6x12
Columns:         22
Rows:            8
Wrap:            word
Overflow:        ellipsis
Source text:     Type here
```

The component can display up to eight 22-cell lines. If the supplied text needs
more space, the eighth line receives the ellipsis. The Text Area must not grow
into the bottom whitespace.

### Component tree

```text
Page
├── status bar Region
│   ├── Main Status Text Box
│   └── Battery Status Text Box
├── Title Region
│   ├── Main Title Text Box
│   ├── Divider Text Box
│   └── Secondary Title Text Box
└── Content Region
    └── Content Text Area (22 columns × 8 lines)
```

## `content region only.xml`

### Page purpose

Use this template when the page does not need a subtitle and the generator
knows the available content area but has not yet chosen its Text Box, Text
Area, or List Area children. The file specifies the status bar, title, and
Content Region; it deliberately does not specify the Content Region's actual
content components.

### Structure

The status bar, title, whitespace, and Content Region match the non-subtitle
`listing.xml` and `Long content.xml` templates:

```text
Content Region:       x=8..187, y=50..185
Inherited font:       spleen-6x12
Region capacity:      22 columns × 8 rows
Region pixel size:    180 × 136 px
Background:           white
Component collection: empty by design
```

Its component tree stops at the Region wrapper:

```text
Page
├── status bar Region
│   ├── Main Status Text Box
│   └── Battery Status Text Box
├── Title Region
│   ├── Main Title Text Box
│   ├── Divider Text Box
│   └── Secondary Title Text Box
└── Content Region
    └── components (empty)
```

An empty `<components>` element is a valid, intentional slot. It does not imply
a hidden Text Area, a List Area, placeholder text, or an error. If the
page-generation request supplies no content specification, render the Region
as an empty white area.

If the request does supply content, the generator may insert one or more
`<text-box>`, `<text-area>`, or `<list-area>` children. Each inserted child
must:

- omit `font` and inherit `spleen-6x12` from the Content Region;
- use absolute, inclusive coordinates fully inside `x=8..187, y=50..185`;
- fit within the Region's 22-column, eight-row capacity;
- preserve the schema's geometry, overlap, selection, and XOR inversion rules.

A standard full-width child may use `x=8..183`, which holds 22 eight-pixel
cells and leaves the template's four-pixel right-side slack.

## `subtitle content region only.xml`

### Page purpose

Use this template when the page needs a subtitle but its main content
components are custom or not yet known. The status, title, and subtitle are
fully specified. Only the children of the Content Region are intentionally
unspecified.

### Vertical structure

| Screen band | Bounds       | Height | Content                              |
| ----------- | ------------ | -----: | ------------------------------------ |
| Status      | `y=0..12`    |  13 px | Inverted status bar                  |
| Blank       | `y=13..24`   |  12 px | Reserved whitespace                  |
| Title       | `y=25..49`   |  25 px | Main title, divider, page count      |
| Blank       | `y=50`       |   1 px | Title-to-subtitle separator          |
| Subtitle    | `y=51..67`   |  17 px | Main subtitle and secondary subtitle |
| Blank       | `y=68`       |   1 px | Subtitle-to-content separator        |
| Content     | `y=69..187`  | 119 px | Empty Content Region                 |
| Blank       | `y=188..199` |  12 px | Bottom whitespace                    |

### Empty Content Region

```text
Content Region:       x=8..187, y=69..187
Inherited font:       spleen-6x12
Region capacity:      22 columns × 7 rows
Region pixel size:    180 × 119 px
Background:           white
Component collection: empty by design
```

The component tree is:

```text
Page
├── status bar Region
│   ├── Main Status Text Box
│   └── Battery Status Text Box
├── Title Region
│   ├── Main Title Text Box
│   ├── Divider Text Box
│   └── Secondary Title Text Box
├── Subtitle Region
│   ├── Main Subtitle Text Box
│   └── Secondary Subtitle Text Box
└── Content Region
    └── components (empty)
```

The empty wrapper has the same meaning as in `content region only.xml`: render
an empty Region unless a separate generation request defines its children. Any
inserted Text Box, Text Area, or List Area inherits `spleen-6x12`, uses absolute
coordinates fully inside `x=8..187, y=69..187`, and must fit within 22 columns
and seven rows. A standard 22-cell child can again use `x=8..183`.

## Choosing a template

An agent can select the correct file by deciding whether the page needs a
subtitle and whether its content structure is already known:

```text
Does the page need a subtitle?
├── Yes
│   ├── Repeating/selectable rows → subtitle listing.xml
│   ├── Wrapped prose             → subtitle long content.xml
│   └── Custom/unspecified        → subtitle content region only.xml
└── No
    ├── Repeating/selectable rows → listing.xml
    ├── Wrapped prose             → Long content.xml
    └── Custom/unspecified        → content region only.xml
```

Preserve the chosen template's bands and capacities. Switching from a subtitle
template to a non-subtitle template is a layout change, not merely hiding the
subtitle text.

## Agent implementation notes

- Treat every `<text>` value as a placeholder. Replace it with supplied actual
  content or ignore it and render the slot empty; never treat it as required
  final copy.
- Keep the `Battery Status` Text Box reserved for actual battery status. Replace
  `BATT` with runtime battery data when available; do not use the slot for other
  content.
- Treat example List Area field values such as `Item` as sample data and
  resolve them from actual list content.
- Preserve empty List Area middle fields; do not invent secondary values.
- Preserve an empty Region-only `<components>` collection when no separate
  page-generation requirement defines its children; do not infer a component
  type from the available space alone.
- Decode `&gt;` to the visible `>` glyph before measuring or rendering.
- Do not render component `name` values as page text. Names identify Regions
  and components for agents and runtime diagnostics.
- The six files reuse several UUIDs because they are alternative standalone
  templates. Never merge their component trees into one XML document without
  assigning new unique IDs.
- Render Regions before their children. Children inherit the Region font and
  absolute coordinate space.
- Apply inversion with XOR. In these examples the status bar and selected list
  row are the visibly inverted surfaces.
- Keep all declared blank bands and four-pixel horizontal gaps. They are part
  of the intended page composition.
