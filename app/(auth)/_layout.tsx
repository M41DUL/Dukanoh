import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="invite" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="login" />
    </Stack>
  );
}
