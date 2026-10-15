// Os pacotes @turf/* trazem tipos que o TypeScript não resolve com "exports"; declaração mínima do que usamos.
declare module "@turf/bbox" {
  export default function bbox(geojson: unknown): [number, number, number, number];
}
declare module "@turf/length" {
  export default function length(geojson: unknown, options?: { units?: string }): number;
}
declare module "@turf/line-overlap" {
  export default function lineOverlap(
    line1: unknown,
    line2: unknown,
    options?: { tolerance?: number }
  ): { features: { type: "Feature"; geometry: { type: "LineString" | "MultiLineString"; coordinates: number[][] | number[][][] }; properties: Record<string, unknown> | null }[] };
}
