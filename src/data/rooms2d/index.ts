import type { RoomScene } from '@/lib/viz2d/types';
import photos from './photos.json';

/**
 * The rooms of the 2D visualizer: real photographs from public/rooms2d/Rooms, each with its floor and walls marked.
 * photos.json is generated from scripts/photo-rooms (see its README); the masks and thumbnails are in public/rooms2d/photos.
 */
export const BUILTIN_ROOMS = photos as unknown as RoomScene[];
