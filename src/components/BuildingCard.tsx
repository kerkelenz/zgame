/**
 * One row on the Buildings screen.
 *
 * The design goal is that a player never has to guess. Every card answers, in
 * this order:
 *
 *   1. **What is this?**      art, name, category badge, one-line description
 *   2. **Where am I?**        current level, prominently
 *   3. **Can I do it?**       a status chip: READY / NEED RESOURCES / BUSY
 *   4. **What does it cost?** per-resource chips, red on the ones you lack
 *   5. **How long?**          build time, with a clock icon
 *   6. **What do I get?**     the *delta* in production and energy
 *
 * And when this particular building is the one under construction, the card
 * turns into a progress view - bar, percentage, countdown, and a Cancel button
 * where Upgrade used to be. Showing construction state on the thing being
 * constructed means you never have to go looking for it.
 */

import { memo, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameImage } from '@/components/GameImage';
import { ProgressBar } from '@/components/ProgressBar';
import { StatusChip, type ChipTone } from '@/components/StatusChip';
import type { AssetKey } from '@/assets/manifest';
import {
  BUILDINGS,
  averageTemperature,
  buildProgress,
  canQueue,
  crystalProductionPerHour,
  deuteriumProductionPerHour,
  energyConsumption,
  metalProductionPerHour,
  nextLevelBuildSeconds,
  nextLevelCost,
  shortfall,
  solarPlantEnergy,
  storageCapacity,
  type BuildQueueItem,
  type BuildingId,
  type Planet,
  type Resources,
} from '@/engine';
import { formatDuration, formatNumber } from '@/lib/format';
import {
  categoryColor,
  categoryLabel,
  colors,
  fontSize,
  radius,
  resourceColor,
  spacing,
} from '@/lib/theme';

/**
 * Badge glyph per category. Using one icon for all four made the badge purely
 * a colour cue, which is exactly the thing the icon was added to avoid.
 */
const CATEGORY_ICON: Record<string, AssetKey> = {
  mine: 'ui.production',
  energy: 'resource.energy',
  storage: 'ui.storage',
  facility: 'ui.buildings',
};

type BuildingCardProps = {
  planet: Planet;
  buildingId: BuildingId;
  speed: number;
  onUpgrade: (buildingId: BuildingId) => void;
  onCancel: () => void;
};

/** One line of "what the next level buys you", with its own icon and colour. */
type Effect = {
  icon: AssetKey;
  text: string;
  color: string;
};

/**
 * What the next level actually buys you.
 *
 * Shown as a delta ("+52 metal/h") rather than an absolute, because the
 * question a player is really asking is "is this upgrade worth it *right now*",
 * and the answer is the difference, not the total. Gains are green and draws on
 * the power budget are amber, so the trade-off reads without being spelled out.
 */
function upgradeEffects(planet: Planet, id: BuildingId, speed: number): Effect[] {
  const level = planet.buildings[id];
  const next = level + 1;
  const avgTemp = averageTemperature(planet);

  const gain = (before: number, after: number, unit: string): Effect => ({
    icon: 'ui.production',
    text: `+${formatNumber(after - before)} ${unit}`,
    color: colors.success,
  });

  const energyDraw = (): Effect => ({
    icon: 'resource.energy',
    text: `-${formatNumber(energyConsumption(id, next) - energyConsumption(id, level))} energy`,
    color: colors.warning,
  });

  switch (id) {
    case 'metalMine':
      return [
        gain(metalProductionPerHour(level, speed), metalProductionPerHour(next, speed), 'metal/h'),
        energyDraw(),
      ];
    case 'crystalMine':
      return [
        gain(
          crystalProductionPerHour(level, speed),
          crystalProductionPerHour(next, speed),
          'crystal/h',
        ),
        energyDraw(),
      ];
    case 'deuteriumSynthesizer':
      return [
        gain(
          deuteriumProductionPerHour(level, avgTemp, speed),
          deuteriumProductionPerHour(next, avgTemp, speed),
          'deut/h',
        ),
        energyDraw(),
      ];
    case 'solarPlant':
      return [
        {
          icon: 'resource.energy',
          text: `+${formatNumber(solarPlantEnergy(next) - solarPlantEnergy(level))} energy`,
          color: colors.energy,
        },
      ];
    case 'metalStorage':
    case 'crystalStorage':
    case 'deuteriumTank':
      return [
        {
          icon: 'ui.storage',
          text: `+${formatNumber(storageCapacity(next) - storageCapacity(level))} capacity`,
          color: colors.success,
        },
      ];
    case 'roboticsFactory':
      // Build time is divided by (1 + robotics), so the speed-up from level n
      // to n+1 is (1+n+1)/(1+n) - worth spelling out as a percentage.
      return [
        {
          icon: 'ui.time',
          text: `Builds ${Math.round(((next + 1) / (level + 1) - 1) * 100)}% faster`,
          color: colors.success,
        },
      ];
    default:
      return [{ icon: 'ui.locked', text: 'Unlocks a later milestone', color: colors.textFaint }];
  }
}

