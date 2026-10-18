export let state = null;
export let soundEnabled = true;

const $ = id => document.getElementById(id);

// AudioContext 延遲到第一次真正需要播放音效時才建立（通常是在使用者點擊之後），
// 避免瀏覽器在載入階段就跳出 "AudioContext was not allowed to start" 警告。
let audioCtx = null;
function getAudioCtx() {
  if(audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  try { audioCtx = new AC(); } catch(e) { audioCtx = null; }
  return audioCtx;
}

export function playSound(type) {
  if(!soundEnabled) return;
  const ctx = getAudioCtx();
  if(!ctx) return;
  if(ctx.state === 'suspended') ctx.resume();
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if(type === 'place') {
      osc.frequency.setValueAtTime(220, now); osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
      gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if(type === 'coin') {
      osc.frequency.setValueAtTime(659.25, now);
      gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } else if(type === 'win') {
      osc.frequency.setValueAtTime(523.25, now);
      gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    }
  } catch(e) {}
}

export function setSoundEnabled(val) { soundEnabled = val; }
export function setState(newState) { state = newState; }

export function message(text, error = false, success = false) {
  let el = $('message');
  if(el) {
    el.textContent = text;
    el.className = 'message' + (error ? ' error' : success ? ' success' : '');
  }
}
