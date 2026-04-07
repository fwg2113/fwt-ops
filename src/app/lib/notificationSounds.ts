// Notification sound generator using Web Audio API + custom upload support
// Built-in sounds are generated programmatically - no external files needed
// Custom sounds are stored in Supabase settings table as base64 data URLs

export type SoundKey = string; // built-in keys or 'custom:<id>' for uploads

export type SoundOption = {
  key: SoundKey;
  label: string;
  description: string;
  builtin: boolean;
};

export const BUILTIN_SOUNDS: SoundOption[] = [
  { key: 'chime', label: 'Chime', description: 'Pleasant two-tone chime', builtin: true },
  { key: 'bell', label: 'Bell', description: 'Warm bell tone', builtin: true },
  { key: 'alert', label: 'Alert', description: 'Double-beep alert', builtin: true },
  { key: 'soft-ding', label: 'Soft Ding', description: 'Gentle single ding', builtin: true },
  { key: 'triple-beep', label: 'Triple Beep', description: 'Three short beeps', builtin: true },
  { key: 'doorbell', label: 'Doorbell', description: 'Classic two-tone doorbell', builtin: true },
  { key: 'xylophone', label: 'Xylophone', description: 'Bright ascending notes', builtin: true },
  { key: 'radar', label: 'Radar', description: 'Pulsing radar ping', builtin: true },
  { key: 'cascade', label: 'Cascade', description: 'Cascading water drop tones', builtin: true },
  { key: 'urgent', label: 'Urgent', description: 'Fast escalating alarm', builtin: true },
  { key: 'marimba', label: 'Marimba', description: 'Warm wooden mallet tap', builtin: true },
  { key: 'sonar', label: 'Sonar', description: 'Deep submarine ping', builtin: true },
];

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(ctx: AudioContext, freq: number, startTime: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playFreqSweep(ctx: AudioContext, startFreq: number, endFreq: number, startTime: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playBuiltinSound(key: string) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  switch (key) {
    case 'chime':
      playTone(ctx, 784, now, 0.4, 'sine', 0.25);
      playTone(ctx, 1047, now + 0.15, 0.5, 'sine', 0.2);
      break;
    case 'bell':
      playTone(ctx, 880, now, 0.8, 'sine', 0.3);
      playTone(ctx, 1760, now, 0.6, 'sine', 0.1);
      break;
    case 'alert':
      playTone(ctx, 880, now, 0.15, 'square', 0.15);
      playTone(ctx, 880, now + 0.2, 0.15, 'square', 0.15);
      break;
    case 'soft-ding':
      playTone(ctx, 1200, now, 0.6, 'sine', 0.2);
      break;
    case 'triple-beep':
      playTone(ctx, 1000, now, 0.1, 'sine', 0.2);
      playTone(ctx, 1000, now + 0.15, 0.1, 'sine', 0.2);
      playTone(ctx, 1200, now + 0.3, 0.15, 'sine', 0.25);
      break;
    case 'doorbell':
      playTone(ctx, 659, now, 0.4, 'sine', 0.3);
      playTone(ctx, 523, now + 0.4, 0.6, 'sine', 0.25);
      break;
    case 'xylophone':
      playTone(ctx, 523, now, 0.2, 'sine', 0.25);
      playTone(ctx, 659, now + 0.12, 0.2, 'sine', 0.25);
      playTone(ctx, 784, now + 0.24, 0.2, 'sine', 0.25);
      playTone(ctx, 1047, now + 0.36, 0.4, 'sine', 0.3);
      break;
    case 'radar':
      playTone(ctx, 1400, now, 0.08, 'sine', 0.3);
      playTone(ctx, 1400, now + 0.5, 0.08, 'sine', 0.2);
      playTone(ctx, 1400, now + 1.0, 0.08, 'sine', 0.1);
      break;
    case 'cascade':
      playTone(ctx, 1600, now, 0.15, 'sine', 0.2);
      playTone(ctx, 1400, now + 0.08, 0.15, 'sine', 0.18);
      playTone(ctx, 1200, now + 0.16, 0.15, 'sine', 0.16);
      playTone(ctx, 1000, now + 0.24, 0.15, 'sine', 0.14);
      playTone(ctx, 800, now + 0.32, 0.25, 'sine', 0.12);
      break;
    case 'urgent':
      playFreqSweep(ctx, 600, 1200, now, 0.15, 'sawtooth', 0.12);
      playFreqSweep(ctx, 600, 1200, now + 0.18, 0.15, 'sawtooth', 0.14);
      playFreqSweep(ctx, 600, 1400, now + 0.36, 0.2, 'sawtooth', 0.16);
      break;
    case 'marimba':
      playTone(ctx, 523, now, 0.3, 'sine', 0.3);
      playTone(ctx, 1047, now, 0.15, 'sine', 0.1);
      playTone(ctx, 659, now + 0.2, 0.4, 'sine', 0.25);
      playTone(ctx, 1318, now + 0.2, 0.2, 'sine', 0.08);
      break;
    case 'sonar':
      playTone(ctx, 440, now, 1.2, 'sine', 0.25);
      playTone(ctx, 880, now, 0.6, 'sine', 0.08);
      break;
  }
}

let currentAudio: HTMLAudioElement | null = null;

export function playCustomSound(url: string) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  currentAudio = new Audio(url);
  currentAudio.volume = 0.5;
  currentAudio.play().catch(err => console.error('Failed to play custom sound:', err));
}

export function playSound(key: SoundKey, customSoundUrl?: string) {
  if (key.startsWith('custom:') && customSoundUrl) {
    playCustomSound(customSoundUrl);
  } else if (!key.startsWith('custom:')) {
    playBuiltinSound(key);
  }
}
