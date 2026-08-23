/**
 * The visual language: a dark space theme.
 *
 * Every colour and spacing value in the app comes from here. That is worth the
 * small indirection cost - when we later want a "red alert" theme, or a
 * high-contrast accessibility mode, or simply to make the blues less murky,
 * it is one file rather than a search-and-replace across every screen.
 *
 * The palette is deliberately dark and low-saturation, with the three resource
 * colours as the only strong hues. Resources are the numbers the player reads
 * constantly, so they get the visual priority; everything else recedes.
 */

export const colors = {
  /** Deep space. The starfield backdrop sits on top of this. */
  background: '#05070F',
  /** Panels and cards: one step lighter, so they lift off the background. */
  surface: '#101728',
  /** A pressed or selected surface. */
  surfaceRaised: '#1A2338',
  border: '#243049',

  text: '#E6EDF7',
  textMuted: '#8C9BB5',
  textFaint: '#5C6A85',

  /** Resource identity colours, reused by icons, bars and cost lines. */
  metal: '#B8C4D4',
  crystal: '#5FD3F3',
  deuterium: '#7CE7B0',
  energy: '#F5C451',

  accent: '#4C8DFF',
  danger: '#FF6B6B',
  success: '#5BD98A',
} as const;

/** A 4px spacing scale. Consistent rhythm without thinking about it. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
} as const;

/** Which palette colour belongs to which resource, for icon tints and text. */
export const resourceColor = {
  metal: colors.metal,
  crystal: colors.crystal,
  deuterium: colors.deuterium,
  energy: colors.energy,
} as const;
