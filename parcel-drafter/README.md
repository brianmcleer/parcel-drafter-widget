# Parcel Drafter - ArcGIS Experience Builder widget

Enter metes and bounds descriptions to draft parcels: bearing, distance, and radius
entry with live drawing, misclose checking, compass rule adjustment, rotation and
scale, and save to point, line, and polygon feature layers. A port of the Esri Web
AppBuilder Parcel Drafter widget for ArcGIS Experience Builder.

Authors: Brian McLeer (City of Grand Junction, CO), Nicholas Cramer
(Polk County, Oregon), and Eric McAvoy (Polk County, Oregon).

Original widget Copyright Esri Inc., Apache License 2.0. The surveying math
(Vincenty geodesics, arc geometry, misclose, compass rule) is a direct translation
of the original algorithms. Snapping to visible layers, popup coordination, leg
labels, GeoJSON export, and chains/rods unit support are derived from the
Traverse widget by Eric McAvoy and Nicholas Cramer, Copyright Polk County,
Oregon, Apache-2.0 (https://github.com/ncramer11/traverse).

- Esri Community post: https://community.esri.com/t5/experience-builder-custom-widgets/parcel-drafter-widget/ba-p/1716478
- Feedback: open a GitHub issue or comment on the Esri Community post

## Features

- New traverse from a map click or typed coordinates, with live drawing as you type
- Bearing formats: S20-25-25W, 20-25-25-3, dd.mmss, decimal degrees; the * shortcut
  copies the previous line and *tb continues tangent to the previous line or curve
- Distance entry accepts m, ft, usft, ch (chains), rd (rods), lk (links), and
  va (varas) suffixes for mixed-unit deed calls (AH 215 Table 2-2 factors);
  surveyor units convert to meters on entry
- Bearings paste directly from record documents: degree, minute, and second
  symbols normalize automatically (N45°30'00"E parses the same as N45-30-00E)
- Draft metes and bounds legal description export following AH 215 conventions:
  commencement tie, Point of Beginning, thence courses, curve radius/arc/chord
  language, and closing acreage statement (draft only, staff review required)
- Boundary and connection line types with a configurable default
- Misclose bearing, distance, ratio, and calculated area; compass rule applied
  automatically within the configured snap distance or ratio
- Rotation and scale by text entry or by dragging on the map around an anchor point
- Drag or arrow-key reordering of traverse legs
- 10-key entry flow: numpad + or numpad Enter advances from bearing to length and
  commits the line from length or radius, numpad / jumps to radius, and focus
  returns to bearing for the next call
- Start point and digitize clicks snap to the configured layers within tolerance
- Edit traverse: closed parcels select by polygon footprint, unclosed by a
  connectivity walk from the clicked line; saving an edit updates the existing
  polygon and replaces its lines instead of duplicating features
- Builder settings: layer pickers with related line and point layers auto-detected,
  COGO field dropdowns from the layer schema, attribute settings (fixed fields,
  webmap popup fields, or a custom list with aliases), misclose and snapping config
- Bearing and distance labels on each traverse line (toggleable), with an optional
  session color override for the drawing
- Native snapping to all visible feature layers via SketchViewModel when picking
  the start point, digitizing, or setting the rotation anchor (toggleable), with
  identify popups suppressed while a map tool is active
- GeoJSON export of points, lines, and the closed parcel polygon; curves export
  as densified geometry
- WCAG 2.1 AA accessibility and tooltips throughout, styled with the
  Calcite-aligned jimu theme tokens

## Requirements

- ArcGIS Experience Builder Developer Edition 1.21 (built and tested on 1.21;
  manifest exbVersion is 1.21.0)
- Editable point, line, and polygon feature layers for saving traverses. The default
  field names match the Esri Parcel Drafter solution schema (Direction, Distance,
  Radius, ArcLength, LineType, and so on) and are configurable in the settings panel
- No third-party dependencies. The widget uses only jimu and the ArcGIS Maps SDK
  modules that ship with Experience Builder, so no per-widget install is required

## Creating the layers from scratch

Adapted from the WAB-era setup thread
(https://community.esri.com/t5/local-government-solutions-users-questions/parcel-drafter-setup-question/td-p/847281),
with corrections for what this widget actually requires.

Line layer (one feature per traverse leg):

| Field | Type | Stores |
|---|---|---|
| Direction (or Bearing) | Double | Bearing as north azimuth decimal degrees |
| Distance | Double | Line or chord distance in meters |
| Radius | Double | Curve radius in meters, null or 0 for straight lines |
| ArcLength | Double | Arc length in meters for curved lines |
| LineType (or Category) | Short or Long Integer | 1 = boundary, 0 = connection |

Polygon layer (one feature per closed parcel):

| Field | Type | Stores |
|---|---|---|
| Name | Text | Plan name |
| Description | Text | Plan description |
| StatedArea | Text | Deed or stated area |
| MiscloseRatio | Text | Computed ratio, for example 1:25000 |
| MiscloseDistance | Double | Misclose distance in meters |
| Rotation | Double | Rotation applied to the traverse |
| Scale | Double | Scale factor applied |

Point layer: no required fields, geometry only.

The original WAB solution schema used Bearing, Category, SequenceID, ChordLength,
and RelateGuid, and its polygon layer used ClosingRate and ClosingDistance. Layers
deployed from that solution work directly with this widget: pick them in the
settings panel and map the fields with the dropdowns.

Field names are matched without case, on both save and Edit traverse. This
matters because the same data can present different casing depending on how it
is served: a hosted feature layer in Portal or ArcGIS Online often lowercases
field names (Direction becomes direction) while a map service keeps the original
case. A field mapping configured against one works against the other, and the
Oracle lowercase-field issue from the WAB thread does not apply here. Spelling
still has to match: a configured field the layer does not have is skipped, and
the widget now names those fields in its save and Edit traverse messages.

Requirements this widget does NOT have (WAB-solution-only plumbing):

- No RelateGuid field, SequenceID field, or relationship class between the
  polygon and line layers. Edit selection is spatial, not relationship-based.
- No hosted-versus-referenced publishing constraint. Any editable feature
  service works. The "invalid foreign key" error from the WAB thread cannot
  occur with this widget.

Minimum useful setup: a line layer with Direction and Distance. Everything else
is optional; unmapped fields are skipped on save.

## Install

1. Download and extract the widget zip.

   The zip is the widget only. The Visual Studio type shims in the repo
   (`parcel-drafter/src/exb-editor-shims.d.ts` and
   `parcel-drafter/src/types/esri-shims.d.ts`) are left out on purpose: their
   ambient `declare module` blocks are not file-scoped and would rewrite the
   react, jimu and esri types for every other widget in your `your-extensions`
   folder.

   If you clone the repo instead of using the zip, delete
   `parcel-drafter/src/exb-editor-shims.d.ts` and
   `parcel-drafter/src/types/esri-shims.d.ts` before building; nothing else
   depends on them.
2. Copy the `parcel-drafter` folder into your Experience Builder install at
   `client\your-extensions\widgets\parcel-drafter`.

   The `manifest.json` file must sit directly inside
   `your-extensions\widgets\parcel-drafter\`, never nested a second level deep
   (for example `widgets\parcel-drafter\parcel-drafter`). Nesting is the usual
   cause of a widget not registering.
3. Start the client as usual (`npm start` in the `client` folder; on a fresh 1.21
   install, `pnpm ci` first per Esri's setup instructions).
4. In Builder, add the Parcel Drafter widget to a page that contains a Map widget,
   then open the widget settings to select the map and the target layers.

## Usage telemetry

This widget records anonymous usage counts and errors so the GIS Division can see which widgets and versions are in use and which errors users hit. It records the app id and title, widget name and version, the action name, a truncated error message, the site host name and browser family. It never records usernames, coordinates, addresses, attribute values or URLs with query strings. Where the data goes: on page load the widget asks the app's portal for a public item tagged `exb-beacon-sink` and posts to that table. If your portal has no such item, nothing is sent anywhere. To turn it off for an app, set `"telemetry": false` in the widget's config, or users can enable Do Not Track in their browser. The shared module is `src/shared/beacon.ts`.

## Troubleshooting: `parcel-drafter is duplicated`

Experience Builder registers each widget by the `name` in its `manifest.json` and
throws this error when the same name is registered more than once. A single,
correctly placed copy cannot duplicate itself, so a second copy is present
somewhere. Check in this order:

1. A nested folder: `widgets\parcel-drafter\parcel-drafter`. The manifest must sit
   directly inside the widget folder.
2. A leftover folder from an earlier build or version, including any `-copy` folder.
3. A stale compiled build in `client\dist\widgets`. Stop the client server, delete
   the matching folder under `dist\widgets`, then start again.

## Using the widget

- **New traverse** → click the map (or type longitude/latitude) to set the start point.
- Enter **bearing / length / radius** rows. Supported bearing formats are the same as WAB:
  `dd-mm-ss-[1234]`, `Ndd-mm-ssE`, `Ndd.mmssE`, `dd.mmss`, `dd.dddd`, `dd-mm-ss`, `dd.mmss-[1234]`, `Ndd.ddddE`, `dd.dddd-[1234]`. Type `*` in a field to copy the previous row's value. Lengths accept `m`, `ft`, `usft` suffixes.
- Positive radius = curve right, negative = curve left; negative length = major arc (same conventions as WAB). Chord vs. arc length entry is controlled in **Plan settings**.
- **Digitize** mode adds lines by clicking the map (inverse bearing/distance is computed).
- When boundary lines close, the **misclose panel** shows bearing/distance/ratio/area. Within the configured snap distance or ratio, **compass-rule adjustment** is applied automatically.
- **Rotation / Scale** transform the drawing; **Anchor** lets you click a traverse node to hold it fixed while rotating/scaling.
- **Save** writes lines, points, and the closed-boundary polygon to the configured layers with plan info attributes.
- **Edit traverse** → click existing parcel lines; rows are rebuilt from the stored bearing/distance/radius fields.

## WAB → ExB conversion map

| WAB (Dojo / JS API 3.x) | ExB (React / JS API 4.x) |
|---|---|
| `Widget.js` + `Widget.html` (dijit) | `src/runtime/widget.tsx` |
| `NewTraverse.js` (143 KB: UI + math) | UI → `components/traverse-grid.tsx`; math → `lib/traverse-engine.ts` |
| `geometryUtils.js` | `lib/geometry-utils.ts` (Vincenty, arcs, chord↔tangent - 1:1 port) |
| `utils.js` (bearing/unit parsing) | `lib/bearing-utils.ts`, `lib/unit-utils.ts` (same 9 regex formats) |
| `PlanSettings.js/html` | `components/plan-settings.tsx` |
| `MiscloseDetails.js/html` | `components/misclose-details.tsx` |
| `ParcelTools.js/html` | `components/parcel-tools.tsx` |
| `PlanInfo.js` (save via applyEdits) | `lib/save-utils.ts` (`FeatureLayer.applyEdits`, 4.x) |
| `setting/Setting.js/html` | `src/setting/setting.tsx` (MapWidgetSelector + DataSourceSelector) |
| `nls/strings.js` (30+ locales) | `translations/default.ts` (English; add locales as needed) |
| `esri/geometry/GeometryService.project` | `projectOperator` (SDK 4.31+) with classic `projection` fallback, loaded at runtime via `loadArcGISJSAPIModules` |
| `dojo/Deferred`, `dojo/_base/array` | Promises / native array methods |
| GraphicsLayer via map manager | `GraphicsLayer` added through `JimuMapViewComponent` |

## Geometry services across SDK versions

The classic `esri/geometry/projection`, `geometryEngine`, and `webMercatorUtils` APIs were deprecated and removed in newer Maps SDK releases. The widget therefore resolves its geometry services at runtime: it tries the modern operator modules first (`projectOperator`, `simplifyOperator`, `geodeticLengthOperator`, `geodeticAreaOperator`) and falls back to the classic modules on older SDKs. Projection works for any organization spatial reference (Web Mercator, State Plane, national grids, geographic CS) including datum transformations; all surveying math runs in WGS84 internally and geometries are projected at the map/layer boundaries.

## Doc-parity features (closed gaps)

All gaps against the WAB Parcel Drafter doc have been closed:
`*tb` tangent-curve bearing shortcut; drag-and-keyboard reordering of traverse legs;
default line type in Builder settings; COGO field pickers driven by the layer schema
(free-text fallback); automatic detection of related line/point layers when the
polygon layer is selected; Attribute Settings (legacy fixed inputs, webmap-popup
fields, or a custom field list with aliases) edited at runtime and saved to the
parcel; start-point and digitize snapping to the configured layers; interactive
drag-to-rotate and drag-to-scale around the anchor (works in any spatial reference,
unlike the WAB Web-Mercator-only version); Edit Traverse saves as an UPDATE - the
polygon feature is updated in place and its previous lines are replaced (deleted +
re-added in one applyEdits call); and parcel selection uses the polygon footprint
for closed parcels or a connectivity walk from the clicked line for unclosed
boundaries, with lines chained end-to-start into entry order.

Edit-session note: existing node points are left untouched on update (original
points are not tracked by object id), so points are only created on first save.

## Known differences / follow-ups

- **Locales**: only English strings were carried over; the original's 30+ `nls` locales can be added under `translations/` incrementally.
- **Per-line-type symbol pickers** (WAB's `SymbolChooserPopup`) are not exposed in Builder - edit symbols in `config.json` defaults or extend the setting page.
- **Map cursor tooltips** (`MapTooltipHandler.js`) are not implemented; active-tool state is shown in the widget instead.

## Changelog

- **2026-09-17, 1.8.1**: Packaging: the Visual Studio editor shims are no longer in the release zip.
