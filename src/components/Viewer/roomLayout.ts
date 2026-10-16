import type { RoomType } from '@/types/room';

/**
 * Single source of truth for where openings and fixed fixtures sit in each
 * room, shared by the architecture (walls, doors, windows, shower tiling) and
 * the furniture so nothing is ever placed in front of a door, across a window
 * or through a shower screen.
 *
 * Coordinates: X runs along the room length (west → east), Z along the width
 * (north → south). The north wall is the feature wall facing the default camera.
 */

/** Depth of the thickest north feature-wall treatment (slat panel); tile surfaces and wall-mounted items sit in front of it. */
export const FEATURE_WALL_DEPTH = 0.045;

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface Opening {
  wall: WallSide;
  /** Centre along the wall: world X for north/south walls, world Z for east/west walls. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor. */
  sill: number;
}

export interface RoomOpenings {
  door: Opening | null;
  window: Opening | null;
  /** Terrace / balcony: full-height glass sliders in the house facade. */
  slider: Opening | null;
  /** Staircase: door off the upper landing (sill = landing height). */
  upperDoor?: Opening;
}

export interface WallTransform {
  position: [number, number, number];
  rotation: [number, number, number];
}

/** Places a wall-mounted element so its local +Z points into the room and local X runs along the wall. */
export function wallTransform(wall: WallSide, offset: number, y: number, halfL: number, halfW: number, inset = 0): WallTransform {
  switch (wall) {
    case 'north':
      return { position: [offset, y, -halfW + inset], rotation: [0, 0, 0] };
    case 'south':
      return { position: [offset, y, halfW - inset], rotation: [0, Math.PI, 0] };
    case 'east':
      return { position: [halfL - inset, y, offset], rotation: [0, -Math.PI / 2, 0] };
    case 'west':
      return { position: [-halfL + inset, y, offset], rotation: [0, Math.PI / 2, 0] };
  }
}

/** Bathroom fixed-fixture zones (metres). */
export function getBathroomLayout(lengthM: number, widthM: number) {
  const halfL = lengthM / 2;
  const halfW = widthM / 2;
  const showerW = Math.min(1.4, lengthM * 0.36); // along the north wall
  const showerD = Math.min(1.2, widthM * 0.42); // along the east wall
  const tubLen = Math.min(1.6, widthM * 0.55);
  const tubZ = halfW - 0.18 - tubLen / 2;
  return {
    showerW,
    showerD,
    showerX0: halfL - showerW, // west edge of the shower (glass screen line)
    showerZ1: -halfW + showerD, // south edge of the shower
    tubLen,
    tubZ,
  };
}

/**
 * Staircase hall: a straight flight along the north wall rising to an upper
 * landing on the east side. The rise is derived from the room height so the
 * landing always keeps standing headroom (≥ 2.25 m) and risers stay ≤ 18 cm.
 */
export function getStaircaseLayout(lengthM: number, widthM: number, heightM: number) {
  const halfL = lengthM / 2;
  const halfW = widthM / 2;
  const totalRise = Math.min(3.0, Math.max(0.9, heightM - 2.25));
  const stepCount = Math.ceil(totalRise / 0.18);
  const rise = totalRise / stepCount;
  const run = 0.28;
  const stepWidth = Math.min(1.2, widthM * 0.34);
  const flightLength = stepCount * run;
  const approach = Math.min(1.0, Math.max(0.4, lengthM - flightLength - 1.6));
  const stairStartX = -halfL + approach;
  const landingStartX = stairStartX + flightLength;
  // The raised landing is a gallery along the north/east, leaving the hall open in front of it
  const landingDepth = Math.min(widthM - 1.2, Math.max(stepWidth + 1.0, widthM * 0.55));
  return {
    totalRise,
    stepCount,
    rise,
    run,
    stepWidth,
    flightLength,
    stairStartX,
    stairStartZ: -halfW + stepWidth / 2 + FEATURE_WALL_DEPTH,
    landingStartX,
    landingWidth: halfL - landingStartX,
    landingDepth,
    upperDoorHeight: Math.min(2.1, heightM - totalRise - 0.05),
  };
}

export function getRoomOpenings(
  roomType: RoomType,
  lengthM: number,
  widthM: number,
  heightM: number,
  doorW: number,
  doorH: number,
  windowW: number,
  windowH: number,
): RoomOpenings {
  const halfL = lengthM / 2;
  const halfW = widthM / 2;
  const door = (wall: WallSide, offset: number): Opening => ({ wall, offset, width: doorW, height: doorH, sill: 0 });
  const window = (wall: WallSide, offset: number, w = windowW, h = windowH, sill = Math.max(0.45, heightM * 0.55 - h / 2)): Opening => ({
    wall,
    offset,
    width: w,
    height: h,
    sill,
  });

  switch (roomType) {
    case 'living-room':
      return { door: door('east', -widthM * 0.2), window: window('west', 0), slider: null };
    case 'bedroom':
      return {
        door: door('south', halfL - doorW / 2 - 0.3),
        window: window('east', -widthM * 0.05, Math.min(windowW, widthM * 0.45)),
        slider: null,
      };
    case 'kitchen':
      return { door: door('east', widthM * 0.22), window: null, slider: null };
    case 'bathroom': {
      const bath = getBathroomLayout(lengthM, widthM);
      return {
        door: door('south', lengthM * 0.25),
        window: window('west', bath.tubZ, Math.min(1.5, bath.tubLen), 0.55, heightM * 0.74 - 0.275),
        slider: null,
      };
    }
    case 'dining-room':
      return { door: door('east', widthM * 0.25), window: window('west', 0, Math.min(windowW, widthM * 0.45)), slider: null };
    case 'outdoor': {
      const w = Math.min(2.4, lengthM * 0.42);
      return {
        door: null,
        window: null,
        slider: { wall: 'north', offset: -halfL + 0.35 + w / 2, width: w, height: Math.min(2.3, heightM - 0.12), sill: 0 },
      };
    }
    case 'staircase': {
      // Ground-floor entry on the south wall clear of the stair approach; the upper door opens off the landing.
      const stair = getStaircaseLayout(lengthM, widthM, heightM);
      return {
        door: door('south', Math.min(stair.landingStartX - doorW / 2 - 0.4, -halfL * 0.3)),
        window: null,
        slider: null,
        upperDoor: { wall: 'east', offset: -halfW + stair.landingDepth / 2 + 0.1, width: doorW, height: stair.upperDoorHeight, sill: stair.totalRise },
      };
    }
    default:
      return { door: door('east', -widthM * 0.2), window: null, slider: null };
  }
}
