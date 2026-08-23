/**
 * A small icon-plus-text pill.
 *
 * The whole point is to answer "what is the state of this thing?" in one
 * glance, three ways at once: a shape (the icon), a colour, and a word. Any one
 * of those alone fails someone - colour alone fails colour-blind players, an
 * icon alone has to be learned, a word alone is slow to scan. Together they are
 * redundant on purpose.
 *
 * Also used, in its `tone="plain"` form, for the little labelled rows that make
 * up the stat panels: `[icon] Diameter ....... 12,800 km`.
 */

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GameImage } from '@/components/GameImage';
import type { AssetKey } from '@/assets/manifest';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

/** Semantic states, mapped to a colour in one place so they stay consistent. */
export type ChipTone = 'ready' | 'busy' | 'blocked' | 'warning' | 'neutral' | 'info';

const TONE_COLOR: Record<ChipTone, string> = {
  ready: colors.success,
  busy: colors.accent,
  blocked: colors.danger,
  warning: colors.warning,
  neutral: colors.textMuted,
  info: colors.accent,
};

type StatusChipProps = {
  icon: AssetKey;
  label: string;
  tone?: ChipTone;
  /** Overrides the tone's colour, for resource-identity chips. */
  color?: string;
  /** Drop the tinted background and padding: just icon + text. */
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Exposed as `data-testid` on web, for end-to-end assertions. */
  testID?: string;
};

export function StatusChip({
  icon,
  label,
  tone = 'neutral',
  color,
  plain = false,
  style,
  testID,
}: StatusChipProps) {
  const resolved = color ?? TONE_COLOR[tone];

  return (
    <View
      testID={testID}
      style={[
        plain ? styles.plain : styles.chip,
        !plain && { backgroundColor: tint(resolved) },
        style,
      ]}
      // One label for assistive tech, so a screen reader says "Ready", not
      // "image, Ready".
      accessible
      accessibilityLabel={label}
    >
      <GameImage id={icon} size={plain ? 12 : 11} tintColor={resolved} label="" />
      <Text style={[plain ? styles.plainText : styles.chipText, { color: resolved }]}>{label}</Text>
    </View>
  );
}

/**
 * A translucent wash of the chip's own colour for its background.
 *
 * Expressed as an 8-digit hex (`#RRGGBBAA`) rather than `rgba()` so it works
 * from the same palette strings the rest of the theme uses. `22` is about 13%
 * opacity: enough to read as a pill against the dark surface, not enough to
 * compete with the text on top of it.
 */
function tint(hex: string): string {
  return `${hex}22`;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  plain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  plainText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
