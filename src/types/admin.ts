export type AdminTab = 
  | 'dashboard'
  | 'visualizer'
  | 'templates'
  | 'saved-designs'
  | 'tiles'
  | 'categories'
  | 'brands'
  | 'collections'
  | 'customers'
  | 'leads'
  | 'quotations'
  | 'orders'
  | 'analytics'
  | 'reports'
  | 'settings'
  | 'permissions';

export interface KpiCardData {
  id: string;
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  label: string;
  iconName: string;
}

export interface PopularTileItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  size: string;
  finish: string;
  colorHex: string;
  pricePerSqFt: number;
  visualizationsCount: number;
  rating: number;
  image: string;
}

export interface RecentDesignItem {
  id: string;
  title: string;
  customerName: string;
  roomType: string;
  dimensionsFt: string;
  floorTileName: string;
  wallTileName?: string;
  createdTime: string;
  status: 'Draft' | 'Completed' | 'Quoted';
  thumbnailUrl: string;
}

export interface CustomerActivityItem {
  id: string;
  customerName: string;
  avatarUrl?: string;
  roomType: string;
  tileName: string;
  action: string;
  date: string;
  status: 'Completed' | 'Pending' | 'Active' | 'Saved';
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  customerName: string;
  roomType: string;
  tileAreaSqFt: number;
  tileCostLkr: number;
  laborCostLkr: number;
  totalLkr: number;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
}

export interface RoomTemplateItem {
  id: string;
  name: string;
  description: string;
  defaultLengthFt: number;
  defaultWidthFt: number;
  defaultHeightFt: number;
  availableSurfaces: number;
  furnitureCount: number;
  thumbnailUrl: string;
}

export interface MaterialMaps {
  baseColor: string;
  normalMap?: string;
  roughnessMap?: string;
  displacementMap?: string;
}
