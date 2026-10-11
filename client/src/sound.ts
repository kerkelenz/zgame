/** Tiny WebAudio cues (no audio files). Opt-in from Settings; browsers only allow sound after a first click on the page. */
export const SOUND_KEY = 'sf.sound';
export const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; } };
export const setSound = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* ignore */ } };

let ctx: AudioContext | null = null;
function tone(freq: number, start: number, dur: number, vol = 0.06, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export type Cue = 'message' | 'alert' | 'done' | 'error';
export function playCue(cue: Cue, force = false) {
  if (!force && !soundOn()) return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    if (cue === 'alert') { tone(880, 0, 0.14, 0.09, 'square'); tone(660, 0.16, 0.14, 0.09, 'square'); tone(880, 0.32, 0.2, 0.09, 'square'); }
    else if (cue === 'message') { tone(740, 0, 0.12); tone(988, 0.1, 0.18); }
    else if (cue === 'done') { tone(523, 0, 0.1); tone(659, 0.09, 0.1); tone(784, 0.18, 0.2); }
    else tone(196, 0, 0.25, 0.07, 'sawtooth');
  } catch { /* audio unavailable */ }
}
