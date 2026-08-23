/**
 * Buildings: one card per structure, in a single scrolling list.
 *
 * A flat list rather than categorised tabs, deliberately. With ten buildings the
 * whole thing is two screens of scrolling, and seeing the mines next to the
 * solar plant next to the storages is exactly the comparison a player needs to
 * make. Categories can wait until there are enough buildings to justify them.
 */

import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BuildingCard } from '@/components/BuildingCard';
import { ScreenBackdrop } from '@/components/ScreenBackdrop';
import { BUILDING_IDS, type BuildingId } from '@/engine';
import { colors, fontSize, spacing } from '@/lib/theme';
import { useActivePlanet, useGameStore, useSpeed } from '@/state/gameStore';

export default function BuildingsScreen() {
  const planet = useActivePlanet();
  const speed = useSpeed();
  const startBuild = useGameStore((s) => s.startBuild);

  // Stable identity so `BuildingCard`'s `memo` is not defeated by a fresh
  // arrow function on every one-second re-render.
  const handleUpgrade = useCallback(
    (buildingId: BuildingId) => {
      if (planet) startBuild(planet.id, buildingId);
    },
    [planet, startBuild],
  );

  if (!planet) return null;

  return (
    <ScreenBackdrop>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Buildings</Text>
          <Text style={styles.subtitle}>One construction at a time, per planet.</Text>
        </View>

        {BUILDING_IDS.map((buildingId) => (
          <BuildingCard
            key={buildingId}
            planet={planet}
            buildingId={buildingId}
            speed={speed}
            onUpgrade={handleUpgrade}
          />
        ))}
      </ScrollView>
    </ScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
  },
});
