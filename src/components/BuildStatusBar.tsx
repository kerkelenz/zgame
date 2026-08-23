/**
 * A one-line "what is happening right now" strip, shown under the resource bar
 * on every screen.
 *
 * The Overview already lists the build queue in full, but you spend most of
 * your time on the Buildings tab deciding what to do next - and that decision
 * depends on when the current build lands. Repeating it here, always visible,
 * removes a tab round-trip from the most common loop in the game.
 *
 * When nothing is building it does not disappear. An empty strip that says
 * "Nothing under construction" is doing real work: an idle planet is a planet
 * wasting time, and silence would hide that.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GameImage } from '@/components/GameImage';
import { ProgressBar } from '@/components/ProgressBar';
import { BUILDINGS, buildProgress, type Planet } from '@/engine';
import { formatDuration } from '@/lib/format';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type BuildStatusBarProps = {
  planet: Planet;
};

export function BuildStatusBar({ planet }: BuildStatusBarProps) {
  // Its own once-a-second clock, for the same reason `Countdown` has one: this
  // is a *display* of time passing. The store's tick is what actually advances
  // the world, and the two are deliberately independent - a screen that is not
  // mounted must never stop the simulation.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const item = planet.queue[0];

  if (!item) {
    return (
      <View style={[styles.strip, styles.idleStrip]} testID="build-status-idle">
        <GameImage id="ui.build" size={13} tintColor={colors.textFaint} label="" />
        <Text style={styles.idleText}>Nothing under construction</Text>
      </View>
    );
  }

  const progress = buildProgress(item, now);
  const remaining = Math.max(0, Math.ceil((item.finishesAt - now) / 1000));
  const definition = BUILDINGS[item.buildingId];

  return (
    <View style={styles.strip} testID="build-status-active">
      <GameImage id="ui.build" size={14} tintColor={colors.accent} label="" />

      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>
            {definition.name} <Text style={styles.target}>→ Lv {item.targetLevel}</Text>
          </Text>
          <Text style={styles.remaining} testID="build-status-remaining">
            {formatDuration(remaining)}
          </Text>
        </View>

        <ProgressBar
          progress={progress}
          color={colors.accent}
          height={5}
          label={`${definition.name} construction ${Math.round(progress * 100)} percent complete`}
        />
      </View>

      {/* The percentage is redundant with the bar on purpose: the bar is for
          glancing, the number is for comparing against a moment ago. */}
      <Text style={styles.percent}>{Math.round(progress * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent + '55',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  idleStrip: {
    borderColor: colors.border,
    justifyContent: 'center',
  },
  idleText: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    letterSpacing: 0.3,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  target: {
    color: colors.accent,
    fontWeight: '700',
  },
  remaining: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  percent: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'right',
  },
});
