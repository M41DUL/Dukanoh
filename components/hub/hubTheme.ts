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

export const HUB_FEATURES: { icon: IoniconsName; label: string; description: string }[] = [
  {
    icon: 'flash-outline',
    label: '3 free boosts every month',
    description: 'Push your listings to the top of search results, three times a month. Automatically.',
  },
  {
    icon: 'bar-chart-outline',
    label: 'Analytics & earnings',
    description: "See your views, saves, and earnings all in one place. Know exactly what's working.",
  },
  {
    icon: 'trending-up-outline',
    label: 'Pro ranking',
    description: 'Your listings rank higher across search and browse. More eyes, more sales.',
  },
  {
    icon: 'pricetag-outline',
    label: 'Sale Mode',
    description: 'Mark your whole shop as on sale. A sale banner shows on every listing automatically.',
  },
  {
    icon: 'create-outline',
    label: 'Bulk price editing',
    description: 'Update prices across all your listings at once. No more editing one by one.',
  },
  {
    icon: 'arrow-down-outline',
    label: 'Price Drop label',
    description: 'When you lower a price, buyers see a Price Drop badge. Creates urgency to buy.',
  },
  {
    icon: 'folder-outline',
    label: 'Collections',
    description: 'Group your listings into themed collections. Great for curated drops and gifting edits.',
  },
  {
    icon: 'share-social-outline',
    label: 'Share kit',
    description: 'Generate polished share cards for your listings. Ready for Instagram and WhatsApp in one tap.',
  },
  {
    icon: 'diamond-outline',
    label: 'Pro badge ◆',
    description: 'A Pro ◆ mark on your profile and listings. Signals trust and serious selling.',
  },
  {
    icon: 'flash-outline',
    label: 'Fast Responder badge ⚡',
    description: 'Earn a ⚡ badge when you reply quickly. Buyers prioritise fast sellers.',
  },
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
