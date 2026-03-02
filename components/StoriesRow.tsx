import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { StoryListing } from '@/hooks/useStories';

const { width, height } = Dimensions.get('window');

interface StoriesRowProps {
  stories: StoryListing[];
  onView: (listingId: string) => void;
}

export function StoriesRow({ stories, onView }: StoriesRowProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const colors = useThemeColors();
  const rowStyles = useMemo(() => getRowStyles(colors), [colors]);

  if (stories.length === 0) return null;

  const activeStory = activeIndex !== null ? stories[activeIndex] : null;

  const openStory = (index: number) => {
    setActiveIndex(index);
    onView(stories[index].id);
  };

  const goNext = () => {
    if (activeIndex === null) return;
    if (activeIndex < stories.length - 1) {
      const next = activeIndex + 1;
      setActiveIndex(next);
      onView(stories[next].id);
    } else {
      setActiveIndex(null);
    }
  };

  const goPrev = () => {
    if (activeIndex === null || activeIndex === 0) return;
    setActiveIndex(activeIndex - 1);
  };

  const close = () => setActiveIndex(null);

  return (
    <>
      <FlatList
        horizontal
        data={stories}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rowStyles.row}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={rowStyles.bubble}
            onPress={() => openStory(index)}
            activeOpacity={0.9}
          >
            <View style={[rowStyles.ring, item.viewed && rowStyles.ringViewed]}>
              <View style={rowStyles.ringInner}>
                {item.images?.[0] ? (
                  <Image
                    source={{ uri: item.images[0] }}
                    style={viewerStyles.bubbleImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[viewerStyles.bubbleImage, rowStyles.bubblePlaceholder]} />
                )}
              </View>
            </View>
            <Text style={rowStyles.bubbleLabel} numberOfLines={1}>
              @{item.seller.username}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={activeIndex !== null}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}
      >
        {activeStory && (
          <View style={viewerStyles.viewer}>
            <StatusBar hidden />

            {activeStory.images?.[0] ? (
              <Image
                source={{ uri: activeStory.images[0] }}
                style={viewerStyles.fullImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[viewerStyles.fullImage, viewerStyles.fullImagePlaceholder]} />
            )}

            <View style={viewerStyles.scrimTop} />
            <View style={viewerStyles.scrimBottom} />

            <View style={viewerStyles.progressBar}>
              {stories.map((_, i) => (
                <View key={i} style={viewerStyles.progressSegmentContainer}>
                  <View
                    style={[
                      viewerStyles.progressSegment,
                      i < (activeIndex ?? 0) && viewerStyles.progressDone,
                      i === activeIndex && viewerStyles.progressActive,
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

            <View style={viewerStyles.overlay}>
              <View style={viewerStyles.sellerRow}>
                <Avatar
                  uri={activeStory.seller.avatar_url}
                  initials={activeStory.seller.username[0]?.toUpperCase()}
                  size="small"
                />
                <Text style={viewerStyles.sellerName}>@{activeStory.seller.username}</Text>
                <Badge label={activeStory.category} active style={viewerStyles.categoryBadge} />
              </View>

              <Text style={viewerStyles.storyTitle} numberOfLines={2}>
                {activeStory.title}
              </Text>
              <Text style={viewerStyles.storyPrice}>£{activeStory.price?.toFixed(2)}</Text>

              <View style={viewerStyles.ctaRow}>
                <Button
                  label="View Listing"
                  size="md"
                  onPress={() => {
                    close();
                    router.push(`/listing/${activeStory.id}`);
                  }}
                  style={viewerStyles.viewBtn}
                />
              </View>
            </View>
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
      paddingRight: Spacing.base,
      paddingTop: Spacing.sm,
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
      backgroundColor: colors.primary,
    },
    ringViewed: {
      backgroundColor: colors.border,
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
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    opacity: 0,
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
  progressBar: {
    position: 'absolute',
    top: 52,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    gap: 4,
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
  progressActive: { width: '60%' },
  closeButton: {
    position: 'absolute',
    top: 52,
    right: Spacing.base,
    zIndex: 10,
    padding: Spacing.xs,
  },
  tapZones: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    bottom: 260,
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
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sellerName: {
    ...Typography.label,
    color: '#fff',
  },
  categoryBadge: {
    borderColor: 'transparent',
  },
  storyTitle: {
    ...Typography.subheading,
    color: '#fff',
  },
  storyPrice: {
    ...Typography.heading,
    color: '#C7F75E',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  viewBtn: { flex: 1 },
});
