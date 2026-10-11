/** Thousands separators for number inputs, so 2000000 reads as 2,000,000 (2.000.000 in German). */
export const LOCALES: Record<string, string> = { en: 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR' };

export const groupInt = (n: number, lang = 'en'): string => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)).toLocaleString(LOCALES[lang] ?? 'en-US');

/** the whole number typed into a field, ignoring any separators, spaces and letters; null when no digit is left */
export function parseGrouped(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits ? Math.min(Number.MAX_SAFE_INTEGER, Number(digits)) : null;
}

export const countDigits = (s: string) => (s.match(/\d/g) ?? []).length;

/** where the caret goes in a freshly formatted text so it stays after the same digit */
export function caretAfterDigits(formatted: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) if (/\d/.test(formatted[i]) && ++seen === digits) return i + 1;
  return formatted.length;
}
