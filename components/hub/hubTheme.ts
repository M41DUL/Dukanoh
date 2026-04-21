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

export const CORE_FEATURE_LABELS = [
  'Priority ranking in search and discovery',
  'Analytics — see what\'s selling and what\'s not',
  '3 Story boosts every month',
] as const;

export const HUB_FEATURES: { icon: IoniconsName; label: string }[] = [
  { icon: 'flash-outline',        label: '3 Story boosts every month' },
  { icon: 'bar-chart-outline',    label: 'Analytics — see what\'s selling and what\'s not' },
  { icon: 'trending-up-outline',  label: 'Priority ranking in search and discovery' },
  { icon: 'create-outline',       label: 'Bulk price editing across your listings' },
  { icon: 'arrow-down-outline',   label: 'Price Drop badge — show buyers you\'ve reduced' },
  { icon: 'folder-outline',       label: 'Collections — group listings by theme or occasion' },
  { icon: 'share-social-outline', label: 'Share kit for Instagram and WhatsApp' },
  { icon: 'diamond-outline',      label: '◆ Pro badge on your profile and listings' },
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
