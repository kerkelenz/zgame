import { useEffect, useRef, useState } from 'react';

/** true for a moment after a number went up: a level reached, a ship delivered, a message arrived */
export const bumped = (prev: number | undefined, next: number) => prev !== undefined && next > prev;

export function useFlash(value: number, ms = 2500): boolean {
  const prev = useRef<number | undefined>(undefined);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const up = bumped(prev.current, value);
    prev.current = value;
    if (!up) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return on;
}

/** a level or count that glows briefly when it rises */
export function Flashing({ value, className = '', children }: { value: number; className?: string; children?: React.ReactNode }) {
  const on = useFlash(value);
  return <span className={`${className}${on ? ' flash' : ''}`}>{children ?? value}</span>;
}
