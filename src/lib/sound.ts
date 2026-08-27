let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType = "sine",
  peak = 0.08,
) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t = ac.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sfx = {
  click() {
    tone(540, 0, 0.08, "triangle", 0.05);
  },
  correct() {
    tone(660, 0, 0.12, "sine", 0.07);
    tone(880, 0.09, 0.16, "sine", 0.07);
  },
  wrong() {
    tone(220, 0, 0.16, "sawtooth", 0.045);
    tone(180, 0.1, 0.2, "sawtooth", 0.04);
  },
  timeout() {
    tone(330, 0, 0.1, "square", 0.03);
    tone(247, 0.1, 0.18, "square", 0.03);
  },
  finish(good: boolean) {
    if (good) {
      tone(523, 0, 0.14, "sine", 0.07);
      tone(659, 0.12, 0.14, "sine", 0.07);
      tone(784, 0.24, 0.22, "sine", 0.08);
    } else {
      tone(392, 0, 0.16, "sine", 0.06);
      tone(330, 0.14, 0.24, "sine", 0.06);
    }
  },
};
