/**
 * Overview: the planet at a glance.
 *
 * Four panels, ordered by how often you need them:
 *
 *   1. **Construction** - what is happening right now, with a progress bar and
 *      the cancel button. Top of the screen because it is the live thing.
 *   2. **Production** - what you earn per hour, per resource, and whether an
 *      energy shortage is quietly taking a cut of it.
 *   3. **Storage** - how close each silo is to overflowing, as bars.
 *   4. **Planet data** - the slow-changing facts, with the deuterium climate
 *      bonus spelled out rather than left for the player to infer.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { planetArtKey, planetType, type AssetKey } from '@/assets/manifest';
import { Countdown } from '@/components/Countdown';
import { GameImage } from '@/components/GameImage';
import { ProgressBar } from '@/components/ProgressBar';
import { ScreenBackdrop } from '@/components/ScreenBackdrop';
import { StatusChip } from '@/components/StatusChip';
import {
  BUILDINGS,
  averageTemperature,
  buildProgress,
  computeProduction,
  storageCapacities,
  type Planet,
} from '@/engine';
import { formatCoords, formatExact, formatNumber, formatRate } from '@/lib/format';
import { colors, fontSize, radius, resourceColor, spacing } from '@/lib/theme';
import { useActivePlanet, useGameStore, useSpeed } from '@/state/gameStore';

/** Plain-English name for each climate, shown as a badge under the planet art. */
const PLANET_TYPE_LABEL = {
  temperate: 'Temperate',
  desert: 'Desert',
  ice: 'Ice world',
  gas: 'Gas giant',
} as const;

/** Above this fraction of capacity we warn; at capacity we alarm. */
const NEARLY_FULL = 0.9;

