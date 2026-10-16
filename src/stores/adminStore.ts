import { create } from 'zustand';
import { AdminTab, PopularTileItem, QuotationItem, RecentDesignItem } from '@/types/admin';

interface AdminStoreState {
  activeTab: AdminTab;
  searchQuery: string;
  selectedTile: PopularTileItem | null;
  selectedDesign: RecentDesignItem | null;
  selectedQuote: QuotationItem | null;
  isAddTileModalOpen: boolean;
  isTileDetailModalOpen: boolean;
  isQuoteModalOpen: boolean;

  logoUrl: string;

  setActiveTab: (tab: AdminTab) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTile: (tile: PopularTileItem | null) => void;
  setSelectedDesign: (design: RecentDesignItem | null) => void;
  setSelectedQuote: (quote: QuotationItem | null) => void;
  setAddTileModalOpen: (open: boolean) => void;
  setTileDetailModalOpen: (open: boolean) => void;
  setQuoteModalOpen: (open: boolean) => void;
  setLogoUrl: (url: string) => void;
  initLogoUrl: () => void;
}

export const useAdminStore = create<AdminStoreState>((set) => ({
  activeTab: 'dashboard',
  searchQuery: '',
  selectedTile: null,
  selectedDesign: null,
  selectedQuote: null,
  isAddTileModalOpen: false,
  isTileDetailModalOpen: false,
  isQuoteModalOpen: false,

  // Always default to static path for 100% SSR & Hydration match
  logoUrl: '/Logo/TS+.BG.png',

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedTile: (tile) => set({ selectedTile: tile, isTileDetailModalOpen: !!tile }),
  setSelectedDesign: (design) => set({ selectedDesign: design }),
  setSelectedQuote: (quote) => set({ selectedQuote: quote, isQuoteModalOpen: !!quote }),
  setAddTileModalOpen: (open) => set({ isAddTileModalOpen: open }),
  setTileDetailModalOpen: (open) => set({ isTileDetailModalOpen: open }),
  setQuoteModalOpen: (open) => set({ isQuoteModalOpen: open }),
  setLogoUrl: (logoUrl) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tv_logo_url', logoUrl);
    }
    set({ logoUrl });
  },
  initLogoUrl: () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tv_logo_url');
      if (saved && !saved.includes('logo-178688') && !saved.includes('Logo.jpg')) {
        set({ logoUrl: saved });
      } else {
        try {
          localStorage.removeItem('tv_logo_url');
        } catch {}
        set({ logoUrl: '/Logo/TS+.BG.png' });
      }
    }
  },
}));
