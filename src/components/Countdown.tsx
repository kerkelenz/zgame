/**
 * A live countdown to a timestamp.
 *
 * Note what this component does *not* do: it does not advance the game. The
 * store's one-second clock is the single thing that moves the simulation
 * forward. This is purely a display that re-computes "how long is left" from
 * the same `finishesAt` the engine stores.
 *
 * Keeping the two separate matters. If the countdown drove completion, a
 * screen that was not mounted would never finish its builds - and the whole
 * point of storing absolute timestamps is that the world advances whether or
 * not anyone is looking at it.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { formatDuration } from '@/lib/format';
import { colors, fontSize } from '@/lib/theme';

type CountdownProps = {
  /** Target time, ms since epoch. */
  finishesAt: number;
  style?: StyleProp<TextStyle>;
  /** Shown once the target has passed. */
  doneLabel?: string;
};

export function Countdown({ finishesAt, style, doneLabel = 'Complete' }: CountdownProps) {
  // Storing "now" rather than "remaining" means the displayed value is always
  // derived fresh from the real clock. A stored countdown that decrements
  // itself drifts, because setInterval is not precise and gets throttled in
  // background tabs.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = finishesAt - now;
  if (remainingMs <= 0) {
    return <Text style={[styles.text, styles.done, style]}>{doneLabel}</Text>;
  }

  // Round *up*: with 400 ms left the honest answer is "1s", not "0s". A
  // countdown should never sit at zero while something is still pending.
  return (
    <Text style={[styles.text, style]}>{formatDuration(Math.ceil(remainingMs / 1000))}</Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.text,
    fontSize: fontSize.md,
    fontVariant: ['tabular-nums'], // stops the text jittering as digits change
  },
  done: {
    color: colors.success,
  },
});
