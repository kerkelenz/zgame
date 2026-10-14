import type { ReactNode } from 'react';
import { resName } from '../../shared/data';
import { artFile } from './artFiles';

export type ResKey = 'metal' | 'crystal' | 'deuterium';

/** Hand-drawn SVG pictures for the three resources: steel ingots, a cut crystal and a glowing canister of Vespene gas. */
export function ResIcon({ k, size = 16, title }: { k: ResKey; size?: number; title?: string }) {
  const label = title ?? resName(k);
  const pic = artFile('res-' + k);
  if (pic) return <img src={pic} width={size} height={size} className="ri" alt={label} title={label} style={{ borderRadius: 3, objectFit: 'cover' }} />;
  const common = { width: size, height: size, viewBox: '0 0 24 24', className: 'ri', role: 'img', 'aria-label': label } as const;
  if (k === 'metal') {
    return (
      <svg {...common}>
        <title>{label}</title>
        <defs>
          <linearGradient id="ri-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e4e9f2" /><stop offset="0.55" stopColor="#9aa6bd" /><stop offset="1" stopColor="#5d6882" /></linearGradient>
        </defs>
        <g stroke="#2a3144" strokeWidth="0.9" strokeLinejoin="round" fill="url(#ri-metal)">
          <path d="M2.5 21 L4.6 14.6 H12.4 L14.5 21 Z" />
          <path d="M9.5 21 L11.6 14.6 H19.4 L21.5 21 Z" />
          <path d="M6 13.6 L8.1 7.2 H15.9 L18 13.6 Z" />
        </g>
        <g stroke="#fff" strokeOpacity="0.65" strokeWidth="0.9" strokeLinecap="round">
          <path d="M5.8 16 H11.2" /><path d="M12.8 16 H18.2" /><path d="M9.3 9 H14.7" />
        </g>
      </svg>
    );
  }
  if (k === 'crystal') {
    return (
      <svg {...common}>
        <title>{label}</title>
        <defs>
          <linearGradient id="ri-crystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c8f4ff" /><stop offset="0.5" stopColor="#4cc3ee" /><stop offset="1" stopColor="#2459c9" /></linearGradient>
        </defs>
        <path d="M12 1.8 L20.2 9 L12 22.2 L3.8 9 Z" fill="url(#ri-crystal)" stroke="#173a82" strokeWidth="0.9" strokeLinejoin="round" />
        <g stroke="#fff" strokeOpacity="0.75" strokeWidth="0.8" strokeLinejoin="round" fill="none">
          <path d="M3.8 9 H20.2" /><path d="M8 9 L12 1.8 L16 9" /><path d="M8 9 L12 22.2" /><path d="M16 9 L12 22.2" />
        </g>
        <path d="M7.4 7.6 L10 4.4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <title>{label}</title>
      <defs>
        <radialGradient id="ri-gas-glow" cx="0.5" cy="0.55" r="0.55"><stop offset="0" stopColor="#7dff4a" stopOpacity="0.85" /><stop offset="1" stopColor="#7dff4a" stopOpacity="0" /></radialGradient>
        <linearGradient id="ri-gas" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1f7a2a" /><stop offset="0.45" stopColor="#7be95a" /><stop offset="1" stopColor="#1a6a2a" /></linearGradient>
      </defs>
      <circle cx="12" cy="13" r="11" fill="url(#ri-gas-glow)" />
      <path d="M9 2.5 C7.5 4.2 10.8 5 9.4 6.6" stroke="#8dff6b" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeOpacity="0.9" />
      <path d="M13.8 1.8 C12.4 3.6 15.6 4.4 14.3 6.2" stroke="#8dff6b" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeOpacity="0.9" />
      <rect x="10" y="6.4" width="4" height="2.6" rx="0.6" fill="#8a94a8" stroke="#2a3144" strokeWidth="0.8" />
      <rect x="6.4" y="8.6" width="11.2" height="12.6" rx="3.2" fill="url(#ri-gas)" stroke="#12401b" strokeWidth="0.9" />
      <rect x="6.4" y="12.6" width="11.2" height="3" fill="#0f3a18" fillOpacity="0.55" />
      <path d="M8.6 10.6 V19" stroke="#e8ffd9" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}

/** Icon followed by a value or name, in the resource's colour class. */
export function Res({ k, children, size = 16 }: { k: ResKey; children?: ReactNode; size?: number }) {
  return <span className={k === 'deuterium' ? 'deut' : k}><ResIcon k={k} size={size} />{children}</span>;
}
