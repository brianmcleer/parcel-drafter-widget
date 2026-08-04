// Type shims: keep the widget type-checking in IDE environments where the
// ArcGIS ambient types are not visible (for example pnpm layouts that do not
// hoist @types packages). Real module declarations always win over this
// wildcard when present, so it merges harmlessly in properly configured
// environments. Webpack builds are unaffected either way.

declare module 'esri/*' {
    /** Any-typed stand-in usable as both a value (constructor) and a type. */
    class __EsriModuleDefault {
        constructor(...args: any[])
        [key: string]: any
    }
    export default __EsriModuleDefault
}

declare namespace __esri {
    interface Handle { [key: string]: any }
    interface FeatureLayer { [key: string]: any }
    interface Polyline { [key: string]: any }
    interface Polygon { [key: string]: any }
    interface Point { [key: string]: any }
    interface Geometry { [key: string]: any }
    interface Graphic { [key: string]: any }
    interface ViewClickEvent { [key: string]: any }
    interface SpatialReference { [key: string]: any }
}