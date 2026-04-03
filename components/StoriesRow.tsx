import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Dimensions,
  StyleSheet,
  StatusBar,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSaved } from '@/context/SavedContext';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { GradientCard } from './GradientCard';
import { DukanohLogo } from './DukanohLogo';
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

function ListingStoryViewer({
  story,
  stories,
  activeIndex,
  progressWidth,
  onPrev,
  onNext,
  onClose,
}: {
  story: StoryListing;
  stories: AnyStory[];
  activeIndex: number;
  progressWidth: Animated.AnimatedInterpolation<string>;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { isSaved, toggleSave } = useSaved();
  const saved = isSaved(story.id);

  return (
    <>
      {story.images?.[0] ? (
        <Image
          source={{ uri: story.images[0] }}
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

      {/* Top bar: avatar + username + time + close */}
      <View style={viewerStyles.topBar}>
        <Avatar
          uri={story.seller.avatar_url}
          initials={story.seller.username[0]?.toUpperCase()}
          size="small"
        />
        <Text style={viewerStyles.topUsername}>{story.seller.username}</Text>
        {story.is_boosted && (
          <View style={viewerStyles.sponsoredPill}>
            <Text style={viewerStyles.sponsoredText}>Sponsored</Text>
          </View>
        )}
        <Text style={viewerStyles.topTime}>{timeAgo(story.created_at)}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onClose} hitSlop={16} style={viewerStyles.topCloseBtn}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tap zones */}
      <View style={viewerStyles.tapZones} pointerEvents="box-none">
        <TouchableOpacity style={viewerStyles.tapLeft} onPress={onPrev} activeOpacity={1} />
        <TouchableOpacity style={viewerStyles.tapRight} onPress={onNext} activeOpacity={1} />
      </View>

      {/* Bottom: info card + CTA + heart */}
      <View style={viewerStyles.bottomBar}>
        <View style={viewerStyles.infoCard}>
          <Text style={viewerStyles.listingTitle} numberOfLines={2}>{story.title}</Text>
          <Text style={viewerStyles.listingPrice}>£{story.price?.toFixed(2)}</Text>
        </View>
        <View style={viewerStyles.ctaRow}>
          <Button
            label="View Listing"
            size="md"
            onPress={() => {
              onClose();
              router.push(`/listing/${story.id}`);
            }}
            style={viewerStyles.viewBtn}
          />
          <TouchableOpacity
            onPress={() => toggleSave(story.id, story.price)}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={28}
              color={saved ? '#FF4444' : '#fff'}
            />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

export function StoriesRow({ stories, onView }: StoriesRowProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const colors = useThemeColors();
  const rowStyles = useMemo(() => getRowStyles(colors), [colors]);
  const progress = useRef(new Animated.Value(0)).current;
  const timerAnim = useRef<Animated.CompositeAnimation | null>(null);

  if (stories.length === 0) return null;

  const activeStory = activeIndex !== null ? stories[activeIndex] : null;
  const isSingleAppStory = stories.length === 1 && stories[0].type === 'app';

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

  // biome-ignore lint: activeIndex drives the timer
  useEffect(() => {
    if (activeIndex !== null) {
      startTimer();
    } else {
      stopTimer();
      progress.setValue(0);
    }
    return () => stopTimer();
  }, [activeIndex]);

  const openStory = (index: number) => {
    setActiveIndex(index);
    const story = stories[index];
    if (story.type !== 'app') onView(story.id);
  };

  const goNext = () => {
    if (activeIndex === null) return;
    if (activeIndex < stories.length - 1) {
      const next = activeIndex + 1;
      setActiveIndex(next);
      const story = stories[next];
      if (story.type !== 'app') onView(story.id);
    } else {
      setActiveIndex(null);
    }
  };

  const goPrev = () => {
    if (activeIndex === null || activeIndex === 0) return;
    setActiveIndex(activeIndex - 1);
  };

  const close = () => setActiveIndex(null);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <>
      {isSingleAppStory ? (
        <View style={rowStyles.cardOuter}>
          <GradientCard
            colors={['#E8FBC5', colors.surface]}
            title={(stories[0] as AppStory).headline}
            subtitle={(stories[0] as AppStory).body}
            titleColor="#0D0D0D"
            subtitleColor="rgba(0,0,0,0.55)"
            onPress={() => openStory(0)}
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
            right={<Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.35)" />}
          />
        </View>
      ) : (
        <FlatList
          horizontal
          data={stories}
          keyExtractor={item => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={rowStyles.row}
          renderItem={({ item, index }) => {
            const isApp = item.type === 'app';
            const listing = isApp ? null : (item as StoryListing);
            return (
              <TouchableOpacity
                style={rowStyles.bubble}
                onPress={() => openStory(index)}
                activeOpacity={0.9}
              >
                <View style={[rowStyles.ring, isApp && rowStyles.ringApp, !isApp && listing!.is_boosted && rowStyles.ringBoosted, !isApp && !listing!.is_boosted && listing!.viewed && rowStyles.ringViewed]}>
                  <View style={rowStyles.ringInner}>
                    {isApp ? (
                      <Image
                        source={APP_STORY_ICON}
                        style={viewerStyles.bubbleImage}
                        contentFit="cover"
                      />
                    ) : listing!.images?.[0] ? (
                      <Image
                        source={{ uri: listing!.images[0] }}
                        style={viewerStyles.bubbleImage}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View style={[viewerStyles.bubbleImage, rowStyles.bubblePlaceholder]} />
                    )}
                  </View>
                </View>
                <Text style={rowStyles.bubbleLabel} numberOfLines={1}>
                  {isApp ? 'Dukanoh' : listing!.category}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal
        visible={activeIndex !== null}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}
      >
        {activeStory && (
          <View style={viewerStyles.viewer}>
            <StatusBar hidden />

            {activeStory.type === 'app' ? (
              // App story viewer — branded card on dark background
              <>
                <View style={viewerStyles.progressBar}>
                  {stories.map((_, i) => (
                    <View key={i} style={viewerStyles.progressSegmentContainer}>
                      <Animated.View
                        style={[
                          viewerStyles.progressSegment,
                          i < (activeIndex ?? 0) && viewerStyles.progressDone,
                          i === activeIndex && { width: progressWidth },
                        ]}
                      />
                    </View>
                  ))}
                </View>

                <TouchableOpacity style={viewerStyles.closeButton} onPress={close} hitSlop={16}>
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>

                <View style={viewerStyles.tapZones} pointerEvents="box-none">
                  <TouchableOpacity style={viewerStyles.tapLeft} onPress={goPrev} activeOpacity={1} />
                  <TouchableOpacity style={viewerStyles.tapRight} onPress={goNext} activeOpacity={1} />
                </View>

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
                <View style={viewerStyles.scrimBottom} />
                <View style={viewerStyles.appCardCenter}>
                  <DukanohLogo width={140} height={24} color="#C7F75E" />
                </View>
                <View style={viewerStyles.overlay}>
                  <Text style={viewerStyles.storyTitle}>{activeStory.headline}</Text>
                  {activeStory.body ? (
                    <Text style={viewerStyles.appBody}>{activeStory.body}</Text>
                  ) : null}
                  <View style={viewerStyles.ctaRow}>
                    <Button
                      label={activeStory.ctaLabel}
                      size="md"
                      onPress={() => {
                        close();
                        router.push(activeStory.ctaRoute as any);
                      }}
                      style={viewerStyles.viewBtn}
                    />
                  </View>
                </View>
              </>
            ) : (
              // Regular listing story viewer — Instagram style
              <ListingStoryViewer
                story={activeStory as StoryListing}
                stories={stories}
                activeIndex={activeIndex!}
                progressWidth={progressWidth}
                onPrev={goPrev}
                onNext={goNext}
                onClose={close}
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
    // Single story card layout
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
    height: 280,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
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
    fontWeight: '600',
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
  // Bottom bar (info card + CTA + heart)
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['3xl'],
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  listingTitle: {
    ...Typography.body,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#0D0D0D',
  },
  listingPrice: {
    ...Typography.body,
    color: '#0D0D0D',
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
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.xl,
    paddingBottom: Spacing['3xl'],
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
  // App story card styles
  appCardCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 200,
  },
  appBody: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 22,
  },
});
