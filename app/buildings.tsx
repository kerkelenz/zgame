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
import { GameImage } from '@/components/GameImage';
import { ScreenBackdrop } from '@/components/ScreenBackdrop';
import { StatusChip } from '@/components/StatusChip';
import { BUILDING_IDS, type BuildingId } from '@/engine';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useActivePlanet, useGameStore, useSpeed } from '@/state/gameStore';

export default function BuildingsScreen() {
  const planet = useActivePlanet();
  const speed = useSpeed();
  const startBuild = useGameStore((s) => s.startBuild);
  const cancelBuild = useGameStore((s) => s.cancelBuild);

  // Stable identity so `BuildingCard`'s `memo` is not defeated by a fresh
  // arrow function on every one-second re-render.
  const handleUpgrade = useCallback(
    (buildingId: BuildingId) => {
      if (planet) startBuild(planet.id, buildingId);
    },
    [planet, startBuild],
  );

  const handleCancel = useCallback(() => {
    if (planet) cancelBuild(planet.id);
  }, [planet, cancelBuild]);

  if (!planet) return null;

  return (
    <ScreenBackdrop>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Buildings</Text>
          <Text style={styles.subtitle}>One construction at a time, per planet.</Text>
        </View>

        {/*
          A legend, not decoration. The cards use three status colours and the
          player has no way to learn what they mean except by trial and error -
          which, in a game where a build takes hours, is an expensive way to
          learn anything.
        */}
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <StatusChip icon="ui.check" label="Ready" tone="ready" />
            <StatusChip icon="ui.warning" label="Short" tone="warning" />
            <StatusChip icon="ui.locked" label="Busy" tone="blocked" />
            <StatusChip icon="ui.build" label="Building" tone="busy" />
          </View>
          <View style={styles.legendHintRow}>
            <GameImage id="ui.cost" size={11} tintColor={colors.textFaint} label="" />
            <Text style={styles.legendHint}>
              Costs you cannot pay are shown in red. Every card lists what the next level adds.
            </Text>
          </View>
        </View>

        {BUILDING_IDS.map((buildingId) => (
          <BuildingCard
            key={buildingId}
            planet={planet}
            buildingId={buildingId}
            speed={speed}
            onUpgrade={handleUpgrade}
            onCancel={handleCancel}
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
  legend: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  legendHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  legendHint: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 15,
    flex: 1,
  },
});
