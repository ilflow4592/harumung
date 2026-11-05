/** 셔터 체감 효과. 짧은 '찰칵' 소리(WebAudio 합성)와 진동. 소리·진동을 못 쓰는 기기에서는 조용히 넘어간다. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 짧은 노이즈 버스트 두 번(찰·칵). 파일 없이 합성하므로 로딩이 없다. */
export function shutterSound(): void {
  const ac = audio();
  if (!ac) return;
  const click = (at: number, ms: number, gainPeak: number) => {
    const len = Math.round((ac.sampleRate * ms) / 1000);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(gainPeak, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + ms / 1000);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    src.connect(hp).connect(g).connect(ac.destination);
    src.start(at);
  };
  const now = ac.currentTime;
  click(now, 18, 0.5);
  click(now + 0.07, 28, 0.35);
}

export function vibrate(ms = 30): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 미지원 */
  }
}

export function shutterFeedback(): void {
  shutterSound();
  vibrate();
}
