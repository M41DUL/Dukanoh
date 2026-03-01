import React, { useState, useRef } from 'react';
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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { useBasket } from '@/hooks/useBasket';
import { StoryListing } from '@/hooks/useStories';

const { width, height } = Dimensions.get('window');

interface StoriesRowProps {
  stories: StoryListing[];
  onView: (listingId: string) => void;
}

export function StoriesRow({ stories, onView }: StoriesRowProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { addItem, removeItem, isInBasket } = useBasket();

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
        contentContainerStyle={styles.row}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.bubble}
            onPress={() => openStory(index)}
            activeOpacity={0.9}
          >
            <View style={[styles.ring, item.viewed && styles.ringViewed]}>
              <View style={styles.ringInner}>
                {item.images?.[0] ? (
                  <Image
                    source={{ uri: item.images[0] }}
                    style={styles.bubbleImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.bubbleImage, styles.bubblePlaceholder]} />
                )}
              </View>
            </View>
            <Text style={styles.bubbleLabel} numberOfLines={1}>
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
          <View style={styles.viewer}>
            <StatusBar hidden />

            {/* Full screen image */}
            {activeStory.images?.[0] ? (
              <Image
                source={{ uri: activeStory.images[0] }}
                style={styles.fullImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.fullImage, styles.fullImagePlaceholder]} />
            )}

            {/* Dark scrim at top and bottom */}
            <View style={styles.scrimTop} />
            <View style={styles.scrimBottom} />

            {/* Progress bar */}
            <View style={styles.progressBar}>
              {stories.map((_, i) => (
                <View key={i} style={styles.progressSegmentContainer}>
                  <View
                    style={[
                      styles.progressSegment,
                      i < (activeIndex ?? 0) && styles.progressDone,
                      i === activeIndex && styles.progressActive,
                    ]}
                  />
                </View>
              ))}
            </View>

            {/* Close button */}
            <TouchableOpacity style={styles.closeButton} onPress={close} hitSlop={16}>
              <Ionicons name="close" size={26} color={Colors.background} />
            </TouchableOpacity>

            {/* Tap zones for navigation */}
            <View style={styles.tapZones} pointerEvents="box-none">
              <TouchableOpacity style={styles.tapLeft} onPress={goPrev} activeOpacity={1} />
              <TouchableOpacity style={styles.tapRight} onPress={goNext} activeOpacity={1} />
            </View>

            {/* Product info overlay */}
            <View style={styles.overlay}>
              <View style={styles.sellerRow}>
                <Avatar
                  uri={activeStory.seller.avatar_url}
                  initials={activeStory.seller.username[0]?.toUpperCase()}
                  size="small"
                />
                <Text style={styles.sellerName}>@{activeStory.seller.username}</Text>
                <Badge label={activeStory.category} active style={styles.categoryBadge} />
              </View>

              <Text style={styles.storyTitle} numberOfLines={2}>
                {activeStory.title}
              </Text>
              <Text style={styles.storyPrice}>£{activeStory.price?.toFixed(2)}</Text>

              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={[
                    styles.basketBtn,
                    isInBasket(activeStory.id) && styles.basketBtnActive,
                  ]}
                  onPress={() =>
                    isInBasket(activeStory.id)
                      ? removeItem(activeStory.id)
                      : addItem(activeStory.id)
                  }
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isInBasket(activeStory.id) ? 'cart' : 'cart-outline'}
                    size={20}
                    color={isInBasket(activeStory.id) ? Colors.primary : Colors.background}
                  />
                </TouchableOpacity>

                <Button
                  label="View Listing"
                  size="md"
                  onPress={() => {
                    close();
                    router.push(`/listing/${activeStory.id}`);
                  }}
                  style={styles.viewBtn}
                />
              </View>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Row
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
    backgroundColor: Colors.primary,
  },
  ringViewed: {
    backgroundColor: Colors.border,
  },
  ringInner: {
    flex: 1,
    borderRadius: 29,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  bubbleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
  },
  bubblePlaceholder: {
    backgroundColor: Colors.surface,
  },
  bubbleLabel: {
    ...Typography.caption,
    color: Colors.textPrimary,
    textAlign: 'center',
    width: 64,
  },

  // Viewer
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
    backgroundColor: Colors.surface,
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
    // RN doesn't support backgroundImage — use opacity overlay instead
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
    backgroundColor: Colors.background,
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

  // Overlay
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
    color: Colors.background,
  },
  categoryBadge: {
    borderColor: 'transparent',
  },
  storyTitle: {
    ...Typography.subheading,
    color: Colors.background,
  },
  storyPrice: {
    ...Typography.heading,
    color: Colors.secondary,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  basketBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  basketBtnActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  viewBtn: { flex: 1 },
});
