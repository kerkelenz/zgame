/**
 * One row on the Buildings screen.
 *
 * The design goal is that a player never has to guess: the card shows what the
 * next level costs, what they cannot afford (in red), how long it will take,
 * and what they actually get out of it. When the Upgrade button is disabled it
 * says why, in words, directly underneath.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameImage } from '@/components/GameImage';
import type { AssetKey } from '@/assets/manifest';
import {
  BUILDINGS,
  averageTemperature,
  canQueue,
  crystalProductionPerHour,
  deuteriumProductionPerHour,
  energyConsumption,
  metalProductionPerHour,
  nextLevelBuildSeconds,
  nextLevelCost,
  solarPlantEnergy,
  storageCapacity,
  type BuildingId,
  type Planet,
} from '@/engine';
import { formatDuration, formatNumber } from '@/lib/format';
import { colors, fontSize, radius, resourceColor, spacing } from '@/lib/theme';

type BuildingCardProps = {
  planet: Planet;
  buildingId: BuildingId;
  speed: number;
  onUpgrade: (buildingId: BuildingId) => void;
};

/**
 * What the next level actually buys you.
 *
 * Shown as a delta ("+52 metal/h") rather than an absolute, because the
 * question a player is really asking is "is this upgrade worth it *right now*",
 * and the answer is the difference, not the total.
 */
function upgradeEffects(planet: Planet, id: BuildingId, speed: number): string[] {
  const level = planet.buildings[id];
  const next = level + 1;
  const avgTemp = averageTemperature(planet);

  const delta = (before: number, after: number, unit: string) =>
    `+${formatNumber(after - before)} ${unit}`;

  switch (id) {
    case 'metalMine':
      return [
        delta(metalProductionPerHour(level, speed), metalProductionPerHour(next, speed), 'metal/h'),
        `-${formatNumber(energyConsumption(id, next) - energyConsumption(id, level))} energy`,
      ];
    case 'crystalMine':
      return [
        delta(
          crystalProductionPerHour(level, speed),
          crystalProductionPerHour(next, speed),
          'crystal/h',
        ),
        `-${formatNumber(energyConsumption(id, next) - energyConsumption(id, level))} energy`,
      ];
    case 'deuteriumSynthesizer':
      return [
        delta(
          deuteriumProductionPerHour(level, avgTemp, speed),
          deuteriumProductionPerHour(next, avgTemp, speed),
          'deut/h',
        ),
        `-${formatNumber(energyConsumption(id, next) - energyConsumption(id, level))} energy`,
      ];
    case 'solarPlant':
      return [delta(solarPlantEnergy(level), solarPlantEnergy(next), 'energy')];
    case 'metalStorage':
    case 'crystalStorage':
    case 'deuteriumTank':
      return [delta(storageCapacity(level), storageCapacity(next), 'capacity')];
    case 'roboticsFactory':
      // Build time is divided by (1 + robotics), so the speed-up from level n
      // to n+1 is (1+n+1)/(1+n) - worth spelling out as a percentage.
      return [`Builds ${Math.round(((next + 1) / (level + 1) - 1) * 100)}% faster`];
    default:
      return [];
  }
}

function BuildingCardImpl({ planet, buildingId, speed, onUpgrade }: BuildingCardProps) {
  const definition = BUILDINGS[buildingId];
  const level = planet.buildings[buildingId];
  const cost = nextLevelCost(planet, buildingId);
  const seconds = nextLevelBuildSeconds(planet, buildingId, speed);
  const check = canQueue(planet, buildingId);
  const effects = upgradeEffects(planet, buildingId, speed);

  // The manifest key mirrors the building id by construction, which is why the
  // manifest and the engine can stay independent of each other.
  const artKey = `building.${buildingId}` as AssetKey;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <GameImage id={artKey} size={64} label={definition.name} />

        <View style={styles.headerText}>
          <Text style={styles.name}>{definition.name}</Text>
          <Text testID={`level-${buildingId}`} style={styles.level}>
            Level {level}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {definition.description}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.costRow}>
          <Text style={styles.statLabel}>Cost</Text>
          <View style={styles.costs}>
            <CostChip
              amount={cost.metal}
              have={planet.resources.metal}
              color={resourceColor.metal}
              label="M"
            />
            <CostChip
              amount={cost.crystal}
              have={planet.resources.crystal}
              color={resourceColor.crystal}
              label="C"
            />
            <CostChip
              amount={cost.deuterium}
              have={planet.resources.deuterium}
              color={resourceColor.deuterium}
              label="D"
            />
          </View>
        </View>

        <View style={styles.costRow}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>{formatDuration(seconds)}</Text>
        </View>

        {effects.length > 0 && (
          <View style={styles.costRow}>
            <Text style={styles.statLabel}>Next level</Text>
            <Text style={styles.effect}>{effects.join('   ')}</Text>
          </View>
        )}
      </View>

      <Pressable
        testID={`upgrade-${buildingId}`}
        onPress={() => onUpgrade(buildingId)}
        disabled={!check.ok}
        accessibilityRole="button"
        accessibilityLabel={`Upgrade ${definition.name} to level ${level + 1}`}
        accessibilityState={{ disabled: !check.ok }}
        style={({ pressed }) => [
          styles.button,
          !check.ok && styles.buttonDisabled,
          pressed && check.ok && styles.buttonPressed,
        ]}
      >
        <Text style={[styles.buttonText, !check.ok && styles.buttonTextDisabled]}>
          Upgrade to level {level + 1}
        </Text>
      </Pressable>

      {/* The reason the engine gave, verbatim. Never leave a disabled button
          unexplained. */}
      {!check.ok && <Text style={styles.reason}>{check.reason}</Text>}
    </View>
  );
}

/** One resource in a cost line. Turns red when the player is short of it. */
function CostChip({
  amount,
  have,
  color,
  label,
}: {
  amount: number;
  have: number;
  color: string;
  label: string;
}) {
  // Free components are simply not shown - a "0 D" chip is pure noise.
  if (amount <= 0) return null;

  const affordable = have >= amount;
  return (
    <Text style={[styles.costChip, { color: affordable ? color : colors.danger }]}>
      {formatNumber(amount)}
      <Text style={styles.costUnit}> {label}</Text>
    </Text>
  );
}

/**
 * Memoised: the store re-renders this list every second as resources tick up,
 * and ten cards each re-computing their costs and formatting is real work on a
 * mid-range phone. React will still re-render when the planet object changes
 * identity (which it does every tick) - but `memo` means a card whose props are
 * referentially identical is skipped entirely.
 */
export const BuildingCard = memo(BuildingCardImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  level: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  description: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 15,
  },
  stats: {
    gap: spacing.xs,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  costs: {
    flexDirection: 'row',
    gap: spacing.md,
    flexShrink: 1,
  },
  statLabel: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  costChip: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  costUnit: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    fontWeight: '400',
  },
  effect: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    flexShrink: 1,
    textAlign: 'right',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  buttonTextDisabled: {
    color: colors.textFaint,
  },
  reason: {
    color: colors.danger,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
});
