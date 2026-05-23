import { Tabs, router, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useAuth } from '@/hooks/useAuth';

/** If root stack screens are open above the tabs, dismiss them before switching tabs. */
function dismissStackOnTabPress(e: { target?: string; preventDefault: () => void }) {
  if (router.canDismiss()) {
    e.preventDefault();
    router.dismissAll();
  }
}

export default function TabLayout() {
  const colors = useThemeColors();
  const { count: unreadCount, refresh: refreshUnreadCount } = useUnreadCount();
  const { session, loading, needsUsername, onboardingCompleted } = useAuth();

  // Declarative auth guard — prevents the Tabs (and whatever route Android
  // restored, e.g. /sell) from rendering even one frame when the user
  // shouldn't be here. <Redirect> happens during render, so there's no
  // post-mount useEffect race.
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/intro" />;
  if (needsUsername) return <Redirect href="/username-picker" />;
  if (!onboardingCompleted) return <Redirect href="/onboarding" />;

  const tabListeners = {
    tabPress: dismissStackOnTabPress,
  };

  const inboxListeners = {
    tabPress: dismissStackOnTabPress,
    focus: refreshUnreadCount,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
        listeners={tabListeners}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
        listeners={tabListeners}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Sell',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
        listeners={tabListeners}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.error, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
        }}
        listeners={inboxListeners}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
        listeners={tabListeners}
      />
    </Tabs>
  );
}
