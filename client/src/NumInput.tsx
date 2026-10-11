import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { caretAfterDigits, countDigits, groupInt, parseGrouped } from '../../shared/numfmt';
import { getLang, useLang } from './i18n';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  /** show an empty field instead of 0 */
  blankZero?: boolean;
}

/** A whole-number field that groups the digits as you type (2000000 becomes 2,000,000, or 2.000.000 in German) and keeps the caret where it was. */
export function NumInput({ value, onChange, min = 0, max, blankZero, ...rest }: Props) {
  useLang();
  const ref = useRef<HTMLInputElement>(null);
  const digitsBefore = useRef<number | null>(null);
  const [cleared, setCleared] = useState(false);                     // the player emptied the field: show it empty while they type, not 0
  const text = cleared || (blankZero && !value) ? '' : groupInt(value, getLang());
  useLayoutEffect(() => {
    if (digitsBefore.current !== null && ref.current && document.activeElement === ref.current) {
      const pos = caretAfterDigits(text, digitsBefore.current);
      ref.current.setSelectionRange(pos, pos);
    }
    digitsBefore.current = null;
  });
  return (
    <input {...rest} ref={ref} type="text" inputMode="numeric" autoComplete="off" value={text}
      onFocus={(e) => e.target.select()} onBlur={() => setCleared(false)}
      onChange={(e) => {
        const raw = e.target.value;
        digitsBefore.current = countDigits(raw.slice(0, e.target.selectionStart ?? raw.length));
        setCleared(parseGrouped(raw) === null);
        let n = parseGrouped(raw) ?? 0;
        n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
      }} />
  );
}
