/**
 * The sticky status bar: metal, crystal, deuterium, energy.
 *
 * This is the most-read UI in the whole game, so every cell answers four
 * questions at once, stacked in order of how often you need them:
 *
 *     [icon]  METAL          <- which resource (glyph + word)
 *     4.2k /10k              <- how much, and out of what ceiling
 *     [============--]       <- how close to that ceiling, at a glance
 *     +1.2k/h                <- and which way it is heading
 *
 * The bar is the part that earns its keep. "4,213" tells you nothing on its
 * own; "4,213 of 10,000, and the bar is nearly full" tells you to go build a
 * silo. Three states get colour, because each is a mistake you can otherwise
 * make for hours without noticing:
 *
 * - **Amber above 90%** - you are about to start wasting production.
 * - **Red at capacity** - you *are* wasting production right now. The rate is
 *   replaced by the word FULL, because the rate has stopped being true.
 * - **Red energy** - every mine is throttled, which is why the rates dropped.
 */

import { StyleSheet, Text, View } from 'react-native';

import { GameImage } from '@/components/GameImage';
import { ProgressBar } from '@/components/ProgressBar';
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

/** Above this fraction of capacity we warn; at capacity we alarm. */
const NEARLY_FULL = 0.9;

export function ResourceBar({ planet, speed }: ResourceBarProps) {
  const production = computeProduction(planet, speed);
  const capacity = storageCapacities(planet.buildings);
  const { energy } = production;

  // Energy is a ratio, not a stockpile, so its "fill" is demand met. With
  // nothing to power there is no ratio to show: a full bar would imply the
  // grid is doing work it is not, so the idle case gets its own empty,
  // greyed-out treatment.
  const energyIdle = energy.consumed <= 0;
  const energyFill = energyIdle ? 0 : energy.produced / energy.consumed;
  const energyShort = energy.factor < 1;

  return (
    <View style={styles.bar}>
      <ResourceCell
        id="metal"
        icon="resource.metal"
        label="Metal"
        amount={planet.resources.metal}
        capacity={capacity.metal}
        rate={production.net.metal}
        color={resourceColor.metal}
      />
      <ResourceCell
        id="crystal"
        icon="resource.crystal"
        label="Crystal"
        amount={planet.resources.crystal}
        capacity={capacity.crystal}
        rate={production.net.crystal}
        color={resourceColor.crystal}
      />
      <ResourceCell
        id="deuterium"
        icon="resource.deuterium"
        label="Deut."
        amount={planet.resources.deuterium}
        capacity={capacity.deuterium}
        rate={production.net.deuterium}
        color={resourceColor.deuterium}
      />

      {/* Energy shows produced-over-consumed instead of an amount and a cap. */}
      <View style={styles.cell}>
        <View style={styles.head}>
          <GameImage id="resource.energy" size={13} label="" />
          <Text style={styles.name}>Energy</Text>
        </View>

        <Text
          testID="resource-energy-amount"
          style={[styles.amount, { color: energyShort ? colors.danger : colors.text }]}
          numberOfLines={1}
        >
          {formatNumber(energy.produced)}
          <Text style={styles.capacity}>/{formatNumber(energy.consumed)}</Text>
        </Text>

        <ProgressBar
          progress={energyFill}
          color={energyShort ? colors.danger : resourceColor.energy}
          label={
            energyIdle
              ? 'No energy demand'
              : `Energy ${Math.round(energyFill * 100)} percent of demand met`
          }
        />

        <Text
          testID="resource-energy-rate"
          style={[
            styles.rate,
            { color: energyShort ? colors.danger : energyIdle ? colors.textFaint : colors.success },
          ]}
          numberOfLines={1}
        >
          {energyShort ? formatPercentDelta(energy.factor) : energyIdle ? 'No demand' : 'Stable'}
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
  capacity: number;
  rate: number;
  color: string;
};

function ResourceCell({ id, icon, label, amount, capacity, rate, color }: ResourceCellProps) {
  const fill = capacity > 0 ? amount / capacity : 0;
  // A small float tolerance: `applyProduction` clamps to exactly the capacity,
  // but comparing floats for equality is a habit worth not forming.
  const full = amount >= capacity - 0.5;
  const nearlyFull = !full && fill >= NEARLY_FULL;

  const statusColor = full ? colors.danger : nearlyFull ? colors.warning : color;

  return (
    <View style={styles.cell}>
      <View style={styles.head}>
        <GameImage id={icon} size={13} label="" />
        <Text style={styles.name}>{label}</Text>
      </View>

      <Text
        testID={`resource-${id}-amount`}
        style={[styles.amount, { color: full ? colors.danger : colors.text }]}
        numberOfLines={1}
      >
        {formatNumber(amount)}
        <Text style={styles.capacity}>/{formatNumber(capacity)}</Text>
      </Text>

      <ProgressBar
        progress={fill}
        color={statusColor}
        label={`${label} storage ${Math.round(fill * 100)} percent full`}
      />

      <Text
        testID={`resource-${id}-rate`}
        style={[styles.rate, { color: statusColor }]}
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
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    gap: 3,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  name: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  amount: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  capacity: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '600',
  },
  rate: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
