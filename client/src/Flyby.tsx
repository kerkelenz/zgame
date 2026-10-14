import { useEffect, useRef } from 'react';
import { flybyPose, useMotion } from './motion';

/**
 * The other body of a planet and its moon, large, crossing the banner now and then as if in orbit. Every frame is worked out from the clock and
 * written as one GPU transform (no layout), so the glide is smooth; it stops with the tab and when Animation is not Full.
 */
export function Flyby({ src }: { src: string }) {
  const motion = useMotion();
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = wrap.current, box = el?.parentElement;
    if (motion !== 'full' || !el || !box) return;
    let raf = 0, w = box.clientWidth, h = box.clientHeight;
    const size = () => Math.max(56, w * 0.14);
    const fit = () => { w = box.clientWidth; h = box.clientHeight; el.style.width = el.style.height = `${size()}px`; };
    fit();
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    watch?.observe(box);
    const t0 = performance.now();
    const frame = (t: number) => {
      const pose = flybyPose(t - t0);
      if (!pose) el.style.opacity = '0';
      else {
        const s = size();
        el.style.opacity = String(Math.round(pose.opacity * 1000) / 1000);
        el.style.transform = `translate3d(${(pose.x * w - s / 2).toFixed(1)}px, ${(pose.y * h - s / 2).toFixed(1)}px, 0) scale(${pose.scale.toFixed(3)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); watch?.disconnect(); };
  }, [motion, src]);
  return <span className="flyby" aria-hidden="true"><span className="flywrap" ref={wrap}><img src={src} alt="" draggable={false} /></span></span>;
}