export default function OverviewScreen() {
  const planet = useActivePlanet();
  const speed = useSpeed();
  const cancelBuild = useGameStore((s) => s.cancelBuild);

  if (!planet) return null;

  const queued = planet.queue[0];
  const production = computeProduction(planet, speed);
  const capacity = storageCapacities(planet.buildings);
  const avgTemp = averageTemperature(planet);
  const energyShort = production.energy.factor < 1;
  // Nothing powered yet: an empty bar is honest, a full one is not.
  const energyIdle = production.energy.consumed <= 0;
  const energyFill = energyIdle ? 0 : production.energy.produced / production.energy.consumed;

  // The same factor the deuterium formula applies, surfaced as a readable
  // multiplier so a cold planet's advantage is visible rather than folded
  // invisibly into the output number.
  const deuteriumBonus = Math.max(0, 1.44 - 0.004 * avgTemp);

  return (
    <ScreenBackdrop>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ---- Hero ---- */}
        <View style={styles.hero}>
          {/* The art is derived from the planet's own temperature and position,
              so it is stable across launches without being stored in the save. */}
          <GameImage id={planetArtKey(planet)} size={116} label={`${planet.name} surface`} />
          <Text style={styles.planetName}>{planet.name}</Text>
          <View style={styles.heroBadges}>
            <StatusChip
              icon="ui.coords"
              label={formatCoords(planet.coords)}
              color={colors.accent}
            />
            <StatusChip
              icon="ui.planet"
              label={PLANET_TYPE_LABEL[planetType(planet)]}
              color={colors.success}
            />
          </View>
        </View>

        {/* ---- Construction ---- */}
        <Panel icon="ui.build" title="Construction">
          {queued ? (
            <ConstructionPanel planet={planet} onCancel={() => cancelBuild(planet.id)} />
          ) : (
            <View style={styles.emptyRow}>
              <GameImage id="ui.time" size={14} tintColor={colors.textFaint} label="" />
              <Text style={styles.empty}>
                Nothing under construction. Open the Buildings tab to start something.
              </Text>
            </View>
          )}
        </Panel>

        {/* ---- Production ---- */}
        <Panel
          icon="ui.production"
          title="Production per hour"
          badge={
            energyShort ? (
              <StatusChip
                icon="ui.warning"
                label={`${Math.round((1 - production.energy.factor) * 100)}% lost`}
                tone="warning"
              />
            ) : energyIdle ? (
              <StatusChip icon="ui.check" label="No demand" tone="neutral" />
            ) : (
              <StatusChip icon="ui.check" label="Full power" tone="ready" />
            )
          }
        >
          <RateRow
            icon="resource.metal"
            label="Metal"
            net={production.net.metal}
            gross={production.gross.metal}
            color={resourceColor.metal}
          />
          <RateRow
            icon="resource.crystal"
            label="Crystal"
            net={production.net.crystal}
            gross={production.gross.crystal}
            color={resourceColor.crystal}
          />
          <RateRow
            icon="resource.deuterium"
            label="Deuterium"
            net={production.net.deuterium}
            gross={production.gross.deuterium}
            color={resourceColor.deuterium}
          />

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <GameImage id="resource.energy" size={14} label="" />
              <Text style={styles.rowLabelText}>Energy</Text>
            </View>
            <Text
              style={[styles.rowValue, { color: energyShort ? colors.danger : colors.success }]}
            >
              {formatNumber(production.energy.produced)} of{' '}
              {formatNumber(production.energy.consumed)} needed
            </Text>
          </View>
          <ProgressBar
            progress={energyFill}
            color={energyShort ? colors.danger : colors.energy}
            height={6}
            label={`Energy ${Math.round(energyFill * 100)} percent of demand met`}
          />
          <Text style={styles.hint}>
            {energyShort
              ? 'Every mine runs at reduced output while energy is short. Upgrade the Solar Plant to recover it.'
              : energyIdle
                ? 'Nothing draws power yet. Mines will, so build a Solar Plant alongside them.'
                : 'All mines are running at full output.'}
          </Text>
        </Panel>

        {/* ---- Storage ---- */}
        <Panel icon="ui.storage" title="Storage">
          <StorageRow
            icon="resource.metal"
            label="Metal"
            amount={planet.resources.metal}
            capacity={capacity.metal}
            color={resourceColor.metal}
          />
          <StorageRow
            icon="resource.crystal"
            label="Crystal"
            amount={planet.resources.crystal}
            capacity={capacity.crystal}
            color={resourceColor.crystal}
          />
          <StorageRow
            icon="resource.deuterium"
            label="Deuterium"
            amount={planet.resources.deuterium}
            capacity={capacity.deuterium}
            color={resourceColor.deuterium}
          />
          <Text style={styles.hint}>
            Production stops dead once a silo is full. Upgrade that resource&apos;s storage building
            to raise the ceiling.
          </Text>
        </Panel>

        {/* ---- Planet data ---- */}
        <Panel icon="ui.planet" title="Planet data">
          <StatRow icon="ui.coords" label="Coordinates" value={formatCoords(planet.coords)} />
          <StatRow
            icon="ui.diameter"
            label="Diameter"
            value={`${formatExact(planet.diameter)} km`}
          />
          <StatRow
            icon="ui.temperature"
            label="Temperature"
            value={`${planet.temperature.min}°C to ${planet.temperature.max}°C`}
          />
          <StatRow
            icon="ui.temperature"
            label="Average"
            value={`${avgTemp}°C`}
            note={`Deuterium ×${deuteriumBonus.toFixed(2)}`}
            noteColor={deuteriumBonus >= 1 ? colors.success : colors.warning}
          />
          <Text style={styles.hint}>
            Colder worlds condense deuterium faster — that multiplier is applied to the
            synthesizer&apos;s output.
          </Text>
        </Panel>

        <ResetGameButton />
      </ScrollView>
    </ScreenBackdrop>
  );
}

/** A titled card with an icon and an optional right-hand badge. */
function Panel({
  icon,
  title,
  badge,
  children,
}: {
  icon: AssetKey;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.rowLabel}>
          <GameImage id={icon} size={13} tintColor={colors.textMuted} label="" />
          <Text style={styles.panelTitle}>{title}</Text>
        </View>
        {badge}
      </View>
      {children}
    </View>
  );
}

