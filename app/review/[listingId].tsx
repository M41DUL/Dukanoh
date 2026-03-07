import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function ReviewScreen() {
  const { listingId, sellerName, listingTitle } = useLocalSearchParams<{
    listingId: string;
    sellerName: string;
    listingTitle: string;
  }>();
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleSubmit = async () => {
    if (!user || !listingId || rating === 0) return;
    setSubmitting(true);

    const { data: listing } = await supabase
      .from('listings')
      .select('seller_id')
      .eq('id', listingId)
      .single();

    if (!listing) {
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('reviews').insert({
      reviewer_id: user.id,
      seller_id: listing.seller_id,
      listing_id: listingId,
      rating,
      comment: comment.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', 'Could not submit review. You may have already reviewed this seller for this listing.');
      return;
    }

    Alert.alert('Review submitted', 'Thanks for your feedback!', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rate seller</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={styles.sellerLabel}>@{sellerName}</Text>
        {listingTitle ? (
          <Text style={styles.listingLabel} numberOfLines={1}>{decodeURIComponent(listingTitle)}</Text>
        ) : null}

        <Text style={styles.prompt}>How was your experience?</Text>

        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map(i => (
            <TouchableOpacity key={i} onPress={() => setRating(i)} hitSlop={8} activeOpacity={0.7}>
              <Ionicons
                name={i <= rating ? 'star' : 'star-outline'}
                size={40}
                color={i <= rating ? colors.amber : colors.border}
              />
            </TouchableOpacity>
          ))}
        </View>

        {rating > 0 && (
          <Text style={styles.ratingLabel}>
            {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}
          </Text>
        )}

        <Input
          placeholder="Add a comment (optional)"
          value={comment}
          onChangeText={setComment}
          multiline
          containerStyle={styles.commentInput}
        />

        <Button
          label={submitting ? 'Submitting…' : 'Submit review'}
          onPress={handleSubmit}
          disabled={rating === 0 || submitting}
          style={styles.submitBtn}
        />
        {submitting && <ActivityIndicator color={colors.primaryText} style={styles.spinner} />}
      </View>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    backBtn: { padding: Spacing.xs },
    headerTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: { width: 32 },
    body: {
      flex: 1,
      paddingTop: Spacing.xl,
      gap: Spacing.md,
    },
    sellerLabel: {
      ...Typography.subheading,
      color: colors.textPrimary,
    },
    listingLabel: {
      ...Typography.body,
      color: colors.textSecondary,
      marginTop: -Spacing.xs,
    },
    prompt: {
      ...Typography.body,
      color: colors.textSecondary,
      marginTop: Spacing.sm,
    },
    stars: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginVertical: Spacing.sm,
    },
    ratingLabel: {
      ...Typography.subheading,
      color: colors.amber,
      marginTop: -Spacing.xs,
    },
    commentInput: {
      marginTop: Spacing.sm,
    },
    submitBtn: {
      marginTop: Spacing.sm,
    },
    spinner: { marginTop: Spacing.sm },
  });
}
