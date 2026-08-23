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
 * - Tiles and icons are told apart automatically, so no call site has to
 *   remember which keys need a card behind them.
 */

import { Image } from 'expo-image';
import { StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

import { ASSETS, isIconKey, type AssetKey } from '@/assets/manifest';
import { colors, radius } from '@/lib/theme';

type GameImageProps = {
  id: AssetKey;
  size: number;
  style?: StyleProp<ImageStyle>;
  /** Alt text for screen readers and the web build. */
  label?: string;
  /**
   * Recolour a monochrome glyph.
   *
   * The `ui.*` icons are generated as white shapes on transparent backgrounds
   * precisely so one asset can carry several meanings: `ui.warning` is amber
   * when you simply cannot afford something and red when it is outright
   * blocked. Tinting a *tile* would flatten it to a silhouette, so this is
   * meant for icons only.
   */
  tintColor?: string;
};

export function GameImage({ id, size, style, label, tintColor }: GameImageProps) {
  const source = ASSETS[id];

  // Icons are transparent glyphs and must not get a card behind them; tiles are
  // framed artwork and look unfinished without one.
  const isIcon = isIconKey(id);

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
        style={[styles.tile, { width: size, height: size }, style]}
        contentFit="cover"
        accessibilityLabel={label ?? 'Missing artwork'}
      />
    );
  }

  return (
    <Image
      source={source}
      style={[isIcon ? styles.icon : styles.tile, { width: size, height: size }, style]}
      contentFit="contain"
      tintColor={tintColor}
      // Placeholder art has hard pixel edges; a cross-fade on every mount would
      // just look like a flicker in a list.
      transition={0}
      accessibilityLabel={label ?? id}
    />
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  icon: {
    backgroundColor: 'transparent',
  },
});
