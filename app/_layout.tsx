/**
 * The root layout: app shell, bootstrap, and the tab bar.
 *
 * Layout order matters here. The starfield is the outermost layer, the resource
 * bar sits above the navigator, and the tabs fill what is left. Putting the
 * `<ResourceBar>` *outside* `<Tabs>` rather than repeating it on every screen
 * means it is genuinely sticky: switching tabs does not unmount and remount it,
 * so the numbers never flicker.
 */

import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameImage } from '@/components/GameImage';
import { ResourceBar } from '@/components/ResourceBar';
import { useActivePlanet, useGameStore, useSpeed } from '@/state/gameStore';
import { colors, fontSize, spacing } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        <AppShell />
      </View>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const insets = useSafeAreaInsets();
  const loaded = useGameStore((s) => s.loaded);
  const init = useGameStore((s) => s.init);
  const teardown = useGameStore((s) => s.teardown);
  const planet = useActivePlanet();
  const speed = useSpeed();

  useEffect(() => {
    // `init()` loads the save, catches up on offline production, and starts the
    // one-second clock. It is idempotent, which matters because React 19's
    // StrictMode deliberately double-invokes effects in development.
    void init();
    return () => teardown();
  }, [init, teardown]);

  if (!loaded || !planet) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Spinning up the colony...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <View style={styles.resourceBarWrapper}>
        <ResourceBar planet={planet} speed={speed} />
      </View>

      <Tabs
        screenOptions={{
          headerShown: false,
          // The starfield shows through, so every navigator surface is
          // transparent and only the tab bar itself gets a solid background.
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Overview',
            tabBarIcon: () => <GameImage id="planet.temperate.1" size={22} label="Overview" />,
          }}
        />
        <Tabs.Screen
          name="buildings"
          options={{
            title: 'Buildings',
            tabBarIcon: () => <GameImage id="building.metalMine" size={22} label="Buildings" />,
          }}
        />
        {/* Research, Shipyard, Fleet and Galaxy tabs land in later milestones.
            Adding one is a file in app/ plus a <Tabs.Screen> here. */}
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // The starfield lives inside each tab screen (see ScreenBackdrop); the root
    // just holds the solid colour behind the resource bar and the tab bar.
    backgroundColor: colors.background,
    // Belt and braces: nothing inside may widen the page.
    overflow: 'hidden',
  },
  shell: {
    flex: 1,
  },
  resourceBarWrapper: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  tabBarLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});
