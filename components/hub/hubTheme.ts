import { proColors } from '@/constants/theme';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export const HUB = {
  background:      proColors.background,
  surface:         proColors.surface,
  surfaceElevated: proColors.surfaceAlt,
  accent:          proColors.primary,
  textPrimary:     proColors.textPrimary,
  textSecondary:   proColors.textSecondary,
  border:          proColors.border,
  positive:        proColors.success,
} as const;

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export const HUB_FEATURES: { icon: IoniconsName; label: string }[] = [
  { icon: 'flash-outline',        label: '3 free boosts to the top of search every month' },
  { icon: 'bar-chart-outline',    label: 'Analytics and earnings. See what\'s working.' },
  { icon: 'trending-up-outline',  label: 'Pro ranking. Your listings shown higher in search.' },
  { icon: 'pricetag-outline',     label: 'Sale Mode. Put your whole shop on sale at once.' },
  { icon: 'create-outline',       label: 'Bulk price editing across all listings' },
  { icon: 'arrow-down-outline',   label: 'Price Drop badge when you lower a price' },
  { icon: 'folder-outline',       label: 'Collections. Group your listings into themed edits.' },
  { icon: 'share-social-outline', label: 'Share kit for Instagram and WhatsApp' },
  { icon: 'diamond-outline',      label: 'Pro badge on your profile and listings' },
  { icon: 'flash-outline',        label: 'Fast Responder badge for quick replies' },
];

export interface HubListing {
  id: string;
  title: string;
  price: number;
  images: string[];
  status: string;
  view_count: number;
  save_count: number;
  occasion: string | null;
  collection_id: string | null;
}

export interface HubCollection {
  id: string;
  name: string;
  listingCount: number;
}

export interface HubData {
  totalEarned: number;
  thisMonthEarned: number;
  lastMonthEarned: number;
  totalViews: number;
  totalSaves: number;
  profileViews30d: number;
  chartData: { value: number }[];
  listings: HubListing[];
  collections: HubCollection[];
  occasionPerformance: { occasion: string; saves: number; views: number }[];
}
