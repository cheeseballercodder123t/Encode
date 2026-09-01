// Utility for gamified Web Audio chimes without external assets
class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playBeep(freq: number, type: OscillatorType = 'sine', duration: number = 0.12, gainLevel: number = 0.08) {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio playback fails gracefully if browser blocks before user gesture
    }
  }

  playSuccess() {
    this.playBeep(523.25, 'triangle', 0.1, 0.06); // C5
    setTimeout(() => this.playBeep(659.25, 'triangle', 0.1, 0.06), 80); // E5
    setTimeout(() => this.playBeep(783.99, 'triangle', 0.2, 0.07), 160); // G5
  }

  playLevelUp() {
    this.playBeep(440.00, 'sine', 0.1, 0.08); // A4
    setTimeout(() => this.playBeep(554.37, 'sine', 0.1, 0.08), 90); // C#5
    setTimeout(() => this.playBeep(659.25, 'sine', 0.12, 0.08), 180); // E5
    setTimeout(() => this.playBeep(880.00, 'sine', 0.35, 0.09), 270); // A5
  }

  playKeywordMatch() {
    this.playBeep(880, 'sine', 0.08, 0.04);
    setTimeout(() => this.playBeep(1174.66, 'sine', 0.12, 0.05), 60);
  }
}

export const sound = new SoundFX();

export function playSound(type: 'success' | 'levelUp' | 'correct' | 'wrong' | 'error' | 'click' | 'whoosh' | 'beep' | 'streak' | 'pop' | 'ding') {
  switch (type) {
    case 'success':
    case 'correct':
    case 'streak':
    case 'ding':
      sound.playSuccess();
      break;
    case 'levelUp':
      sound.playLevelUp();
      break;
    case 'wrong':
    case 'error':
      sound.playBeep(220, 'sawtooth', 0.2, 0.08);
      break;
    case 'click':
    case 'pop':
      sound.playBeep(600, 'sine', 0.05, 0.04);
      break;
    case 'whoosh':
      sound.playBeep(350, 'triangle', 0.12, 0.05);
      break;
    case 'beep':
    default:
      sound.playBeep(520, 'sine', 0.08, 0.06);
      break;
  }
}
