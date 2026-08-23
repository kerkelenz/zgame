/**
 * A horizontal fill bar.
 *
 * Used for two different jobs that look the same to the eye and should
 * therefore look the same on screen: *how full is this silo* and *how far
 * along is this build*. A number alone ("4,213 of 10,000") is something you
 * have to read and divide; a bar is something you take in without thinking.
 *
 * Deliberately dumb: it renders whatever fraction it is handed. Deciding what
 * the fraction means - and what colour it should be at 95% - belongs to the
 * screen, not to the bar.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/lib/theme';

type ProgressBarProps = {
  /** Fill fraction. Values outside [0, 1] are clamped rather than overflowing. */
  progress: number;
  color: string;
  height?: number;
  /** Track colour behind the fill. */
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
  /** Announced to screen readers, e.g. "Metal storage 42% full". */
  label?: string;
};

export function ProgressBar({
  progress,
  color,
  height = 4,
  trackColor = colors.track,
  style,
  label,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const percent = Math.round(clamped * 100);

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View
        style={[
          styles.fill,
          {
            // A percentage width rather than a measured pixel width: no layout
            // pass needed, so the bar is correct on its very first frame.
            width: `${percent}%`,
            backgroundColor: color,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.sm,
  },
  fill: {
    height: '100%',
  },
});
