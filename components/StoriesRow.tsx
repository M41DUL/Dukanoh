import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  PanResponder,
  Modal,
  Dimensions,
  StyleSheet,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { getImageUrl } from '@/lib/imageUtils';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/context/ThemeContext';
import { useSaved } from '@/context/SavedContext';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { GradientCard } from './GradientCard';
import { StoryListing, AppStory } from '@/hooks/useStories';

const { width, height } = Dimensions.get('window');

type AnyStory = AppStory | StoryListing;

interface StoriesRowProps {
  stories: AnyStory[];
  onView: (listingId: string) => void;
}

const STORY_DURATION = 5000; // 5 seconds per story
const APP_STORY_ICON = require('@/assets/images/dukanoh-story-icon.png');

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// Tap zones with press-and-hold-to-pause. A quick press (<250ms) is
// treated as a tap and triggers prev/next; a longer press pauses the
// timer until release. Used by both story viewers so the gesture is
// consistent with Instagram / Snapchat behaviour.
const HOLD_THRESHOLD_MS = 250;

function TapNavZones({
  onPrev,
  onNext,
  onPause,
  onResume,
}: {
  onPrev: () => void;
  onNext: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const pressStart = useRef<number | null>(null);
  const wasHeld = useRef(false);

  const handlePressIn = () => {
    pressStart.current = Date.now();
    wasHeld.current = false;
    onPause();
  };

  const handlePressOut = (onTap: () => void) => {
    const start = pressStart.current;
    pressStart.current = null;
    if (start === null) return;
    const heldMs = Date.now() - start;
    if (heldMs < HOLD_THRESHOLD_MS && !wasHeld.current) {
      onTap();
    } else {
      onResume();
    }
  };

  // If the press lingers past the hold threshold, lock in the "held"
  // state so a delayed release still resumes (instead of navigating).
  const armHoldFlag = () => {
    setTimeout(() => {
      if (pressStart.current !== null) wasHeld.current = true;
    }, HOLD_THRESHOLD_MS);
  };

  return (
    <View style={viewerStyles.tapZones} pointerEvents="box-none">
      <Pressable
        style={viewerStyles.tapLeft}
        onPressIn={() => { handlePressIn(); armHoldFlag(); }}
        onPressOut={() => handlePressOut(onPrev)}
      />
      <Pressable
        style={viewerStyles.tapRight}
        onPressIn={() => { handlePressIn(); armHoldFlag(); }}
        onPressOut={() => handlePressOut(onNext)}
      />
    </View>
  );
}

function ListingStoryViewer({
  story,
  stories,
  activeIndex,
  progressWidth,
  onPrev,
  onNext,
  onClose,
  onPause,
  onResume,
}: {
  story: StoryListing;
  stories: AnyStory[];
  activeIndex: number;
  progressWidth: Animated.AnimatedInterpolation<string>;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { isSaved, toggleSave } = useSaved();
  const saved = isSaved(story.id);

  return (
    <>
      {story.images?.[0] ? (
        <Image
          source={{ uri: getImageUrl(story.images[0], 'detail') }}
          style={viewerStyles.fullImage}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[viewerStyles.fullImage, viewerStyles.fullImagePlaceholder]} />
      )}

      {/* Progress bar */}
      <View style={viewerStyles.progressBar}>
        {stories.map((_, i) => (
          <View key={i} style={viewerStyles.progressSegmentContainer}>
            <Animated.View
              style={[
                viewerStyles.progressSegment,
                i < activeIndex && viewerStyles.progressDone,
                i === activeIndex && { width: progressWidth },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Top bar: avatar + username + time + heart + close */}
      <View style={viewerStyles.topBar}>
        <Avatar
          uri={story.seller?.avatar_url ?? undefined}
          initials={story.seller?.username?.[0]?.toUpperCase()}
          size="small"
        />
        <Text style={viewerStyles.topUsername}>{story.seller?.username}</Text>
        {story.is_boosted && (
          <View style={viewerStyles.sponsoredPill}>
            <Text style={viewerStyles.sponsoredText}>Sponsored</Text>
          </View>
        )}
        <Text style={viewerStyles.topTime}>{timeAgo(story.published_at ?? undefined)}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => toggleSave(story.id, story.price)}
          hitSlop={12}
          activeOpacity={0.7}
          style={viewerStyles.topCloseBtn}
          accessibilityLabel={saved ? 'Remove from saved' : 'Save listing'}
          accessibilityRole="button"
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={26}
            color={saved ? '#FF4444' : '#fff'}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} hitSlop={16} style={viewerStyles.topCloseBtn} accessibilityLabel="Close story" accessibilityRole="button">
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <TapNavZones
        onPrev={onPrev}
        onNext={onNext}
        onPause={onPause}
        onResume={onResume}
      />

      {/* Soft gradient + bottom overlay (no card; text floats over the gradient) */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
        style={viewerStyles.scrimBottom}
      />
      <View style={viewerStyles.listingOverlay}>
        <Text style={viewerStyles.listingHeadline} numberOfLines={2}>{story.title}</Text>
        <Text style={viewerStyles.listingHeadline}>£{story.price?.toFixed(2)}</Text>
        <Button
          label="View Listing"
          size="md"
          onPress={() => {
            onClose();
            router.push(`/listing/${story.id}`);
          }}
          style={viewerStyles.listingCtaBtn}
        />
      </View>
    </>
  );
}

export function StoriesRow({ stories, onView }: StoriesRowProps) {
  // Two visual groups: admin "app" stories collapse into a single Dukanoh
  // bubble in the row; tapping it opens a viewer that cycles through ONLY
  // the app stories. Listing stories keep their existing per-bubble UX.
  // The viewer's progress bar / nav stays within the active group.
  const [viewerGroup, setViewerGroup] = useState<'app' | 'listing' | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const rowStyles = useMemo(() => getRowStyles(colors), [colors]);
  const progress = useRef(new Animated.Value(0)).current;
  const timerAnim = useRef<Animated.CompositeAnimation | null>(null);

  const appStories = useMemo(
    () => stories.filter((s): s is AppStory => s.type === 'app'),
    [stories],
  );
  const listingStories = useMemo(
    () => stories.filter((s): s is StoryListing => s.type !== 'app'),
    [stories],
  );

  const groupStories: AnyStory[] = viewerGroup === 'app' ? appStories : listingStories;
  const activeStory: AnyStory | null = viewerGroup ? groupStories[activeIndex] ?? null : null;

  // Track the current animated progress value via a listener so we can
  // resume from where we paused without reaching for __getValue().
  const progressValue = useRef(0);
  useEffect(() => {
    const id = progress.addListener(({ value }) => { progressValue.current = value; });
    return () => progress.removeListener(id);
  }, [progress]);

  const stopTimer = () => {
    if (timerAnim.current) {
      timerAnim.current.stop();
      timerAnim.current = null;
    }
  };

  const startTimer = () => {
    progress.setValue(0);
    timerAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    timerAnim.current.start(({ finished }) => {
      if (finished) goNext();
    });
  };

  // Pause: stop the animation but leave progressValue at its current point.
  // Resume: continue to 1 over the remaining time.
  const pauseTimer = () => {
    stopTimer();
  };

  const resumeTimer = () => {
    if (viewerGroup === null) return;
    const remaining = (1 - progressValue.current) * STORY_DURATION;
    if (remaining <= 0) { goNext(); return; }
    timerAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    timerAnim.current.start(({ finished }) => {
      if (finished) goNext();
    });
  };

  // biome-ignore lint: activeIndex / viewerGroup drive the timer
  useEffect(() => {
    if (viewerGroup !== null) {
      startTimer();
    } else {
      stopTimer();
      progress.setValue(0);
    }
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerGroup, activeIndex]);

  const openStory = (group: 'app' | 'listing', index: number) => {
    setViewerGroup(group);
    setActiveIndex(index);
    if (group === 'listing') {
      const story = listingStories[index];
      if (story) onView(story.id);
    }
  };

  const goNext = () => {
    if (viewerGroup === null) return;
    if (activeIndex < groupStories.length - 1) {
      const next = activeIndex + 1;
      setActiveIndex(next);
      if (viewerGroup === 'listing') onView(listingStories[next].id);
    } else {
      close();
    }
  };

  const goPrev = () => {
    if (viewerGroup === null || activeIndex === 0) return;
    setActiveIndex(activeIndex - 1);
  };

  const close = () => {
    setViewerGroup(null);
    setActiveIndex(0);
  };

  // Swipe-down to dismiss. Only claim the gesture for clear downward
  // movement (≥10px and more vertical than horizontal) so taps and
  // press-holds aren't disturbed.
  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => stopTimer(),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 100 || g.vy > 0.5) {
            close();
          } else {
            resumeTimer();
          }
        },
        onPanResponderTerminate: () => resumeTimer(),
      }),
    // close, stopTimer, resumeTimer are stable in this scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (appStories.length === 0 && listingStories.length === 0) return null;

  // When there are no user-generated listing stories, fall back to the
  // gradient card — using the latest app story that has actual copy.
  // For image-only app stories there's nothing to show on the card, so we
  // keep falling back to the bubble row in that case.
  const fallbackCardStory = listingStories.length === 0
    ? appStories.find(s => s.headline || s.body)
    : null;

  // Build a single flat data array for the row: one Dukanoh entry standing
  // in for the whole app-story group, then each listing as its own bubble.
  type RowEntry =
    | { kind: 'app' }
    | { kind: 'listing'; index: number; listing: StoryListing };
  const rowEntries: RowEntry[] = [
    ...(appStories.length > 0 ? [{ kind: 'app' as const }] : []),
    ...listingStories.map((l, index) => ({ kind: 'listing' as const, index, listing: l })),
  ];

  return (
    <>
      {fallbackCardStory ? (
        <View style={rowStyles.cardOuter}>
          <GradientCard
            colors={isDark ? ['rgba(199,247,94,0.12)', colors.surface] : ['#E8FBC5', colors.surface]}
            title={fallbackCardStory.headline ?? 'Dukanoh'}
            subtitle={fallbackCardStory.body ?? ''}
            titleColor={colors.textPrimary}
            subtitleColor={colors.textSecondary}
            onPress={() => openStory('app', appStories.indexOf(fallbackCardStory))}
            left={
              <View style={rowStyles.cardRing}>
                <View style={rowStyles.cardRingInner}>
                  <Image
                    source={APP_STORY_ICON}
                    style={rowStyles.cardIconImage}
                    contentFit="cover"
                  />
                </View>
              </View>
            }
            right={<Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
          />
        </View>
      ) : (
      <FlatList
        horizontal
        data={rowEntries}
        keyExtractor={(entry, i) => entry.kind === 'app' ? 'app-bubble' : `listing-${entry.listing.id}-${i}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rowStyles.row}
        renderItem={({ item }) => {
          if (item.kind === 'app') {
            return (
              <TouchableOpacity
                style={rowStyles.bubble}
                onPress={() => openStory('app', 0)}
                activeOpacity={0.9}
              >
                <View style={[rowStyles.ring, rowStyles.ringApp]}>
                  <View style={rowStyles.ringInner}>
                    <Image
                      source={APP_STORY_ICON}
                      style={viewerStyles.bubbleImage}
                      contentFit="cover"
                    />
                  </View>
                </View>
                <Text style={rowStyles.bubbleLabel} numberOfLines={1}>Dukanoh</Text>
              </TouchableOpacity>
            );
          }
          const { listing, index } = item;
          return (
            <TouchableOpacity
              style={rowStyles.bubble}
              onPress={() => openStory('listing', index)}
              activeOpacity={0.9}
            >
              <View style={[rowStyles.ring, listing.is_boosted && rowStyles.ringBoosted, !listing.is_boosted && listing.viewed && rowStyles.ringViewed]}>
                <View style={rowStyles.ringInner}>
                  {listing.images?.[0] ? (
                    <Image
                      source={{ uri: getImageUrl(listing.images[0], 'thumbnail') }}
                      style={viewerStyles.bubbleImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[viewerStyles.bubbleImage, rowStyles.bubblePlaceholder]} />
                  )}
                </View>
              </View>
              <Text style={rowStyles.bubbleLabel} numberOfLines={1}>{listing.category}</Text>
            </TouchableOpacity>
          );
        }}
      />
      )}

      <Modal
        visible={viewerGroup !== null}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}
      >
        {activeStory && (
          <View style={viewerStyles.viewer} {...swipeResponder.panHandlers}>
            <StatusBar hidden />

            {activeStory.type === 'app' ? (
              // App story viewer — full-bleed image with optional overlay.
              // Render order matters: image first (bottom), then tap zones
              // on top of it, then scrim + overlay on top of those. If the
              // image is rendered after tap zones it intercepts touches.
              <>
                {activeStory.imageUrl ? (
                  <Image
                    source={{ uri: activeStory.imageUrl }}
                    style={viewerStyles.fullImage}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Image
                    source={require('@/assets/images/hero-banner-1.png')}
                    style={viewerStyles.fullImage}
                    contentFit="cover"
                  />
                )}

                <View style={viewerStyles.progressBar}>
                  {groupStories.map((_, i) => (
                    <View key={i} style={viewerStyles.progressSegmentContainer}>
                      <Animated.View
                        style={[
                          viewerStyles.progressSegment,
                          i < activeIndex && viewerStyles.progressDone,
                          i === activeIndex && { width: progressWidth },
                        ]}
                      />
                    </View>
                  ))}
                </View>

                <TouchableOpacity style={viewerStyles.closeButton} onPress={close} hitSlop={16} accessibilityLabel="Close story" accessibilityRole="button">
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>

                <TapNavZones
                  onPrev={goPrev}
                  onNext={goNext}
                  onPause={pauseTimer}
                  onResume={resumeTimer}
                />

                {(() => {
                  // For image-only stories we hide all the chrome — no
                  // bottom scrim, no overlay — so the image is the entire story.
                  const hasContent = !!(
                    activeStory.headline ||
                    activeStory.body ||
                    (activeStory.ctaLabel && activeStory.ctaRoute)
                  );
                  if (!hasContent) return null;
                  return (
                    <>
                      <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
                        style={viewerStyles.scrimBottom}
                      />
                      <View style={viewerStyles.appOverlay}>
                        {activeStory.headline ? (
                          <Text style={viewerStyles.appHeadline}>{activeStory.headline}</Text>
                        ) : null}
                        {activeStory.body ? (
                          <Text style={viewerStyles.appBody}>{activeStory.body}</Text>
                        ) : null}
                        {activeStory.ctaLabel && activeStory.ctaRoute ? (
                          <Button
                            label={activeStory.ctaLabel}
                            size="md"
                            onPress={() => {
                              close();
                              router.push(activeStory.ctaRoute as Href);
                            }}
                            style={viewerStyles.appCtaBtn}
                          />
                        ) : null}
                      </View>
                    </>
                  );
                })()}
              </>
            ) : (
              // Regular listing story viewer — Instagram style
              <ListingStoryViewer
                story={activeStory as StoryListing}
                stories={groupStories}
                activeIndex={activeIndex}
                progressWidth={progressWidth}
                onPrev={goPrev}
                onNext={goNext}
                onClose={close}
                onPause={pauseTimer}
                onResume={resumeTimer}
              />
            )}
          </View>
        )}
      </Modal>
    </>
  );
}

// Row bubbles — themed
function getRowStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      paddingLeft: Spacing.base,
      paddingRight: Spacing.base,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.base,
      gap: Spacing.md,
    },
    bubble: {
      alignItems: 'center',
      gap: Spacing.xs,
      width: 64,
    },
    ring: {
      width: 64,
      height: 64,
      borderRadius: 32,
      padding: 2.5,
      backgroundColor: colors.secondary,
    },
    ringViewed: {
      backgroundColor: colors.border,
    },
    ringBoosted: {
      backgroundColor: '#C7A84F',
    },
    ringApp: {
      backgroundColor: colors.secondary,
    },
    ringInner: {
      flex: 1,
      borderRadius: 29,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.background,
    },
    bubblePlaceholder: {
      backgroundColor: colors.surface,
    },
    bubbleLabel: {
      ...Typography.caption,
      color: colors.textPrimary,
      textAlign: 'center',
      width: 64,
    },
    // Fallback gradient card — used when there are no listing stories
    // and at least one app story has copy worth showing.
    cardOuter: {
      marginTop: Spacing.sm,
      marginBottom: Spacing.base,
      paddingHorizontal: Spacing.base,
    },
    cardRing: {
      width: 46,
      height: 46,
      borderRadius: 23,
      padding: 2.5,
      backgroundColor: 'rgba(0,0,0,0.15)',
    },
    cardRingInner: {
      flex: 1,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.secondary,
    },
    cardIconImage: {
      width: '100%',
      height: '100%',
    },
  });
}

// Viewer — always dark, static
const viewerStyles = StyleSheet.create({
  bubbleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullImage: {
    width,
    height,
    position: 'absolute',
  },
  fullImagePlaceholder: {
    backgroundColor: '#1C1C1C',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  // Top bar (Instagram-style: avatar + username + time + close)
  topBar: {
    position: 'absolute',
    top: 62,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    zIndex: 20,
  },
  topUsername: {
    ...Typography.label,
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
  },
  sponsoredPill: {
    backgroundColor: '#C7A84F',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  sponsoredText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#0A0A1A',
    letterSpacing: 0.3,
  },
  topTime: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.6)',
  },
  topCloseBtn: {
    padding: Spacing.xs,
  },
  // Listing story overlay — title + price + CTA float over the gradient
  // scrim. Title and price share the same style intentionally (no
  // visual hierarchy between them).
  listingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'] + (Platform.OS === 'android' ? 32 : 0),
    gap: Spacing.xs,
  },
  listingHeadline: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FontFamily.semibold,
    color: '#fff',
  },
  listingCtaBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
    minWidth: 180,
  },
  progressBar: {
    position: 'absolute',
    top: 52,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    gap: 4,
    zIndex: 20,
  },
  progressSegmentContainer: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
    width: '0%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  progressDone: { width: '100%' },
  closeButton: {
    position: 'absolute',
    top: 52,
    right: Spacing.base,
    zIndex: 20,
    padding: Spacing.xs,
  },
  tapZones: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    bottom: 80,
    flexDirection: 'row',
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },
  // ListingStoryViewer overlay (used by listing stories — left-aligned card)
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.xl,
    paddingBottom: Spacing['3xl'] + (Platform.OS === 'android' ? 32 : 0),
    gap: Spacing.sm,
  },
  storyTitle: {
    ...Typography.subheading,
    color: '#fff',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  viewBtn: { flex: 1 },
  // App story (admin broadcast) overlay — centered, modern.
  appOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'] + (Platform.OS === 'android' ? 32 : 0),
    alignItems: 'center',
    gap: Spacing.md,
  },
  appHeadline: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: FontFamily.bold,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  appBody: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  appCtaBtn: {
    marginTop: Spacing.xs,
    minWidth: 180,
  },
});
