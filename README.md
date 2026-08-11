# parcel-drafter-widget

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
node_modules and .vs), commits, pushes, and optionally cuts a GitHub release with
a zip attachment. Edit `$ExbWidgetPath` in `publish.ps1` after any EB version
upgrade so it points at the current install.

## License

Apache-2.0. The original ParcelDrafter widget for Web AppBuilder is Copyright
Esri Inc. under the same license; portions of the surveying algorithms are
derived from that work. Snapping, popup coordination, leg labels, GeoJSON
export, and surveyor unit conversions are derived from the Traverse widget,
Copyright Polk County, Oregon, also Apache-2.0.
