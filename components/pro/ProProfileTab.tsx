import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  Dimensions,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';
import { BalanceCarousel, type BalanceData } from '@/components/pro/BalanceCarousel';
import { BulkEditSheet } from '@/components/pro/BulkEditSheet';
import { ManageCollectionsSheet } from '@/components/pro/ManageCollectionsSheet';
import { CollectionDetailSheet } from '@/components/pro/CollectionDetailSheet';
import { HubMetricTile } from '@/components/hub/HubMetricTile';
import { HubOccasionRow } from '@/components/hub/HubOccasionRow';
import { useProColors } from '@/hooks/useProColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getImageUrl } from '@/lib/imageUtils';
import { FontFamily, Spacing, BorderRadius, Typography } from '@/constants/theme';
import type { HubListing, HubCollection } from '@/components/hub/hubTheme';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ── Types ────────────────────────────────────────────────────

interface DashData {
  thisMonthEarned: number;
  lastMonthEarned: number;
  totalViews: number;
  totalSaves: number;
  profileViews30d: number;
  chartData: { value: number }[];
  collections: HubCollection[];
  occasionPerformance: { occasion: string; saves: number; views: number }[];
  availableListings: HubListing[];
  accountStatus: 'active' | 'warned' | 'suspended';
  strikeCount: number;
  pendingOrders: number;
}

interface QuickLink {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: number;
  onPress: () => void;
}

const STALE_MS = 30_000;

// ── Component ────────────────────────────────────────────────

