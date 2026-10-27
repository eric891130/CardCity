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

    if(type === 'place') { // 放置建築
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now); osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
      gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);

    } else if(type === 'coin') { // 獲得金幣
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);

    } else if(type === 'win') { // 任務完成 / 成功
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.25);
      gain.gain.setValueAtTime(0.12, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);

    } else if(type === 'error' || type === 'warn') { // 錯誤或警告音效（低沉鋸齒波下降）
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now); osc.frequency.linearRampToValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);

    } else if(type === 'demolish') { // 拆除建築（低沉木質感打擊音）
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);

    } else if(type === 'upgrade') { // 建築升級（兩段式升音）
      osc.type = 'sine';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.setValueAtTime(440, now + 0.08);
      osc.frequency.setValueAtTime(660, now + 0.16);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.start(now); osc.stop(now + 0.28);
    } else if(type === 'page') { // 模擬紙張翻頁的摩擦/刷動音效 (White Noise + Bandpass Filter)      
      const bufferSize = ctx.sampleRate * 0.08; // 80毫秒短促音效
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(400, now + 0.08);
      filter.Q.value = 3;

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      noise.connect(filter);
      filter.connect(gain);
      noise.start(now);
      noise.stop(now + 0.08);
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
