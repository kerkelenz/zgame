/**
 * Overview: the planet at a glance.
 *
 * Portrait of the world, its vital statistics, whatever is currently being
 * built, and the escape hatch at the bottom.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { planetArtKey } from '@/assets/manifest';
import { Countdown } from '@/components/Countdown';
import { GameImage } from '@/components/GameImage';
import { ScreenBackdrop } from '@/components/ScreenBackdrop';
import { BUILDINGS, averageTemperature } from '@/engine';
import { formatCoords, formatExact } from '@/lib/format';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useActivePlanet, useGameStore } from '@/state/gameStore';

export default function OverviewScreen() {
  const planet = useActivePlanet();
  const cancelBuild = useGameStore((s) => s.cancelBuild);

  if (!planet) return null;

  const queued = planet.queue[0];

  return (
    <ScreenBackdrop>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {/* The art is derived from the planet's own temperature and position,
            so it is stable across launches without being stored in the save. */}
          <GameImage id={planetArtKey(planet)} size={140} label={`${planet.name} surface`} />
          <View style={styles.heroText}>
            <Text style={styles.planetName}>{planet.name}</Text>
            <Text style={styles.coords}>[{formatCoords(planet.coords)}]</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Planet data</Text>
          <StatRow label="Diameter" value={`${formatExact(planet.diameter)} km`} />
          <StatRow
            label="Temperature"
            value={`${planet.temperature.min}°C to ${planet.temperature.max}°C`}
          />
          <StatRow label="Average" value={`${averageTemperature(planet)}°C`} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Construction</Text>

          {queued ? (
            <View testID="build-queue-item" style={styles.queueItem}>
              <GameImage
                id={`building.${queued.buildingId}`}
                size={48}
                label={BUILDINGS[queued.buildingId].name}
              />
              <View style={styles.queueText}>
                <Text style={styles.queueName}>
                  {BUILDINGS[queued.buildingId].name} → level {queued.targetLevel}
                </Text>
                <Countdown finishesAt={queued.finishesAt} style={styles.countdown} />
              </View>
              <Pressable
                testID="cancel-build"
                onPress={() => cancelBuild(planet.id)}
                accessibilityRole="button"
                accessibilityLabel="Cancel construction and refund the full cost"
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.empty}>
              Nothing under construction. Head to Buildings to start something.
            </Text>
          )}
        </View>

        <ResetGameButton />
      </ScrollView>
    </ScreenBackdrop>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/**
 * Reset, behind a confirmation.
 *
 * The confirmation is an inline two-step rather than `Alert.alert`, because
 * React Native Web's `Alert` is a no-op - the button would silently do nothing
 * in the browser, which is exactly the kind of platform gap that makes
 * "one codebase, three targets" fall apart in practice. An inline state
 * machine behaves identically everywhere.
 */
function ResetGameButton() {
  const [confirming, setConfirming] = useState(false);
  const resetGame = useGameStore((s) => s.resetGame);

  if (!confirming) {
    return (
      <Pressable
        onPress={() => setConfirming(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
      >
        <Text style={styles.resetText}>Reset game</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.confirmPanel}>
      <Text style={styles.confirmText}>
        Delete this empire and start over? This cannot be undone.
      </Text>
      <View style={styles.confirmRow}>
        <Pressable
          onPress={() => setConfirming(false)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed]}
        >
          <Text style={styles.confirmCancelText}>Keep playing</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setConfirming(false);
            void resetGame();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.confirmDanger, pressed && styles.pressed]}
        >
          <Text style={styles.confirmDangerText}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
  },
  heroText: {
    alignItems: 'center',
  },
  planetName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  coords: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  panelTitle: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  queueText: {
    flex: 1,
    gap: 2,
  },
  queueName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  countdown: {
    color: colors.accent,
    fontSize: fontSize.sm,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  empty: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  resetButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  resetText: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
  confirmPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    gap: spacing.md,
  },
  confirmText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  confirmCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  confirmCancelText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  confirmDanger: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  confirmDangerText: {
    color: '#1A0A0A',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
