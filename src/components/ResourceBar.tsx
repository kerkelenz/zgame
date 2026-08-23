/**
 * The sticky status bar: metal, crystal, deuterium, energy.
 *
 * This is the most-read UI in the whole game, so it optimises for glanceability
 * over completeness: an icon, a big number, a small rate underneath. Anything a
 * player needs *while deciding* goes here; anything else goes on a screen.
 *
 * Two states earn colour:
 *
 * - **At storage capacity** turns the amount red. Production silently stopping
 *   because a silo is full is the single most common way to waste hours in this
 *   genre, and a player who does not notice cannot fix it.
 * - **Negative energy** turns the energy figure red. Every mine is running slow
 *   and the player needs to know why their rates dropped.
 */

import { StyleSheet, Text, View } from 'react-native';

import { GameImage } from '@/components/GameImage';
import type { AssetKey } from '@/assets/manifest';
import { computeProduction, storageCapacities, type Planet } from '@/engine';
import { formatNumber, formatPercentDelta, formatRate } from '@/lib/format';
import { colors, fontSize, radius, resourceColor, spacing } from '@/lib/theme';

/**
 * `testID` becomes `data-testid` on web and an accessibility id on native, so
 * end-to-end tests can assert on the exact numbers a player sees rather than
 * scraping rendered text. Cheap to add, and it keeps test selectors from
 * depending on layout.
 */
type ResourceBarProps = {
  planet: Planet;
  speed: number;
};

export function ResourceBar({ planet, speed }: ResourceBarProps) {
  const production = computeProduction(planet, speed);
  const capacity = storageCapacities(planet.buildings);
  const { energy } = production;

  // A small float tolerance: `applyProduction` clamps to exactly the capacity,
  // but comparing floats for equality is a habit worth not forming.
  const atCap = (amount: number, max: number) => amount >= max - 0.5;

  return (
    <View style={styles.bar}>
      <ResourceCell
        id="metal"
        icon="resource.metal"
        label="Metal"
        amount={planet.resources.metal}
        rate={production.net.metal}
        color={resourceColor.metal}
        full={atCap(planet.resources.metal, capacity.metal)}
      />
      <ResourceCell
        id="crystal"
        icon="resource.crystal"
        label="Crystal"
        amount={planet.resources.crystal}
        rate={production.net.crystal}
        color={resourceColor.crystal}
        full={atCap(planet.resources.crystal, capacity.crystal)}
      />
      <ResourceCell
        id="deuterium"
        icon="resource.deuterium"
        label="Deuterium"
        amount={planet.resources.deuterium}
        rate={production.net.deuterium}
        color={resourceColor.deuterium}
        full={atCap(planet.resources.deuterium, capacity.deuterium)}
      />

      {/* Energy is not a stockpile, so it shows produced/consumed rather than
          an amount and a rate. */}
      <View style={styles.cell}>
        <GameImage id="resource.energy" size={22} label="Energy" />
        <Text
          testID="resource-energy-amount"
          style={[styles.amount, { color: energy.factor < 1 ? colors.danger : colors.text }]}
          numberOfLines={1}
        >
          {formatNumber(energy.produced)}/{formatNumber(energy.consumed)}
        </Text>
        <Text
          testID="resource-energy-rate"
          style={[styles.rate, energy.factor < 1 && styles.rateDanger]}
          numberOfLines={1}
        >
          {energy.factor < 1 ? formatPercentDelta(energy.factor) : 'Stable'}
        </Text>
      </View>
    </View>
  );
}

type ResourceCellProps = {
  id: string;
  icon: AssetKey;
  label: string;
  amount: number;
  rate: number;
  color: string;
  full: boolean;
};

function ResourceCell({ id, icon, label, amount, rate, color, full }: ResourceCellProps) {
  return (
    <View style={styles.cell}>
      <GameImage id={icon} size={22} label={label} />
      <Text
        testID={`resource-${id}-amount`}
        style={[styles.amount, { color: full ? colors.danger : colors.text }]}
        numberOfLines={1}
      >
        {formatNumber(amount)}
      </Text>
      <Text
        testID={`resource-${id}-rate`}
        style={[styles.rate, { color: full ? colors.danger : color }]}
        numberOfLines={1}
      >
        {full ? 'FULL' : formatRate(rate)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  amount: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  rateDanger: {
    color: colors.danger,
  },
});
