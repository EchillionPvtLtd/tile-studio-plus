import type { PolygonShape, RoomScene, SurfaceDef } from '@/lib/viz2d/types';
import { newId } from '../savedDesigns';
import type { EditorDraft } from './editorStore';

/** Photos are kept at a size that looks sharp on a big screen and stays quick to process. */
const MAX_SIDE = 2048;
const MIN_SIDE = 480;

const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Starts a new room from a photo chosen on this device. The photo is decoded here (so a file the browser cannot read
 * is reported at once), turned the right way up, and shrunk to at most 2048 px; the server will store that version.
 */
export async function draftFromFile(file: File): Promise<EditorDraft> {
  if (!FILE_TYPES.includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.size > 12 * 1024 * 1024) throw new Error('That photo is larger than 12 MB. Choose a smaller one.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('That photo could not be opened. Try saving it as a JPG first.');
  }
  if (Math.min(bmp.width, bmp.height) < MIN_SIDE) {
    bmp.close();
    throw new Error(`That photo is too small. Use one at least ${MIN_SIDE} pixels on its short side.`);
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k);
  const height = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The photo could not be prepared.'))), 'image/jpeg', 0.92));
  return {
    roomId: null,
    sceneId: `draft-${newId()}`,
    name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 60) || 'My room',
    roomType: 'living-room',
    image: { src: URL.createObjectURL(blob), width, height, file: blob },
    surfaces: [],
    occluders: [],
  };
}

/** Opens a showroom's own room for editing. */
export function draftFromRoom(room: RoomScene): EditorDraft {
  return {
    roomId: room.id,
    // Its own scene id while editing: the tiles already laid in the room stay out of the way until it is saved
    sceneId: `edit-${room.id}`,
    name: room.name,
    roomType: room.roomType,
    image: { src: room.image.src, width: room.image.width, height: room.image.height, uploadedUrl: room.image.src },
    surfaces: room.surfaces.map((s) => ({ ...s })),
    occluders: room.occluders ?? [],
  };
}

/** The room as the stage sees it while it is being edited. */
export function sceneFromDraft(d: EditorDraft): RoomScene {
  return {
    id: d.sceneId,
    name: d.name || 'New room',
    roomType: d.roomType,
    source: 'custom',
    image: { src: d.image.src, width: d.image.width, height: d.image.height },
    surfaces: d.surfaces.filter((s) => s.mask.kind === 'polygons' && s.mask.shapes.length > 0),
    occluders: d.occluders as PolygonShape[],
    version: 1,
  };
}

/** What is stored for the room: only the outlines and perspective, with a stable order of surfaces. */
export function dataFromDraft(d: EditorDraft): { surfaces: SurfaceDef[]; occluders: PolygonShape[] } {
  return {
    surfaces: d.surfaces
      .filter((s) => s.mask.kind === 'polygons' && s.mask.shapes.length > 0)
      .map((s) => ({ id: s.id, name: s.name.trim(), kind: s.kind, priority: s.priority, mask: s.mask, calibration: s.calibration })),
    occluders: d.occluders,
  };
}
