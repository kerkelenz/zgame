/**
 * The single way the app displays game art.
 *
 * Every image goes through here rather than a bare `<Image source={require(...)}>`
 * so that:
 *
 * - Screens name assets by *key* (`"building.metalMine"`), never by file path.
 *   Swapping placeholder art for real art is then a one-line manifest change.
 * - A missing key degrades to an obvious magenta checkerboard instead of a
 *   blank space or a red-screen crash.
 * - Sizing is uniform: one `size` prop drives a square, so a grid of buildings
 *   cannot end up ragged because one asset has a different aspect ratio.
 */

import { Image } from 'expo-image';
import { StyleSheet, type StyleProp, type ImageStyle } from 'react-native';

import { ASSETS, type AssetKey } from '@/assets/manifest';
import { colors, radius } from '@/lib/theme';

type GameImageProps = {
  id: AssetKey;
  size: number;
  style?: StyleProp<ImageStyle>;
  /** Alt text for screen readers and the web build. */
  label?: string;
};

export function GameImage({ id, size, style, label }: GameImageProps) {
  const source = ASSETS[id];

  // `id` is typed as `AssetKey`, so in principle this cannot happen. In
  // practice keys arrive from data (a building id, a planet's derived art key),
  // and a stale save or a hand-edited manifest can produce one that is not
  // there. Fall back loudly in development, quietly in production.
  if (!source) {
    if (__DEV__) {
      console.warn(`[GameImage] Unknown asset key "${id}" - falling back to ui.missing`);
    }
    return (
      <Image
        source={ASSETS['ui.missing']}
        style={[styles.image, { width: size, height: size }, style]}
        contentFit="cover"
        accessibilityLabel={label ?? 'Missing artwork'}
      />
    );
  }

  return (
    <Image
      source={source}
      style={[styles.image, { width: size, height: size }, style]}
      contentFit="cover"
      // Placeholder art has hard pixel edges; a cross-fade on every mount would
      // just look like a flicker in a list.
      transition={0}
      accessibilityLabel={label ?? id}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
