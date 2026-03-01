import React from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Divider } from '@/components/Divider';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { user, signOut, refreshProfile } = useAuth();

  const handleResetPreferences = () => {
    Alert.alert(
      'Reset preferences',
      'This will take you back through the discovery flow.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await supabase
              .from('users')
              .update({ preferred_categories: [], onboarding_completed: false })
              .eq('id', user.id);
            await refreshProfile();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };
  const listings: Listing[] = [];

  const username = user?.user_metadata?.username ?? 'username';
  const fullName = user?.user_metadata?.full_name ?? 'Your Name';
  const bio = user?.user_metadata?.bio ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <ScreenWrapper>
      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            variant="grid"
            onPress={() => router.push(`/listing/${item.id}`)}
          />
        )}
        ListHeaderComponent={
          <View>
            <View style={styles.profileHeader}>
              <Avatar uri={avatarUrl} initials={fullName[0]?.toUpperCase()} size="large" />
              <View style={styles.info}>
                <Text style={styles.name}>{fullName}</Text>
                <Text style={styles.username}>@{username}</Text>
                {bio ? <Text style={styles.bio}>{bio}</Text> : null}
              </View>
            </View>
            <Divider />
            <Text style={styles.sectionLabel}>Listings</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            heading="No listings yet"
            subtext="List your first item to start selling."
            ctaLabel="Start selling"
            onCta={() => router.push('/(tabs)/sell')}
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              label="Reset feed preferences"
              variant="ghost"
              onPress={handleResetPreferences}
            />
            <Button
              label="Sign out"
              variant="outline"
              onPress={signOut}
              style={styles.signOut}
            />
          </View>
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.base,
    paddingVertical: Spacing.xl,
  },
  info: { flex: 1, gap: Spacing.xs },
  name: { ...Typography.subheading, color: Colors.textPrimary },
  username: { ...Typography.body, color: Colors.textSecondary },
  bio: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.xs },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  footer: { gap: Spacing.sm, marginTop: Spacing.xl },
  signOut: {},
});
