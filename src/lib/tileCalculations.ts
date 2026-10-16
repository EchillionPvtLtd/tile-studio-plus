/** Convert feet to millimetres */
export const ftToMm = (ft: number) => ft * 304.8;

/** Convert millimetres to feet */
export const mmToFt = (mm: number) => mm / 304.8;

/** Calculate tile requirement for a surface */
export function calcTileRequirement(
  lengthFt: number,
  widthFt: number,
  tileWidthMm: number,
  tileHeightMm: number,
  wastagePct = 10,
) {
  const areaRoomMm2 = ftToMm(lengthFt) * ftToMm(widthFt);
  const areaTileMm2 = tileWidthMm * tileHeightMm;
  const areaRoomSqFt = lengthFt * widthFt;
  const areaRoomSqM = areaRoomMm2 / 1_000_000;

  const tilesNeeded  = Math.ceil(areaRoomMm2 / areaTileMm2);
  const withWastage  = Math.ceil(tilesNeeded * (1 + wastagePct / 100));
  const wasteCount   = withWastage - tilesNeeded;

  return {
    areaRoomSqFt,
    areaRoomSqM,
    tilesNeeded,
    withWastage,
    wasteCount,
    wastagePct,
  };
}

/** Calculate price breakdown in LKR */
export function calcPrice(
  areaRoomSqFt: number,
  pricePerSqFt: number,
  wastagePct = 10,
) {
  const base    = areaRoomSqFt * pricePerSqFt;
  const wastage = base * (wastagePct / 100);
  const total   = base + wastage;
  return { base, wastage, total };
}

/**
 * Compute UV repeat factors for a surface so that tiles
 * appear at their correct physical size.
 */
export function calcUVRepeat(
  surfaceLengthFt: number,
  surfaceWidthFt: number,
  tileWidthMm: number,
  tileHeightMm: number,
): { repeatX: number; repeatY: number } {
  const surfaceLengthMm = ftToMm(surfaceLengthFt);
  const surfaceWidthMm  = ftToMm(surfaceWidthFt);
  return {
    repeatX: surfaceLengthMm / tileWidthMm,
    repeatY: surfaceWidthMm  / tileHeightMm,
  };
}
