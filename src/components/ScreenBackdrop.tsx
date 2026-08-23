/**
 * The starfield behind a screen's content.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS PER-SCREEN AND NOT ONE BACKDROP AT THE ROOT
 * ---------------------------------------------------------------------------
 * The obvious design is a single starfield behind the whole app, with every
 * tab screen transparent on top of it. That renders wrong: a bottom-tab
 * navigator keeps inactive screens mounted and merely pushes them to
 * `zIndex: -1`. Behind a *transparent* screen they are still visible, so the
 * Overview's planet and stats show through the Buildings list.
 *
 * Making each screen opaque fixes it - and since the screens all want the same
 * starfield anyway, the backdrop *is* the opacity. Each scene occupies exactly
 * the same rectangle, so the artwork lines up perfectly when you switch tabs;
 * there is no visible seam and nothing bleeds through.
 *
 * The `<View>` underneath the image is a solid colour on purpose: it guarantees
 * opacity even for the frame before the image has decoded.
 */

import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ASSETS } from '@/assets/manifest';
import { colors } from '@/lib/theme';

export function ScreenBackdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <Image
        source={ASSETS['ui.starfield']}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // Absolutely positioned so the artwork's intrinsic 1024x1024 size can
        // never contribute to layout. As an <ImageBackground> it made the web
        // document wider than the viewport.
        pointerEvents="none"
        accessibilityLabel=""
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