/** The live build: art, target level, progress bar, countdown, cancel. */
function ConstructionPanel({ planet, onCancel }: { planet: Planet; onCancel: () => void }) {
  // The panel keeps its own once-a-second clock. Reading `Date.now()` straight
  // out of render would be impure - React (and the React Compiler, which is on
  // for this project) is free to re-run or memoise a render, so a value that
  // changes on every call has to live in state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const item = planet.queue[0];
  const definition = BUILDINGS[item.buildingId];
  const progress = buildProgress(item, now);

  return (
    <View testID="build-queue-item" style={styles.queueBlock}>
      <View style={styles.queueItem}>
        <GameImage id={`building.${item.buildingId}`} size={46} label={definition.name} />
        <View style={styles.queueText}>
          <Text style={styles.queueName}>
            {definition.name} <Text style={styles.queueTarget}>→ level {item.targetLevel}</Text>
          </Text>
          <View style={styles.rowLabel}>
            <GameImage id="ui.time" size={11} tintColor={colors.accent} label="" />
            <Countdown finishesAt={item.finishesAt} style={styles.countdown} />
          </View>
        </View>
        <Pressable
          testID="cancel-build"
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel construction and refund the full cost"
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
        >
          <GameImage id="ui.cancel" size={11} tintColor={colors.danger} label="" />
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      <ProgressBar progress={progress} color={colors.accent} height={7} />
      <Text style={styles.hint}>
        {Math.round(progress * 100)}% complete — cancelling refunds the full cost.
      </Text>
    </View>
  );
}

/** `[icon] Metal ............ +1.2k/h  (+2.4k/h struck through, if throttled)` */
function RateRow({
  icon,
  label,
  net,
  gross,
  color,
}: {
  icon: AssetKey;
  label: string;
  net: number;
  gross: number;
  color: string;
}) {
  // Only worth showing both numbers when they actually differ. When they do,
  // the struck-through figure is the single clearest way to say "you are losing
  // this much to the power shortage".
  const throttled = gross - net > 0.5;

  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <GameImage id={icon} size={14} label="" />
        <Text style={styles.rowLabelText}>{label}</Text>
      </View>
      <View style={styles.rowValueGroup}>
        {throttled && <Text style={styles.strikethrough}>{formatRate(gross)}</Text>}
        <Text style={[styles.rowValue, { color: throttled ? colors.danger : color }]}>
          {formatRate(net)}
        </Text>
      </View>
    </View>
  );
}

/** `[icon] Metal   4.2k / 10k` plus a fill bar. */
function StorageRow({
  icon,
  label,
  amount,
  capacity,
  color,
}: {
  icon: AssetKey;
  label: string;
  amount: number;
  capacity: number;
  color: string;
}) {
  const fill = capacity > 0 ? amount / capacity : 0;
  const full = amount >= capacity - 0.5;
  const nearlyFull = !full && fill >= NEARLY_FULL;
  const barColor = full ? colors.danger : nearlyFull ? colors.warning : color;

  return (
    <View style={styles.storageRow}>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <GameImage id={icon} size={14} label="" />
          <Text style={styles.rowLabelText}>{label}</Text>
        </View>
        <View style={styles.rowValueGroup}>
          {full && <StatusChip icon="ui.warning" label="Full" tone="blocked" />}
          <Text style={[styles.rowValue, { color: barColor }]}>
            {formatNumber(amount)} / {formatNumber(capacity)}
          </Text>
        </View>
      </View>
      <ProgressBar
        progress={fill}
        color={barColor}
        label={`${label} storage ${Math.round(fill * 100)} percent full`}
      />
    </View>
  );
}

function StatRow({
  icon,
  label,
  value,
  note,
  noteColor,
}: {
  icon: AssetKey;
  label: string;
  value: string;
  note?: string;
  noteColor?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <GameImage id={icon} size={13} tintColor={colors.textFaint} label="" />
        <Text style={styles.rowLabelText}>{label}</Text>
      </View>
      <View style={styles.rowValueGroup}>
        <Text style={styles.rowValue}>{value}</Text>
        {note && <Text style={[styles.note, noteColor ? { color: noteColor } : null]}>{note}</Text>}
      </View>
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
      <View style={styles.rowLabel}>
        <GameImage id="ui.warning" size={14} tintColor={colors.danger} label="" />
        <Text style={styles.confirmTitle}>Delete this empire?</Text>
      </View>
      <Text style={styles.confirmText}>
        Your planet, buildings and resources are wiped and a new game starts. This cannot be undone.
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
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  planetName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  panelTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowLabelText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  rowValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  rowValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  strikethrough: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  note: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  storageRow: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  hint: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  queueBlock: {
    gap: spacing.sm,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  queueText: {
    flex: 1,
    gap: spacing.xs,
  },
  queueName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  queueTarget: {
    color: colors.accent,
    fontWeight: '700',
  },
  countdown: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  empty: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    lineHeight: 20,
    flex: 1,
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
    gap: spacing.sm,
  },
  confirmTitle: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  confirmText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
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