function BuildingCardImpl({ planet, buildingId, speed, onUpgrade, onCancel }: BuildingCardProps) {
  const definition = BUILDINGS[buildingId];
  const level = planet.buildings[buildingId];
  const cost = nextLevelCost(planet, buildingId);
  const seconds = nextLevelBuildSeconds(planet, buildingId, speed);
  const check = canQueue(planet, buildingId);
  const effects = upgradeEffects(planet, buildingId, speed);
  const missing = shortfall(planet.resources, cost);

  const queued = planet.queue[0];
  const isBuildingThis = queued?.buildingId === buildingId;

  // The manifest key mirrors the building id by construction, which is why the
  // manifest and the engine can stay independent of each other.
  const artKey = `building.${buildingId}` as AssetKey;
  const accent = categoryColor[definition.category];

  // Three-way status. `canQueue` already distinguishes "someone else is
  // building" from "you are short of resources"; we only have to decide which
  // icon and colour say so.
  const status: { icon: AssetKey; label: string; tone: ChipTone } = isBuildingThis
    ? { icon: 'ui.build', label: 'Building', tone: 'busy' }
    : check.ok
      ? { icon: 'ui.check', label: 'Ready', tone: 'ready' }
      : queued
        ? { icon: 'ui.locked', label: 'Busy', tone: 'blocked' }
        : { icon: 'ui.warning', label: 'Short', tone: 'warning' };

  return (
    <View style={[styles.card, isBuildingThis && styles.cardBuilding]}>
      <View style={styles.header}>
        <GameImage id={artKey} size={60} label={definition.name} />

        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {definition.name}
            </Text>
            <StatusChip icon={status.icon} label={status.label} tone={status.tone} />
          </View>

          <View style={styles.badgeRow}>
            <StatusChip
              testID={`level-${buildingId}`}
              icon="ui.level"
              label={`Level ${level}`}
              color={colors.accent}
            />
            <StatusChip
              icon={CATEGORY_ICON[definition.category] ?? 'ui.buildings'}
              label={categoryLabel[definition.category]}
              color={accent}
            />
          </View>

          <Text style={styles.description} numberOfLines={2}>
            {definition.description}
          </Text>
        </View>
      </View>

      {isBuildingThis && queued ? (
        <InProgress item={queued} />
      ) : (
        <View style={styles.stats}>
          <StatRow icon="ui.cost" label="Cost">
            <View style={styles.costs}>
              <CostChip
                amount={cost.metal}
                missing={missing.metal}
                icon="resource.metal"
                color={resourceColor.metal}
              />
              <CostChip
                amount={cost.crystal}
                missing={missing.crystal}
                icon="resource.crystal"
                color={resourceColor.crystal}
              />
              <CostChip
                amount={cost.deuterium}
                missing={missing.deuterium}
                icon="resource.deuterium"
                color={resourceColor.deuterium}
              />
            </View>
          </StatRow>

          <StatRow icon="ui.time" label="Build time">
            <Text style={styles.statValue}>{formatDuration(seconds)}</Text>
          </StatRow>

          <StatRow icon="ui.upgrade" label={`At level ${level + 1}`}>
            <View style={styles.effects}>
              {effects.map((effect) => (
                <View key={effect.text} style={styles.effect}>
                  <GameImage id={effect.icon} size={10} tintColor={effect.color} label="" />
                  <Text style={[styles.effectText, { color: effect.color }]}>{effect.text}</Text>
                </View>
              ))}
            </View>
          </StatRow>

          {/* How short you are, spelled out. Knowing you need "1.4k more metal"
              is actionable; a greyed-out button is not. */}
          {!check.ok && !queued && <ShortfallHint missing={missing} rateHint={definition.name} />}
        </View>
      )}

      {isBuildingThis ? (
        <Pressable
          testID={`cancel-${buildingId}`}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={`Cancel ${definition.name} construction and refund the full cost`}
          style={({ pressed }) => [styles.button, styles.buttonCancel, pressed && styles.pressed]}
        >
          <GameImage id="ui.cancel" size={13} tintColor={colors.danger} label="" />
          <Text style={[styles.buttonText, { color: colors.danger }]}>Cancel — full refund</Text>
        </Pressable>
      ) : (
        <Pressable
          testID={`upgrade-${buildingId}`}
          onPress={() => onUpgrade(buildingId)}
          disabled={!check.ok}
          accessibilityRole="button"
          accessibilityLabel={`Upgrade ${definition.name} to level ${level + 1}`}
          accessibilityState={{ disabled: !check.ok }}
          style={({ pressed }) => [
            styles.button,
            check.ok ? styles.buttonEnabled : styles.buttonDisabled,
            pressed && check.ok && styles.pressed,
          ]}
        >
          <GameImage
            id={check.ok ? 'ui.upgrade' : 'ui.locked'}
            size={13}
            tintColor={check.ok ? '#FFFFFF' : colors.textFaint}
            label=""
          />
          <Text style={[styles.buttonText, !check.ok && styles.buttonTextDisabled]}>
            Upgrade to level {level + 1}
          </Text>
        </Pressable>
      )}

      {/* The reason the engine gave, verbatim. Never leave a disabled button
          unexplained. */}
      {!check.ok && !isBuildingThis && (
        <View style={styles.reasonRow}>
          <GameImage
            id={queued ? 'ui.locked' : 'ui.warning'}
            size={11}
            tintColor={queued ? colors.danger : colors.warning}
            label=""
          />
          <Text style={[styles.reason, { color: queued ? colors.danger : colors.warning }]}>
            {check.reason}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Live progress for the building currently under construction. */
function InProgress({ item }: { item: BuildQueueItem }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const progress = buildProgress(item, now);
  const remaining = Math.max(0, Math.ceil((item.finishesAt - now) / 1000));

  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressLine}>
        <View style={styles.progressLabel}>
          <GameImage id="ui.build" size={12} tintColor={colors.accent} label="" />
          <Text style={styles.progressText}>Under construction</Text>
        </View>
        <Text style={styles.progressRemaining}>{formatDuration(remaining)}</Text>
      </View>
      <ProgressBar progress={progress} color={colors.accent} height={7} />
      <Text style={styles.progressPercent}>{Math.round(progress * 100)}% complete</Text>
    </View>
  );
}

/** A labelled row: `[icon] Cost .............. 60 M  15 C`. */
function StatRow({
  icon,
  label,
  children,
}: {
  icon: AssetKey;
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statLabelGroup}>
        <GameImage id={icon} size={11} tintColor={colors.textFaint} label="" />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <View style={styles.statvalueGroup}>{children}</View>
    </View>
  );
}

/** One resource in a cost line. Turns red, with a warning glyph, when short. */
function CostChip({
  amount,
  missing,
  icon,
  color,
}: {
  amount: number;
  missing: number;
  icon: AssetKey;
  color: string;
}) {
  // Free components are simply not shown - a "0 D" chip is pure noise.
  if (amount <= 0) return null;

  const short = missing > 0;
  return (
    <View style={styles.costChip}>
      <GameImage id={icon} size={11} tintColor={short ? colors.danger : undefined} label="" />
      <Text style={[styles.costAmount, { color: short ? colors.danger : color }]}>
        {formatNumber(amount)}
      </Text>
    </View>
  );
}

/** "Still need: 1.4k metal, 320 crystal" - the gap, not just the total. */
function ShortfallHint({ missing, rateHint }: { missing: Resources; rateHint: string }) {
  const parts: string[] = [];
  if (missing.metal > 0) parts.push(`${formatNumber(missing.metal)} metal`);
  if (missing.crystal > 0) parts.push(`${formatNumber(missing.crystal)} crystal`);
  if (missing.deuterium > 0) parts.push(`${formatNumber(missing.deuterium)} deuterium`);
  if (parts.length === 0) return null;

  return (
    <View style={styles.shortfall}>
      <GameImage id="ui.warning" size={11} tintColor={colors.warning} label="" />
      <Text style={styles.shortfallText} numberOfLines={2}>
        Still need {parts.join(' + ')} for {rateHint}
      </Text>
    </View>
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
  cardBuilding: {
    // The active build gets a visible outline so it is findable in a long list.
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  description: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 15,
  },
  stats: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statvalueGroup: {
    flexShrink: 1,
    alignItems: 'flex-end',
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
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  costs: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  costChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  costAmount: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  effects: {
    alignItems: 'flex-end',
    gap: 2,
  },
  effect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  effectText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  shortfall: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.warning + '18',
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  shortfallText: {
    color: colors.warning,
    fontSize: fontSize.xs,
    flex: 1,
    lineHeight: 15,
  },
  progressBlock: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  progressLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  progressText: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressRemaining: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  progressPercent: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  buttonEnabled: {
    backgroundColor: colors.accent,
  },
  buttonCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  pressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  buttonTextDisabled: {
    color: colors.textFaint,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  reason: {
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
