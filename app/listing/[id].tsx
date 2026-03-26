import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { HowItWorks } from '@/components/HowItWorks';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { Listing } from '@/components/ListingCard';
import { ListingGrid } from '@/components/ListingGrid';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SectionHeader } from '@/components/SectionHeader';
import { StarRating } from '@/components/StarRating';
import { BorderRadius, ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useSaved } from '@/context/SavedContext';
import { useAuth } from '@/hooks/useAuth';
import { recordView } from '@/hooks/useRecentlyViewed';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IMAGE_HEIGHT = Math.round(width * 1.5);

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [sellerListings, setSellerListings] = useState<Listing[]>([]);
  const [similarListings, setSimilarListings] = useState<Listing[]>([]);
  const [offerVisible, setOfferVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerSending, setOfferSending] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [offerPreset, setOfferPreset] = useState<'10' | '20' | 'custom'>('custom');
  const offerInputRef = useRef<TextInput>(null);
  const [boostExpiry, setBoostExpiry] = useState<Date | null>(null);
  const [boostVisible, setBoostVisible] = useState(false);
  const [responseRate, setResponseRate] = useState<number | null>(null);
  const [soldCount, setSoldCount] = useState<number | null>(null);
  const [saveCount, setSaveCount] = useState(0);
  const [offerCount, setOfferCount] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const imageScrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [IMAGE_HEIGHT * 0.6, IMAGE_HEIGHT * 0.85],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const btnBackdropOpacity = scrollY.interpolate({
    inputRange: [IMAGE_HEIGHT * 0.6, IMAGE_HEIGHT * 0.85],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const titleOpacity = scrollY.interpolate({
    inputRange: [IMAGE_HEIGHT * 0.75, IMAGE_HEIGHT * 0.85],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const insets = useSafeAreaInsets();
  const { isSaved, toggleSave } = useSaved();
  const isSeller = !!user && !!listing && user.id === listing.seller_id;
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    if (!id) return;

    supabase
      .from('listings')
      .select('*, seller:users(username, avatar_url, rating_avg, rating_count, created_at)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          setListing(data as unknown as Listing);
          setSaveCount((data as any).save_count ?? 0);
          supabase.rpc('get_seller_response_rate', { p_seller_id: data.seller_id }).then(({ data: rate }) => {
            if (rate !== null) setResponseRate(rate as number);
          });
          supabase
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', data.seller_id)
            .eq('status', 'sold')
            .then(({ count }) => setSoldCount(count ?? 0));
          supabase
            .from('listings')
            .select('*, seller:users(username, avatar_url)')
            .eq('seller_id', data.seller_id)
            .eq('status', 'available')
            .neq('id', id)
            .order('created_at', { ascending: false })
            .limit(4)
            .then(({ data: others }) => {
              if (others) setSellerListings(others as unknown as Listing[]);
            });
          supabase
            .from('listings')
            .select('*, seller:users(username, avatar_url)')
            .eq('category', data.category)
            .eq('status', 'available')
            .neq('id', id)
            .neq('seller_id', data.seller_id)
            .order('created_at', { ascending: false })
            .limit(4)
            .then(({ data: similar }) => {
              if (similar) setSimilarListings(similar as unknown as Listing[]);
            });
          supabase
            .from('messages')
            .select('content')
            .eq('listing_id', id)
            .then(({ data: msgs }) => {
              const count = msgs?.filter(m => m.content?.startsWith('__OFFER__')).length ?? 0;
              setOfferCount(count);
            });
          if (data.status !== 'draft') {
            if (user) recordView(id, user.id);
            supabase.rpc('increment_view_count', { listing_id: id }).then(() => {
              setListing(prev => prev ? { ...prev, view_count: (prev.view_count ?? 0) + 1 } : prev);
            });
          }
          supabase
            .from('boosts')
            .select('expires_at')
            .eq('listing_id', id)
            .gte('expires_at', new Date().toISOString())
            .maybeSingle()
            .then(({ data: boost }) => {
              if (boost) setBoostExpiry(new Date(boost.expires_at));
            });
        }
        setLoading(false);
      });
  }, [id]);


  useEffect(() => {
    if (offerVisible) {
      setTimeout(() => offerInputRef.current?.focus(), 100);
    }
  }, [offerVisible]);

  if (loading) return <LoadingSpinner />;
  if (!listing) return null;

  const findOrCreateConversation = async (): Promise<string | null> => {
    if (!user || !id) return null;
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', id)
      .eq('buyer_id', user.id)
      .maybeSingle();
    if (existing) return existing.id as string;
    const { data: created } = await supabase
      .from('conversations')
      .insert({ listing_id: id, buyer_id: user.id, seller_id: listing.seller_id })
      .select('id')
      .single();
    return (created?.id as string) ?? null;
  };

  const handleMessage = async () => {
    const convId = await findOrCreateConversation();
    if (convId) router.push(`/conversation/${convId}`);
  };


  const handleMarkSold = () => {
    Alert.alert(
      'Mark as sold',
      'This will hide the listing from the feed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as sold',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('listings').update({ status: 'sold', sold_at: new Date().toISOString() }).eq('id', id!);
            setListing(prev => prev ? { ...prev, status: 'sold' } : prev);
          },
        },
      ]
    );
  };

  const handlePublish = async () => {
    await supabase.from('listings').update({ status: 'available' }).eq('id', id!);
    setListing(prev => prev ? { ...prev, status: 'available' } : prev);
    Alert.alert('Published!', 'Your listing is now live on the feed.');
  };

  const handleDeleteDraft = () => {
    Alert.alert('Delete draft', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('listings').delete().eq('id', id!);
          router.back();
        },
      },
    ]);
  };

  const handleCloseBoost = () => setBoostVisible(false);

  const handleBoost = async () => {
    if (!user || !id) return;
    const { data: existing } = await supabase
      .from('boosts')
      .select('id')
      .eq('listing_id', id)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();
    if (existing) { setBoostVisible(false); return; }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('boosts').insert({ listing_id: id, seller_id: user.id, expires_at: expiresAt, amount_paid: 0 });
    setBoostExpiry(new Date(expiresAt));
    setBoostVisible(false);
  };

  const handleShare = () => {
    Share.share({
      message: `${listing.title} — £${listing.price.toFixed(2)} on Dukanoh`,
    });
  };

  const submitReport = async (reason: string) => {
    if (!user) return;
    await supabase.from('reports').insert({
      reporter_id: user.id,
      listing_id: id!,
      seller_id: listing.seller_id,
      reason,
    });
    Alert.alert('Report submitted', 'Thank you for helping keep Dukanoh safe.');
  };

  const handleReport = () => {
    Alert.alert('Report listing', 'Why are you reporting this?', [
      { text: 'Spam or misleading', onPress: () => submitReport('Spam or misleading') },
      { text: 'Counterfeit or fake', onPress: () => submitReport('Counterfeit or fake') },
      { text: 'Inappropriate content', onPress: () => submitReport('Inappropriate content') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleBlock = () => {
    Alert.alert(
      'Block seller',
      `Block @${listing.seller?.username}? You won't see their listings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await supabase.from('blocked_users').insert({
              blocker_id: user.id,
              blocked_id: listing.seller_id,
            });
            router.back();
          },
        },
      ]
    );
  };

  const handleMoreOptions = () => {
    Alert.alert('Options', undefined, [
      { text: 'Share', onPress: handleShare },
      { text: 'Report listing', onPress: handleReport },
      { text: 'Block seller', onPress: handleBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSellerOptions = () => {
    Alert.alert('Manage listing', undefined, [
      { text: 'Share', onPress: handleShare },
      { text: 'Delete draft', style: 'destructive', onPress: handleDeleteDraft },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleDuplicate = async () => {
    if (!user || !listing) return;
    const { data, error } = await supabase.from('listings').insert({
      seller_id: user.id,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      category: listing.category,
      condition: listing.condition,
      size: listing.size,
      occasion: listing.occasion,
      measurements: listing.measurements,
      images: listing.images,
      worn_at: listing.worn_at,
      status: 'draft',
    }).select('id').single();
    if (error || !data) { Alert.alert('Error', 'Could not duplicate listing.'); return; }
    router.push(`/listing/edit/${data.id}`);
  };

  const handleToggleSave = () => {
    if (!id) return;
    const wasSaved = isSaved(id);
    setSaveCount(c => wasSaved ? Math.max(0, c - 1) : c + 1);
    toggleSave(id, listing.price);
  };

  const handleOffer = async () => {
    const amount = parseFloat(offerAmount.replace(/[^0-9.]/g, ''));
    if (!amount || amount <= 0) { setOfferError('Please enter a valid amount.'); return; }
    if (amount >= listing.price) { setOfferError(`Offer must be less than £${listing.price.toFixed(2)}.`); return; }
    if (!user) return;
    setOfferError('');
    setOfferSending(true);
    const convId = await findOrCreateConversation();
    if (convId) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        listing_id: id!,
        sender_id: user.id,
        receiver_id: listing.seller_id,
        content: `__OFFER__:${amount.toFixed(2)}`,
        created_at: new Date().toISOString(),
      });
    }
    setOfferSending(false);
    setOfferVisible(false);
    setOfferAmount('');
    if (convId) {
      Alert.alert('Offer sent!', `Your offer of £${amount.toFixed(2)} has been sent to the seller.`, [
        { text: 'View conversation', onPress: () => router.push(`/conversation/${convId}`) },
        { text: 'Stay here', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Animated.View style={[styles.headerBg, { opacity: headerBgOpacity }]} />
        <Animated.View style={[styles.headerBorderLine, { opacity: headerBgOpacity }]} />
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Animated.View style={[styles.iconLayer, { opacity: btnBackdropOpacity }]}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Animated.View>
          <Animated.View style={[styles.iconLayer, { opacity: headerBgOpacity }]}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Animated.View>
        </TouchableOpacity>
        <Animated.View style={[styles.headerTitleWrap, { top: insets.top, opacity: titleOpacity }]} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
        </Animated.View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={
              isSeller && listing.status === 'draft'
                ? handleSellerOptions
                : isSeller
                ? handleShare
                : handleMoreOptions
            }
            activeOpacity={0.8}
          >
            <Animated.View style={[styles.iconLayer, { opacity: btnBackdropOpacity }]}>
              <Ionicons
                name={isSeller && listing.status !== 'draft' ? 'share-outline' : 'ellipsis-horizontal'}
                size={22}
                color="#FFFFFF"
              />
            </Animated.View>
            <Animated.View style={[styles.iconLayer, { opacity: headerBgOpacity }]}>
              <Ionicons
                name={isSeller && listing.status !== 'draft' ? 'share-outline' : 'ellipsis-horizontal'}
                size={22}
                color={colors.textPrimary}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: (user?.id !== listing.seller_id && listing.status === 'available') || (user?.id === listing.seller_id) ? 100 + insets.bottom : Spacing['3xl'] }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >

        {/* IMAGE CAROUSEL */}
        <View style={styles.imageContainer}>
          {listing.images?.length > 0 ? (
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            >
              {listing.images.map((uri, i) => (
                <TouchableOpacity key={i} activeOpacity={0.95} onPress={() => { setViewerIndex(i); setViewerVisible(true); }}>
                  <Image source={{ uri }} style={styles.image} contentFit="cover" transition={200} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.imagePlaceholder} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent']}
            style={styles.imageScrim}
          />
          <View style={styles.imageBottomBar}>
            {offerCount > 0 && user?.id !== listing.seller_id ? (
              <View style={styles.demandBanner}>
                <Ionicons name="flame" size={16} color={colors.amber} />
                <Text style={styles.demandText}>{offerCount} Offers!</Text>
              </View>
            ) : (
              <View style={styles.savePillPlaceholder} />
            )}
            {(listing.images?.length ?? 0) > 1 ? (
              <View style={styles.dotsRow}>
                {listing.images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
                ))}
              </View>
            ) : <View style={{ flex: 1 }} />}
            {user?.id !== listing.seller_id ? (
              <TouchableOpacity style={styles.savePill} onPress={handleToggleSave} activeOpacity={0.8}>
                <Text style={styles.savePillText}>{saveCount}</Text>
                <Ionicons name={isSaved(id ?? '') ? 'heart' : 'heart-outline'} size={16} color={isSaved(id ?? '') ? colors.like : '#FFFFFF'} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.savePill, listing.status === 'draft' ? styles.statusPillDraft : listing.status === 'sold' ? styles.statusPillSold : null]}>
                <Text style={styles.statusPillText}>
                  {listing.status === 'draft' ? 'Draft' : listing.status === 'sold' ? 'Sold' : 'Live'}
                </Text>
              </View>
            )}
          </View>
        </View>


        {/* CONTENT */}
        <View style={styles.content}>

          {/* Sold banner */}
          {listing.status === 'sold' && user?.id !== listing.seller_id && (
            <View style={styles.soldBanner}>
              <Ionicons name="checkmark-circle" size={14} color={colors.textSecondary} />
              <Text style={styles.soldBannerText}>This item has been sold</Text>
            </View>
          )}

          {/* Seller analytics strip */}
          {user?.id === listing.seller_id && (
            <View style={styles.analyticsStrip}>
              <View style={styles.analyticsCell}>
                <Text style={[styles.analyticsValue, { color: colors.primary }]}>{listing.view_count ?? 0}</Text>
                <Text style={styles.analyticsLabel}>Views</Text>
              </View>
              <View style={styles.analyticsCell}>
                <Text style={[styles.analyticsValue, { color: colors.primary }]}>{saveCount}</Text>
                <Text style={styles.analyticsLabel}>Saves</Text>
              </View>
              <TouchableOpacity style={styles.analyticsCell} onPress={() => router.push('/(tabs)/inbox')} activeOpacity={0.7}>
                <Text style={[styles.analyticsValue, { color: colors.primary }]}>{offerCount}</Text>
                <View style={styles.analyticsLabelRow}>
                  <Text style={styles.analyticsLabel}>Offers</Text>
                  <Ionicons name="chevron-forward" size={10} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
              {listing.status !== 'draft' && listing.created_at && (
                <View style={styles.analyticsCell}>
                  <Text style={[styles.analyticsValue, { color: colors.primary }]}>
                    {Math.floor((Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24))}
                  </Text>
                  <Text style={styles.analyticsLabel}>Days listed</Text>
                </View>
              )}
            </View>
          )}

          {/* Boost button — seller, available listings only */}
          {user?.id === listing.seller_id && listing.status === 'available' && (
            boostExpiry ? (
              <View style={styles.boostedCard}>
                <View style={styles.boostedCardTop}>
                  <Ionicons name="rocket" size={18} color="#0D0D0D" />
                  <Text style={styles.boostedCardTitle}>Listing boosted</Text>
                </View>
                <Text style={styles.boostedCardSub}>
                  {Math.ceil((boostExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days remaining · Showing at the top of the feed
                </Text>
              </View>
            ) : (
              <Button label="Boost listing" variant="secondary" onPress={() => setBoostVisible(true)} style={{ alignSelf: 'stretch' }} />
            )
          )}

          {/* Title + Subtitle + Price */}
          <View style={styles.titleGroup}>
            <View style={styles.titleBlock}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{listing.title}</Text>
              </View>
              <Text style={styles.subtitle} numberOfLines={2}>
                {[
                  listing.condition,
                  listing.size,
                  listing.category,
                  listing.occasion,
                  listing.colour,
                  listing.fabric,
                  (listing.view_count ?? 0) > 0 ? `${listing.view_count} views` : null,
                  listing.created_at ? timeAgo(listing.created_at) : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={styles.price}>£{listing.price?.toFixed(2)}</Text>
          </View>
          <View style={styles.hairline} />
          {listing.worn_at ? (
            <View style={styles.wornAtCard}>
              <Text style={styles.wornAtLabel}>The story</Text>
              <Text style={styles.wornAtText}>{listing.worn_at}</Text>
            </View>
          ) : null}


          {/* Seller status indicators */}
          {user?.id === listing.seller_id && (
            listing.status === 'draft' ? (
              <TouchableOpacity onPress={handleDeleteDraft} activeOpacity={0.7}>
                <Text style={styles.dangerLink}>Delete draft</Text>
              </TouchableOpacity>
            ) : listing.status === 'sold' ? (
              <View style={styles.soldForRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.textSecondary} />
                <Text style={styles.soldForText}>Sold for £{listing.price.toFixed(2)}</Text>
              </View>
            ) : null
          )}

          <View style={styles.hairline} />

          {/* Description */}
          <View style={styles.descriptionBlock}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.description}>{listing.description ?? '—'}</Text>
          </View>

          {/* Measurements */}
          {listing.measurements && Object.values(listing.measurements).some(v => v != null) && (
            <>
              <View style={styles.hairline} />
              <View style={styles.descriptionBlock}>
                <Text style={styles.sectionLabel}>Measurements</Text>
                <View style={styles.measureBody}>
                  {listing.measurements.chest ? (
                    <View style={styles.measureLine}>
                      <Text style={styles.measureKey}>Chest</Text>
                      <Text style={styles.measureVal}>{listing.measurements.chest}"</Text>
                    </View>
                  ) : null}
                  {listing.measurements.waist ? (
                    <View style={styles.measureLine}>
                      <Text style={styles.measureKey}>Waist</Text>
                      <Text style={styles.measureVal}>{listing.measurements.waist}"</Text>
                    </View>
                  ) : null}
                  {listing.measurements.length ? (
                    <View style={styles.measureLine}>
                      <Text style={styles.measureKey}>Length</Text>
                      <Text style={styles.measureVal}>{listing.measurements.length}"</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </>
          )}

          <View style={styles.hairline} />

          {/* Seller row */}
          <TouchableOpacity style={styles.sellerRow} activeOpacity={0.8} onPress={() => router.push(`/user/${listing.seller_id}`)}>
            <Avatar uri={listing.seller?.avatar_url} initials={listing.seller?.username?.[0]?.toUpperCase()} size="small" />
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>@{listing.seller?.username}</Text>
                <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                {(listing.seller?.rating_count ?? 0) > 0 && (
                  <View style={styles.sellerRating}>
                    <StarRating rating={listing.seller?.rating_avg ?? 0} size={11} />
                    <Text style={styles.sellerSub}>({listing.seller?.rating_count})</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sellerSub}>
                {[
                  soldCount != null && soldCount > 0 ? `${soldCount} sold` : null,
                  listing.seller?.created_at ? `Joined ${new Date(listing.seller.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : null,
                  responseRate != null ? `${responseRate}% response rate` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          {user?.id !== listing.seller_id && <HowItWorks />}

          <View style={styles.hairline} />

          {/* Similar listings — buyers only */}
          {user?.id !== listing.seller_id && similarListings.length > 0 && (
            <View>
              <SectionHeader title="Similar listings" />
              <ListingGrid listings={similarListings} />
            </View>
          )}

          {/* More from seller — buyers only */}
          {user?.id !== listing.seller_id && sellerListings.length > 0 && (
            <View>
              <SectionHeader
                title={`More from @${listing.seller?.username}`}
                onSeeAll={() => router.push(`/user/${listing.seller_id}`)}
              />
              <ListingGrid listings={sellerListings} />
            </View>
          )}



        </View>
      </Animated.ScrollView>

      {/* STICKY BOTTOM CTA — buyers only */}
      {user?.id !== listing.seller_id && listing.status === 'available' && (
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Button label="Message" variant="outline" onPress={handleMessage} style={styles.ctaBtn} />
          <Button label="Make an offer" onPress={() => setOfferVisible(true)} style={styles.ctaBtn} />
        </View>
      )}
      {user?.id !== listing.seller_id && listing.status === 'sold' && (
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Button label="Ask seller a question" variant="outline" onPress={handleMessage} style={{ flex: 1 }} />
        </View>
      )}

      {/* STICKY BOTTOM CTA — seller */}
      {user?.id === listing.seller_id && listing.status !== 'sold' && (
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Button label="Edit" variant="outline" onPress={() => router.push(`/listing/edit/${id}`)} style={styles.ctaBtn} />
          {listing.status === 'draft' ? (
            <Button label="Publish" onPress={handlePublish} style={styles.ctaBtn} />
          ) : (
            <Button label="Mark as sold" onPress={handleMarkSold} style={styles.ctaBtn} />
          )}
        </View>
      )}
      {user?.id === listing.seller_id && listing.status === 'sold' && (
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Button label="Duplicate listing" onPress={handleDuplicate} style={styles.ctaBtn} />
        </View>
      )}

      <ImageViewerModal
        images={listing.images ?? []}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />


      {/* BOOST MODAL */}

      <BottomSheet
        visible={offerVisible}
        onClose={() => { setOfferVisible(false); setOfferAmount(''); setOfferError(''); setOfferPreset('custom'); }}
      >
        <Text style={styles.modalTitle}>Make an offer</Text>

        {/* Item card */}
        <View style={[styles.offerItemCard, { backgroundColor: colors.surface }]}>
          {listing.images?.[0] ? (
            <Image source={{ uri: listing.images[0] }} style={styles.offerThumb} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.offerThumb, { backgroundColor: colors.border }]} />
          )}
          <View style={styles.offerItemInfo}>
            <Text style={styles.offerItemTitle} numberOfLines={1}>{listing.title}</Text>
            <Text style={styles.offerItemPrice}>Asking: £{listing.price.toFixed(2)}</Text>
          </View>
        </View>

        {/* Presets */}
        <View style={styles.offerPresets}>
          {([['10', '10% off'], ['20', '20% off']] as const).map(([pct, label]) => {
            const amount = (listing.price * (1 - Number(pct) / 100)).toFixed(2);
            const active = offerPreset === pct;
            return (
              <TouchableOpacity
                key={pct}
                style={[styles.offerPreset, active && styles.offerPresetActive]}
                onPress={() => { setOfferPreset(pct); setOfferAmount(amount); setOfferError(''); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.offerPresetPrice, active && { color: colors.primary }]}>£{amount}</Text>
                <Text style={[styles.offerPresetLabel, active && { color: colors.primary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.offerPreset, offerPreset === 'custom' && styles.offerPresetActive]}
            onPress={() => { setOfferPreset('custom'); setOfferAmount(''); setOfferError(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.offerPresetPrice, offerPreset === 'custom' && { color: colors.primary }]}>Custom</Text>
            <Text style={[styles.offerPresetLabel, offerPreset === 'custom' && { color: colors.primary }]}>Set a price</Text>
          </TouchableOpacity>
        </View>

        {/* Amount input */}
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>£</Text>
          <TextInput
            ref={offerInputRef}
            style={styles.amountInput}
            value={offerAmount}
            onChangeText={(v) => { setOfferAmount(v); setOfferPreset('custom'); setOfferError(''); }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
        {offerError ? <Text style={styles.modalError}>{offerError}</Text> : null}

        <Button
          label="Send offer"
          onPress={handleOffer}
          disabled={!offerAmount || offerSending}
          loading={offerSending}
          style={{ alignSelf: 'stretch', marginTop: Spacing.xl }}
        />
        <TouchableOpacity
          onPress={() => { setOfferVisible(false); setOfferAmount(''); setOfferError(''); setOfferPreset('custom'); }}
          activeOpacity={0.7}
          style={{ paddingTop: Spacing.base, alignSelf: 'center' }}
        >
          <Text style={[Typography.body, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* BOOST SHEET */}
      <BottomSheet visible={boostVisible} onClose={handleCloseBoost}>
        <Text style={styles.boostTitle}>Boost listing</Text>
        <Text style={styles.boostSubtitle}>
          Push your listing to the top of the feed and get more eyes on your item.
        </Text>
        <View style={styles.hairline} />
        <View style={styles.boostDetailRow}>
          <Text style={styles.boostDetailKey}>Duration</Text>
          <Text style={styles.boostDetailVal}>7 days</Text>
        </View>
        <View style={styles.boostDetailRow}>
          <Text style={styles.boostDetailKey}>Price</Text>
          <View style={styles.boostPriceRow}>
            <Text style={[styles.boostDetailVal, { textDecorationLine: 'line-through', color: colors.textSecondary }]}>£0.99</Text>
            <View style={styles.betaBadge}>
              <Text style={styles.betaBadgeText}>Free during beta</Text>
            </View>
          </View>
        </View>
        <View style={[styles.boostStatCard, { marginTop: Spacing.base }]}>
          <Text style={styles.boostStatLabel}>🚀  Sellers who boost see 3x more views{'\n'}on average</Text>
        </View>
        <View style={{ marginTop: Spacing.base, gap: Spacing.sm }}>
          <Button label="Boost now" variant="secondary" onPress={handleBoost} style={{ alignSelf: 'stretch' }} />
          <TouchableOpacity onPress={handleCloseBoost} activeOpacity={0.7} style={{ paddingTop: Spacing.base }}>
            <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1 },

    // Header
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: Spacing.sm,
    },
    headerBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background,
    },
    headerBorderLine: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    iconLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      position: 'absolute',
      left: 56,
      right: 56,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: Spacing.sm,
      height: 40 + Spacing.sm,
    },
    headerTitle: {
      ...Typography.body,
      fontWeight: '500',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    headerRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },

    // Image
    imageContainer: { width, height: IMAGE_HEIGHT, backgroundColor: colors.surface },
    image: { width, height: IMAGE_HEIGHT },
    imagePlaceholder: { width, height: IMAGE_HEIGHT, backgroundColor: colors.surface },
    imageScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 150,
    },
    savePill: {
      width: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      minHeight: 44,
    },
    savePillText: { ...Typography.body, color: '#FFFFFF', fontFamily: FontFamily.regular },
    imageBottomBar: {
      position: 'absolute',
      bottom: Spacing.base,
      left: Spacing.base,
      right: Spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
    },
    savePillPlaceholder: { width: 100 },
    statusPillDraft: { backgroundColor: 'rgba(247,159,0,0.85)' },
    statusPillSold: { backgroundColor: 'rgba(0,0,0,0.55)' },
    statusPillText: { ...Typography.body, color: '#FFFFFF', fontFamily: FontFamily.semibold },
    dotsRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      pointerEvents: 'none',
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    dotActive: {
      backgroundColor: '#FFFFFF',
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    imageCounter: {
      position: 'absolute',
      bottom: Spacing.sm,
      right: Spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    imageCounterText: { ...Typography.caption, color: '#FFFFFF', fontFamily: FontFamily.semibold },

    // Thumbnails

    // Content
    content: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.base,
      gap: Spacing.base,
    },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

    // Title block
    titleGroup: { gap: Spacing.md },
    titleBlock: { gap: 4 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    title: { ...Typography.heading, fontSize: 18, fontFamily: FontFamily.medium, fontWeight: '500' as const, color: colors.textPrimary, flex: 1 },
    subtitle: { ...Typography.body, fontSize: 14, fontFamily: FontFamily.medium, fontWeight: '500' as const, color: colors.textSecondary },
    price: { ...Typography.body, fontSize: 16, fontFamily: FontFamily.medium, fontWeight: '500' as const, color: colors.textPrimary },
    pillRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
    demandBanner: {
      width: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: BorderRadius.full,
      minHeight: 44,
    },
    demandText: { ...Typography.body, color: colors.amber, fontFamily: FontFamily.regular },
    draftBadge: { backgroundColor: colors.surface, borderColor: colors.border },

    // CTAs
    stickyFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    ctaRow: { flexDirection: 'row', gap: Spacing.sm },
    ctaBtn: { flex: 1 },
    ctaSection: { gap: Spacing.sm, alignItems: 'center' },
    dangerLink: { ...Typography.body, color: colors.error },
    soldForRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
    soldForText: { ...Typography.subheading, color: colors.textSecondary },

    // Seller analytics strip
    analyticsStrip: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      paddingVertical: Spacing.base,
    },
    analyticsCell: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    analyticsValue: {
      ...Typography.subheading,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    analyticsLabel: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    analyticsLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },

    boostedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      paddingVertical: Spacing.sm,
    },
    boostedPillText: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    boostedCard: {
      backgroundColor: '#C7F75E',
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.base,
      gap: Spacing.xs,
      alignItems: 'center',
    },
    boostedCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    boostedCardTitle: {
      fontSize: 15,
      fontFamily: FontFamily.bold,
      color: '#0D0D0D',
    },
    boostedCardSub: {
      ...Typography.caption,
      color: '#0D0D0D',
      textAlign: 'center',
    },
    boostModalCard: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.base,
    },
    boostHandle: {
      width: 36,
      height: 4,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Spacing.xl,
    },
    boostTitle: {
      ...Typography.heading,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.xs,
    },
    boostSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: Spacing.base,
    },
    boostStatCard: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
      alignItems: 'center',
    },
    boostStatLabel: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    boostDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.base,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    boostDetailKey: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    boostDetailVal: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    boostPriceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    betaBadge: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    betaBadgeText: {
      ...Typography.caption,
      color: colors.primary,
      fontFamily: FontFamily.semibold,
    },

    // Sold banner
    soldBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.small,
    },
    soldBannerText: { ...Typography.body, color: colors.textSecondary },

    // Collapsible sections
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.sm,
    },
    sectionLabel: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    descriptionBlock: { gap: Spacing.xs },
    description: { ...Typography.body, color: colors.textSecondary, lineHeight: 22 },

    // Worn at
    wornAtCard: {
      backgroundColor: colors.secondaryLight,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,

      gap: Spacing.xs,
    },
    wornAtLabel: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    wornAtText: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },

    // Measurements
    measureBody: { gap: Spacing.xs, paddingBottom: Spacing.sm },
    measureLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
    measureKey: { ...Typography.body, color: colors.textSecondary },
    measureVal: { ...Typography.body, color: colors.textPrimary, fontFamily: FontFamily.semibold },

    // Seller
    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, paddingVertical: Spacing.sm },
    sellerInfo: { flex: 1, gap: 2 },
    sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    sellerName: { ...Typography.body, color: colors.textPrimary, fontFamily: FontFamily.semibold },
    sellerRating: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    sellerSub: { ...Typography.caption, color: colors.textSecondary },

    // Review
    reviewBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
    reviewBtnText: { ...Typography.body, color: colors.primary, fontFamily: FontFamily.semibold },

    // More from seller

    // Footer meta
    footerMeta: { ...Typography.caption, color: colors.textSecondary, textAlign: 'center' },

    // Offer sheet
    modalTitle: { ...Typography.subheading, color: colors.textPrimary, marginBottom: Spacing.base, textAlign: 'center' },
    offerItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      marginBottom: Spacing.base,
    },
    offerItemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
      marginBottom: Spacing.base,
    },
    offerThumb: {
      width: 56,
      height: 56,
      borderRadius: BorderRadius.medium,
      overflow: 'hidden',
    },
    offerItemInfo: { flex: 1, gap: 3 },
    offerItemTitle: { ...Typography.body, color: colors.textPrimary, fontFamily: FontFamily.semibold },
    offerItemPrice: { ...Typography.caption, color: colors.textSecondary },
    offerPresets: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.base,
    },
    offerPreset: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.medium,
      paddingVertical: Spacing.sm,
      alignItems: 'center',
      gap: 2,
    },
    offerPresetActive: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    offerPresetPrice: { fontSize: 14, fontFamily: FontFamily.semibold, color: colors.textPrimary },
    offerPresetLabel: { ...Typography.caption, color: colors.textSecondary },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
      paddingBottom: Spacing.sm,
      gap: Spacing.xs,
      marginTop: Spacing.sm,
    },
    currencySymbol: { fontSize: 20, fontFamily: FontFamily.semibold, color: colors.textPrimary },
    amountInput: { fontSize: 20, fontFamily: FontFamily.semibold, color: colors.textPrimary, flex: 1, padding: 0 },
    modalError: { ...Typography.caption, color: colors.error },
  });
}