export function ProProfileTab() {
  const P = useProColors();
  const insets = useSafeAreaInsets();
  const { user, username } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>();
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [dash, setDash] = useState<DashData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  // Sheet state
  const [manageColVisible, setManageColVisible] = useState(false);
  const [collectionDetailId, setCollectionDetailId] = useState<string | null>(null);
  const [createColVisible, setCreateColVisible] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [savingCol, setSavingCol] = useState(false);
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [assignSheetListing, setAssignSheetListing] = useState<HubListing | null>(null);
  const [bulkEditVisible, setBulkEditVisible] = useState(false);

  const lastFetchedRef = useRef<number>(0);

  // ── Data fetching ──────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('full_name, avatar_url, rating_avg, rating_count')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setProfileName(data.full_name === 'New User' ? '' : (data.full_name ?? ''));
      setProfileAvatar(data.avatar_url ?? undefined);
      setRatingAvg(data.rating_avg ?? 0);
      setRatingCount(data.rating_count ?? 0);
    }
    lastFetchedRef.current = Date.now();
  }, [user]);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    setBalanceLoading(true);
    const { data } = await supabase
      .from('seller_wallet')
      .select('available_balance, pending_balance, lifetime_earned')
      .eq('seller_id', user.id)
      .maybeSingle();
    setBalance(
      data
        ? {
            available: data.available_balance ?? 0,
            pending: data.pending_balance ?? 0,
            lifetime: data.lifetime_earned ?? 0,
          }
        : { available: 0, pending: 0, lifetime: 0 }
    );
    setBalanceLoading(false);
  }, [user]);

  const fetchDash = useCallback(async () => {
    if (!user) return;
    setDashLoading(true);
    try {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        userRes,
        txThis,
        txLast,
        tx30d,
        listingsRes,
        profileViewsRes,
        collectionsRes,
        ordersRes,
      ] = await Promise.all([
        supabase
          .from('users')
          .select('account_status, cancellation_strike_count')
          .eq('id', user.id)
          .maybeSingle(),
        supabase.from('transactions').select('amount').eq('seller_id', user.id).gte('created_at', thisMonthStart),
        supabase.from('transactions').select('amount').eq('seller_id', user.id).gte('created_at', lastMonthStart).lt('created_at', thisMonthStart),
        supabase.from('transactions').select('amount, created_at').eq('seller_id', user.id).gte('created_at', last30Days),
        supabase
          .from('listings')
          .select('id, title, price, images, status, view_count, save_count, occasion, collection_id')
          .eq('seller_id', user.id)
          .in('status', ['available', 'sold'])
          .order('created_at', { ascending: false })
          .range(0, 49),
        supabase
          .from('profile_views')
          .select('id', { count: 'exact', head: true })
          .eq('profile_user_id', user.id)
          .gte('viewed_at', last30Days),
        supabase
          .from('collections')
          .select('id, name')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id)
          .in('status', ['paid', 'shipped']),
      ]);

      const thisMonthEarned = (txThis.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
      const lastMonthEarned = (txLast.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);

      // 30-day chart buckets
      const buckets: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        buckets[d.toDateString()] = 0;
      }
      (tx30d.data ?? []).forEach(t => {
        const key = new Date(t.created_at).toDateString();
        if (key in buckets) buckets[key] += t.amount ?? 0;
      });
      const chartData = Object.values(buckets).map(v => ({ value: v }));

      const allListings = (listingsRes.data ?? []) as HubListing[];
      const totalViews = allListings.reduce((s, l) => s + (l.view_count ?? 0), 0);
      const totalSaves = allListings.reduce((s, l) => s + (l.save_count ?? 0), 0);

      // Collection listing counts
      const collectionIds = (collectionsRes.data ?? []).map(c => c.id);
      const collectionCounts: Record<string, number> = {};
      if (collectionIds.length > 0) {
        const { data: clData } = await supabase
          .from('listings')
          .select('collection_id')
          .eq('seller_id', user.id)
          .in('collection_id', collectionIds);
        (clData ?? []).forEach((r: { collection_id: string | null }) => {
          if (r.collection_id) {
            collectionCounts[r.collection_id] = (collectionCounts[r.collection_id] ?? 0) + 1;
          }
        });
      }
      const collections: HubCollection[] = (collectionsRes.data ?? []).map(c => ({
        id: c.id,
        name: c.name,
        listingCount: collectionCounts[c.id] ?? 0,
      }));

      // Occasion performance (top 5 by saves)
      const tagMap: Record<string, { saves: number; views: number }> = {};
      allListings.forEach(l => {
        if (!l.occasion) return;
        if (!tagMap[l.occasion]) tagMap[l.occasion] = { saves: 0, views: 0 };
        tagMap[l.occasion].saves += l.save_count ?? 0;
        tagMap[l.occasion].views += l.view_count ?? 0;
      });
      const occasionPerformance = Object.entries(tagMap)
        .map(([occasion, v]) => ({ occasion, ...v }))
        .sort((a, b) => b.saves - a.saves)
        .slice(0, 5);

      setDash({
        thisMonthEarned,
        lastMonthEarned,
        totalViews,
        totalSaves,
        profileViews30d: profileViewsRes.count ?? 0,
        chartData,
        collections,
        occasionPerformance,
        availableListings: allListings.filter(l => l.status === 'available'),
        accountStatus: userRes.data?.account_status ?? 'active',
        strikeCount: userRes.data?.cancellation_strike_count ?? 0,
        pendingOrders: ordersRes.count ?? 0,
      });
    } catch {
      // silent fail — dashboard shows empty state
    } finally {
      setDashLoading(false);
    }
  }, [user]);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchProfile(), fetchBalance(), fetchDash()]);
  }, [fetchProfile, fetchBalance, fetchDash]);

  useEffect(() => {
    if (Date.now() - lastFetchedRef.current > STALE_MS) {
      loadAll();
    }
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastFetchedRef.current = 0;
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Collection handlers ────────────────────────────────────

  const handleCreateCollection = useCallback(async () => {
    if (!user || !newColName.trim()) return;
    setSavingCol(true);
    const { data: newCol } = await supabase
      .from('collections')
      .insert({ seller_id: user.id, name: newColName.trim() })
      .select('id, name')
      .single();
    setNewColName('');
    setCreateColVisible(false);
    setSavingCol(false);
    if (newCol) {
      setDash(prev => prev
        ? { ...prev, collections: [{ id: newCol.id, name: newCol.name, listingCount: 0 }, ...prev.collections] }
        : prev
      );
    }
  }, [user, newColName]);

  const handleAssignCollection = useCallback(async (listingId: string, collectionId: string | null) => {
    await supabase.from('listings').update({ collection_id: collectionId }).eq('id', listingId);
    setAssignSheetListing(null);
    setDash(prev => {
      if (!prev) return prev;
      const oldCollectionId = prev.availableListings.find(l => l.id === listingId)?.collection_id ?? null;
      return {
        ...prev,
        availableListings: prev.availableListings.map(l =>
          l.id === listingId ? { ...l, collection_id: collectionId } : l
        ),
        collections: prev.collections.map(c => {
          if (c.id === collectionId) return { ...c, listingCount: c.listingCount + 1 };
          if (c.id === oldCollectionId) return { ...c, listingCount: Math.max(0, c.listingCount - 1) };
          return c;
        }),
      };
    });
  }, []);

  const handleRenameCollection = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from('collections').update({ name: trimmed }).eq('id', id);
    setRenamingColId(null);
    setDash(prev => prev
      ? { ...prev, collections: prev.collections.map(c => c.id === id ? { ...c, name: trimmed } : c) }
      : prev
    );
  }, []);

  const handleDeleteCollection = useCallback((id: string, name: string) => {
    Alert.alert(
      `Delete "${name}"?`,
      'Listings in this collection will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            await supabase.from('collections').delete().eq('id', id);
            setDash(prev => prev
              ? { ...prev, collections: prev.collections.filter(c => c.id !== id) }
              : prev
            );
          },
        },
      ]
    );
  }, []);

  // ── Derived values ─────────────────────────────────────────

  const initials = (profileName || username)[0]?.toUpperCase() ?? '?';
  const earningsDelta = dash ? dash.thisMonthEarned - dash.lastMonthEarned : 0;
  // Chart breaks out of card padding — full card width
  const chartWidth = SCREEN_WIDTH - Spacing.base * 2;

  const selectedCollection = useMemo(
    () => dash?.collections.find(c => c.id === collectionDetailId) ?? null,
    [dash?.collections, collectionDetailId]
  );
  const inCollection = useMemo(
    () => dash?.availableListings.filter(l => l.collection_id === collectionDetailId) ?? [],
    [dash?.availableListings, collectionDetailId]
  );
  const notInCollection = useMemo(
    () => dash?.availableListings.filter(l => l.collection_id !== collectionDetailId) ?? [],
    [dash?.availableListings, collectionDetailId]
  );

  const quickLinks: QuickLink[] = [
    { icon: 'bag-outline',     label: 'My listings', onPress: () => router.push('/my-listings') },
    { icon: 'flash-outline',   label: 'Boosts',      onPress: () => router.push('/boosts') },
    { icon: 'receipt-outline', label: 'Orders',      badge: dash?.pendingOrders || undefined, onPress: () => router.push('/orders') },
    { icon: 'heart-outline',   label: 'Saved',       onPress: () => router.push('/saved') },
  ];

  // ── Render ─────────────────────────────────────────────────

  return (
    <LinearGradient colors={[P.gradientTop, P.gradientBottom]} style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.primary} />}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing['3xl'] },
        ]}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={() => router.push('/edit-profile')} hitSlop={8} style={styles.avatarWrap}>
              {profileAvatar ? (
                <Image
                  source={{ uri: getImageUrl(profileAvatar, 'avatar') }}
                  style={styles.avatarCircle}
                />
              ) : (
                <View style={[styles.avatarCircle, { backgroundColor: P.proAccent, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={[styles.avatarInitials, { color: P.gradientBottom }]}>{initials}</Text>
                </View>
              )}
              <View style={[styles.proBadgeNotif, { backgroundColor: P.proAccent }]}>
                <Ionicons name="checkmark" size={9} color="#0D0D0D" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.headerCenter}>
            {profileName ? (
              <Text style={[styles.headerName, { color: P.textPrimary }]} numberOfLines={1}>
                {profileName}
              </Text>
            ) : null}
            <Text style={[styles.headerUsername, { color: P.textSecondary }]} numberOfLines={1}>
              @{username}
            </Text>
          </View>

          <View style={styles.headerSide}>
            {ratingCount > 0 && (
              <View style={[styles.ratingCircle, { backgroundColor: P.surface, borderColor: P.border }]}>
                <Text style={[styles.ratingText, { color: P.primary }]}>{ratingAvg.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Balance carousel ── */}
        <View style={styles.carouselWrap}>
          <BalanceCarousel
            data={balance}
            loading={balanceLoading}
            P={P}
            onWithdraw={() => {
              const available = balance?.available ?? 0;
              if (available <= 0) return;
              Alert.alert(
                `Withdraw £${available.toFixed(2)}`,
                'Funds will be sent to your connected bank account within 3–5 business days.',
                [
                  { text: 'Confirm', onPress: () => {} },
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
          />
        </View>

        {/* ── Quick links ── */}
        <View style={styles.quickLinks}>
          {quickLinks.map(link => (
            <TouchableOpacity
              key={link.label}
              style={styles.quickLink}
              onPress={link.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.quickLinkIconWrap}>
                <View style={[styles.quickLinkIcon, { backgroundColor: P.surfaceElevated, borderColor: P.cardBorder, borderWidth: 1 }]}>
                  <Ionicons name={link.icon} size={22} color={P.primary} />
                </View>
                {!!link.badge && link.badge > 0 && (
                  <View style={[styles.notifBadge, { backgroundColor: P.primary }]}>
                    <Text style={[styles.notifBadgeText, { color: P.gradientBottom }]}>
                      {link.badge > 99 ? '99+' : link.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.quickLinkLabel, { color: P.textPrimary }]}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Account status banners ── */}
        {dash?.accountStatus === 'suspended' && (
          <View style={[styles.banner, { backgroundColor: '#FF444420', borderColor: '#FF444440' }]}>
            <Ionicons name="ban-outline" size={16} color="#FF4444" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: '#FF4444' }]}>Account suspended</Text>
              <Text style={[styles.bannerBody, { color: P.textSecondary }]}>
                Your account has been suspended after {dash.strikeCount} cancelled orders. Contact support to appeal.
              </Text>
            </View>
          </View>
        )}
        {dash?.accountStatus === 'warned' && (
          <View style={[styles.banner, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B40' }]}>
            <Ionicons name="warning-outline" size={16} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: '#F59E0B' }]}>Account warning</Text>
              <Text style={[styles.bannerBody, { color: P.textSecondary }]}>
                You have {dash.strikeCount} cancellation strikes. Reaching 5 will suspend your account.
              </Text>
            </View>
          </View>
        )}

        {/* ── Dashboard ── */}
        {dashLoading ? (
          <ActivityIndicator color={P.primary} style={styles.dashLoader} />
        ) : dash ? (
          <>
            {/* Earnings card — consolidated */}
            <View style={styles.earningsCardShell}>
            <View style={[styles.earningsCard, { backgroundColor: P.surface, borderColor: P.cardBorder }]}>
              <View style={styles.earningsTop}>
                <Text style={[styles.earningsStatLabel, { color: P.textSecondary }]}>This month</Text>
                <Text style={[styles.earningsHero, { color: P.textPrimary }]}>
                  £{dash.thisMonthEarned.toFixed(2)}
                </Text>
              </View>

              {dash.chartData.some(d => d.value > 0) && (
                <View style={styles.earningsChartWrap}>
                  <LineChart
                    data={dash.chartData}
                    width={chartWidth}
                    height={64}
                    color={P.primary}
                    thickness={2}
                    hideDataPoints
                    curved
                    areaChart
                    startFillColor={P.primary}
                    endFillColor={P.primary}
                    startOpacity={0.25}
                    endOpacity={0}
                    hideAxesAndRules
                    hideYAxisText
                    xAxisLabelsHeight={0}
                    disableScroll
                    noOfSections={3}
                    yAxisLabelWidth={0}
                  />
                </View>
              )}

              <View style={styles.earningsSecondary}>
                <View style={styles.earningsStat}>
                  <Text style={[styles.earningsStatLabel, { color: P.textSecondary }]}>Last month</Text>
                  <Text style={[styles.earningsStatValue, { color: P.textPrimary }]}>
                    £{dash.lastMonthEarned.toFixed(2)}
                  </Text>
                </View>
                {earningsDelta !== 0 && (
                  <>
                    <View style={styles.earningsStat}>
                      <Text style={[styles.earningsStatLabel, { color: P.textSecondary }]}>vs last month</Text>
                      <Text style={[styles.earningsStatValue, { color: earningsDelta > 0 ? P.success : P.error }]}>
                        {earningsDelta > 0 ? '+' : ''}£{Math.abs(earningsDelta).toFixed(2)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
            </View>

            {/* Activity metrics — 3 individual cards */}
            <View style={styles.metricsRow}>
              <HubMetricTile label="Listing Views" value={dash.totalViews} P={P} />
              <HubMetricTile label="Saves" value={dash.totalSaves} P={P} />
              <HubMetricTile label="Profile Views" value={dash.profileViews30d} footnote="30d" P={P} />
            </View>

            {/* Collections + Edit prices — square pair */}
            <View style={styles.inventoryRow}>
              <TouchableOpacity
                style={[styles.squareCard, { backgroundColor: P.surface, borderColor: P.cardBorder }]}
                onPress={() => setManageColVisible(true)}
                activeOpacity={0.75}
              >
                <Text style={[styles.squareCardLabel, { color: P.textSecondary }]}>Edit collections</Text>
                <Text style={[styles.squareCardValue, { color: P.textPrimary }]}>
                  {dash.collections.length}
                </Text>
                <Text style={[styles.squareCardSubtitle, { color: P.textSecondary }]}>Active collections</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.squareCard, { backgroundColor: P.surface, borderColor: P.cardBorder }]}
                onPress={() => setBulkEditVisible(true)}
                activeOpacity={0.75}
              >
                <Text style={[styles.squareCardLabel, { color: P.textSecondary }]}>Edit prices</Text>
                <Text style={[styles.squareCardValue, { color: P.textPrimary }]}>
                  {dash.availableListings.length}
                </Text>
                <Text style={[styles.squareCardSubtitle, { color: P.textSecondary }]}>
                  active listing{dash.availableListings.length === 1 ? '' : 's'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Occasion performance — only if data */}
            {dash.occasionPerformance.length > 0 && (
              <View style={[styles.card, { backgroundColor: P.surface, borderColor: P.cardBorder }]}>
                <Text style={[styles.cardTitle, { color: P.textPrimary }]}>Occasion performance</Text>
                <View style={styles.occasionList}>
                  {dash.occasionPerformance.map(({ occasion, saves, views }) => (
                    <HubOccasionRow
                      key={occasion}
                      occasion={occasion}
                      saves={saves}
                      views={views}
                      topSaves={dash.occasionPerformance[0].saves}
                      P={P}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        ) : null}

        {/* ── Settings footer ── */}
        <Button
          label="Settings"
          variant="outline"
          size="md"
          onPress={() => router.push('/settings')}
          borderColor={P.border}
          textColor={P.textSecondary}
          style={styles.settingsFooter}
        />
      </ScrollView>

      {/* ── Collection Detail sheet ── */}
      <CollectionDetailSheet
        visible={collectionDetailId !== null}
        collection={selectedCollection}
        inCollection={inCollection}
        notInCollection={notInCollection}
        onClose={() => { setCollectionDetailId(null); setTimeout(() => setManageColVisible(true), 250); }}
        onAssign={handleAssignCollection}
        P={P}
      />

      {/* ── Manage Collections sheet ── */}
      <ManageCollectionsSheet
        visible={manageColVisible}
        collections={dash?.collections ?? []}
        renamingColId={renamingColId}
        renameText={renameText}
        onRenameTextChange={setRenameText}
        onStartRename={(id, name) => { setRenamingColId(id); setRenameText(name); }}
        onCancelRename={() => setRenamingColId(null)}
        onConfirmRename={handleRenameCollection}
        onDelete={handleDeleteCollection}
        onSelectCollection={id => { setManageColVisible(false); setTimeout(() => setCollectionDetailId(id), 250); }}
        onNewCollection={() => { setManageColVisible(false); setTimeout(() => setCreateColVisible(true), 250); }}
        onClose={() => { setManageColVisible(false); setRenamingColId(null); }}
        P={P}
      />

      {/* ── Create Collection sheet ── */}
      <BottomSheet
        visible={createColVisible}
        onClose={() => { setCreateColVisible(false); setNewColName(''); }}
        backgroundColor={P.gradientBottom}
        handleColor={P.secondary}
        useModal
      >
        <Text style={[styles.sheetTitle, { color: P.textPrimary }]}>New Collection</Text>
        <TextInput
          style={[styles.sheetInput, { backgroundColor: P.surfaceElevated, color: P.textPrimary, borderColor: P.border }]}
          placeholder="e.g. Partywear, Festive Edits…"
          placeholderTextColor={P.textSecondary}
          value={newColName}
          onChangeText={setNewColName}
          underlineColorAndroid="transparent"
          autoFocus
          maxLength={40}
        />
        <Button
          label={savingCol ? 'Creating…' : 'Create'}
          onPress={handleCreateCollection}
          disabled={!newColName.trim() || savingCol}
          size="lg"
          backgroundColor={P.primary}
          textColor={P.ctaBtnText}
        />
      </BottomSheet>

      {/* ── Assign to Collection sheet ── */}
      <BottomSheet
        visible={assignSheetListing !== null}
        onClose={() => setAssignSheetListing(null)}
        backgroundColor={P.gradientBottom}
        handleColor={P.secondary}
      >
        <Text style={[styles.sheetTitle, { color: P.textPrimary }]}>Add to Collection</Text>
        {!dash || dash.collections.length === 0 ? (
          <Text style={[styles.sheetEmptyText, { color: P.textSecondary }]}>
            No collections yet — create one first.
          </Text>
        ) : (
          <>
            {dash.collections.map(col => (
              <TouchableOpacity
                key={col.id}
                style={[styles.sheetOption, { borderBottomColor: P.border }]}
                onPress={() => assignSheetListing && handleAssignCollection(assignSheetListing.id, col.id)}
                activeOpacity={0.75}
              >
                <Ionicons name="folder-outline" size={18} color={P.primary} />
                <Text style={[styles.sheetOptionText, { color: P.textPrimary }]}>{col.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.sheetOption, { borderBottomColor: P.border }]}
              onPress={() => assignSheetListing && handleAssignCollection(assignSheetListing.id, null)}
              activeOpacity={0.75}
            >
              <Ionicons name="close-circle-outline" size={18} color={P.textSecondary} />
              <Text style={[styles.sheetOptionText, { color: P.textSecondary }]}>Remove from collection</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>

      {/* ── Bulk Edit Prices sheet ── */}
      {dash && (
        <BulkEditSheet
          visible={bulkEditVisible}
          listings={dash.availableListings}
          onClose={() => setBulkEditVisible(false)}
          onSaved={() => { setBulkEditVisible(false); fetchDash(); }}
          P={P}
        />
      )}
    </LinearGradient>
  );
}


// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSide: {
    width: 68,
  },
  avatarWrap: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarInitials: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
  },
  proBadgeNotif: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerName: {
    fontSize: 17,
    fontFamily: FontFamily.semibold,
    lineHeight: 22,
  },
  headerUsername: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
  },
  ratingCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  ratingText: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
  },

  // Balance carousel — edge-to-edge breakout
  carouselWrap: {
    marginHorizontal: -Spacing.base,
    paddingHorizontal: Spacing.base,
  },

  // Quick links
  quickLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  quickLink: {
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  quickLinkIconWrap: {
    position: 'relative',
  },
  quickLinkIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 10,
    fontFamily: FontFamily.semibold,
  },
  quickLinkLabel: {
    ...Typography.caption,
    fontFamily: FontFamily.medium,
  },

  // Account banners
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.md,
  },
  bannerTitle: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    marginBottom: 2,
  },
  bannerBody: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 17,
  },

  // Dashboard loader
  dashLoader: {
    marginVertical: Spacing.xl,
  },

  // Earnings card
  earningsCardShell: {
    borderRadius: BorderRadius.large,
    shadowColor: '#3735C5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 3,
  },
  earningsCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  earningsTop: {
    gap: 2,
  },
  earningsLabel: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  earningsHero: {
    fontSize: 26,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.5,
  },
  earningsChartWrap: {
    marginHorizontal: -Spacing.lg,
    alignItems: 'center',
  },
  earningsDivider: {
    height: StyleSheet.hairlineWidth,
  },
  earningsSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningsStat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  earningsStatLabel: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
  },
  earningsStatValue: {
    fontSize: 18,
    fontFamily: FontFamily.semibold,
    letterSpacing: -0.5,
  },
  earningsStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },

  // Metrics row
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  // Generic card
  card: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    shadowColor: '#3735C5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardActionText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
  },
  cardActionDivider: {
    width: 1,
    height: 12,
  },

  // Inventory row — Collections + Edit prices square cards
  inventoryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  squareCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: BorderRadius.large,
    shadowColor: '#3735C5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 3,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  squareCardLabel: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  squareCardValue: {
    fontSize: 32,
    fontFamily: FontFamily.bold,
    letterSpacing: -1,
    textAlign: 'center',
  },
  squareCardSubtitle: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  squareCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  squareCardAction: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
  },

  // Collections
  collectionsRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  collectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  collectionName: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
  },
  collectionCount: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },

  // Occasion
  occasionList: {
    gap: Spacing.md,
  },

  // Empty state (inside card)
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
  },

  // Sheets
  sheetTitle: {
    fontSize: 17,
    fontFamily: FontFamily.semibold,
    marginBottom: Spacing.md,
  },
  sheetInput: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.md,
  },
  sheetEmptyText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.md,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetOptionText: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
  },

  // Settings footer
  settingsFooter: {
    marginTop: Spacing.sm,
  },
});
