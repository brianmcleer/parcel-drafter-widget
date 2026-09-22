# parcel-drafter-widget

[![License](https://img.shields.io/github/license/brianmcleer/parcel-drafter-widget)](LICENSE) [![Release](https://img.shields.io/github/v/release/brianmcleer/parcel-drafter-widget?display_name=tag)](https://github.com/brianmcleer/parcel-drafter-widget/releases) [![Issues](https://img.shields.io/github/issues/brianmcleer/parcel-drafter-widget)](https://github.com/brianmcleer/parcel-drafter-widget/issues)

Repo for the Parcel Drafter custom widget for ArcGIS Experience Builder. The widget
lets users enter metes and bounds descriptions to draft parcels with misclose
checking, compass rule adjustment, rotation and scale, and save to feature layers.
It is a port of the Esri Web AppBuilder Parcel Drafter widget.

Authors: Brian McLeer (City of Grand Junction, CO), Nicholas Cramer
(Polk County, Oregon), and Eric McAvoy (Polk County, Oregon). Portions derived
from the Polk County Traverse widget (https://github.com/ncramer11/traverse).

- Esri Community post: https://community.esri.com/t5/experience-builder-custom-widgets/parcel-drafter-widget/ba-p/1716478
- Downloadable releases: see the Releases page of this repo

## Repo layout

```
parcel-drafter-widget/           <- this repo
├── README.md                    <- this file (GitHub landing page)
├── LICENSE                      <- Apache-2.0
├── .gitignore
├── publish.ps1                  <- one-command sync/commit/push/release script
└── parcel-drafter/              <- the widget (drops into your-extensions/widgets)
    ├── package.json
    ├── manifest.json
    ├── config.json
    ├── tsconfig.json
    ├── icon.svg
    ├── README.md                <- install steps, schema setup, troubleshooting
    ├── LICENSE
    └── src/ ...
```

## Installing the widget

See `parcel-drafter/README.md` for install steps, layer schema setup, requirements,
and the duplicate-name troubleshooting note. Short version: drop the `parcel-drafter`
folder into `client\your-extensions\widgets\` so that `manifest.json` sits directly
inside `widgets\parcel-drafter\`, then start the client as usual.

The release zip is the widget only. The Visual Studio type shims in this repo
(`parcel-drafter/src/exb-editor-shims.d.ts` and
`parcel-drafter/src/types/esri-shims.d.ts`) are left out on purpose: their ambient
`declare module` blocks are not file-scoped and would rewrite the react, jimu and
esri types for every other widget in your `your-extensions` folder. If you clone
this repo instead of using the zip, delete those two files before building; nothing
else depends on them.

## Publishing updates (maintainer workflow)

After changing the widget in the Experience Builder folder, open a terminal in
this repo folder and run:

- Code update only:
  ```
  powershell -ExecutionPolicy Bypass -File .\publish.ps1
  ```
- Code update plus a new downloadable version:
  ```
  powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.1.0
  ```

The script mirrors the widget from the EB install into this repo (skipping
node_modules, .vs and `Claude outputs`), commits, pushes, and optionally cuts a
GitHub release with a zip attachment. The zip is built from a staging copy with the
editor-only files in `$ReleaseOnlyExclude` removed, so the Visual Studio shims stay
in the repo but never reach a downstream install. Edit `$ExbWidgetPath` in
`publish.ps1` after any EB version upgrade so it points at the current install.

## License

Apache-2.0. The original ParcelDrafter widget for Web AppBuilder is Copyright
Esri Inc. under the same license; portions of the surveying algorithms are
derived from that work. Snapping, popup coordination, leg labels, GeoJSON
export, and surveyor unit conversions are derived from the Traverse widget,
Copyright Polk County, Oregon, also Apache-2.0.
