export type RoomType =
  | 'living-room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining-room'
  | 'outdoor'
  | 'staircase';

export interface RoomConfig {
  type: RoomType;
  label: string;
  icon: string;
  defaultLength: number; // ft
  defaultWidth: number;  // ft
  defaultHeight: number; // ft
  hasBathroomFeatures?: boolean;
}

export const ROOM_CONFIGS: RoomConfig[] = [
  { type: 'living-room', label: 'Living Room',    icon: '🛋️', defaultLength: 20, defaultWidth: 15, defaultHeight: 10 },
  { type: 'bedroom',     label: 'Bedroom',        icon: '🛏️', defaultLength: 14, defaultWidth: 12, defaultHeight: 9  },
  { type: 'kitchen',     label: 'Kitchen',        icon: '🍳', defaultLength: 12, defaultWidth: 10, defaultHeight: 9  },
  { type: 'bathroom',    label: 'Bathroom',       icon: '🚿', defaultLength: 13, defaultWidth: 10, defaultHeight: 9.5, hasBathroomFeatures: true },
  { type: 'dining-room', label: 'Dining Room',   icon: '🍽️', defaultLength: 14, defaultWidth: 12, defaultHeight: 9  },
  { type: 'outdoor',     label: 'Outdoor/Balcony',icon: '🌿', defaultLength: 16, defaultWidth: 10, defaultHeight: 8  },
  { type: 'staircase',   label: 'Staircase',      icon: '🪜', defaultLength: 18, defaultWidth: 12, defaultHeight: 12 },
];

export type SurfaceKey =
  | 'floor'
  | 'wall-n'
  | 'wall-s'
  | 'wall-e'
  | 'wall-w'
  | 'feature-wall'
  | 'backsplash'
  | 'shower-wall';

export const SURFACE_LABELS: Record<SurfaceKey, string> = {
  floor:          'Floor',
  'wall-n':       'North Wall',
  'wall-s':       'South Wall',
  'wall-e':       'East Wall',
  'wall-w':       'West Wall',
  'feature-wall': 'Feature Wall',
  backsplash:     'Kitchen Backsplash',
  'shower-wall':  'Shower Wall',
};
