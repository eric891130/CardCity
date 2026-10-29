// 鍵盤快速鍵：這裡只負責「按鍵 → 動作」的對應，實際動作由 main.js 傳入的 handlers 實作。
// SHORTCUT_LIST 同時是「快速鍵說明視窗」的內容來源，增減快速鍵時兩邊只要維護這個檔案。
//
// 刻意不使用 Space / Enter：它們是按鈕本身的啟動鍵，剛點過的按鈕仍有焦點時，
// 按下去會同時觸發該按鈕，造成重複操作。
export const SHORTCUT_LIST = [
  { keys: ['1–9', '0'], desc: '選擇手牌第 1–10 張（再按一次取消選取）', scope: '城市' },
  { keys: ['E'], desc: '結束回合', scope: '城市' },
  { keys: ['D'], desc: '抽 1 張牌（3 ◈）', scope: '城市' },
  { keys: ['R'], desc: '刷新商店（2 ◈）', scope: '城市' },
  { keys: ['X'], desc: '拆除已選取的建築（不退款，需連按兩次確認）', scope: '城市' },
  { keys: ['B', 'T', 'C', 'M'], desc: '切換分頁：城市 / 科技 / 文化 / 任務' },
  { keys: ['Esc'], desc: '依序：關閉視窗 → 取消拆除確認 → 取消選牌 → 取消選取格子' },
  { keys: ['?', 'H'], desc: '開啟 / 關閉本說明' }
];

// 用 e.key（符合鍵盤配置）；輸入法啟用時 key 會是 "Process"，這時改用實體按鍵 e.code
function normalizeKey(e) {
  let k = e.key;
  if (!k || k === 'Process' || k === 'Unidentified' || k === 'Dead') {
    const code = e.code || '';
    if (/^Key[A-Z]$/.test(code)) k = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) k = code.slice(5);
    else return null;
  }
  return k.toLowerCase();
}

// 回傳 true 代表這個按鍵已被處理（會呼叫 preventDefault）
function dispatch(key, h) {
  if (h.isModalOpen()) {
    // 視窗開啟時只處理「關閉」，其餘按鍵一律不動作（避免在視窗後面誤結束回合）
    if (key === 'escape') { h.closeModal(); return true; }
    if ((key === '?' || key === 'h') && h.isHelpOpen()) { h.closeModal(); return true; }
    return false;
  }
  if (/^[0-9]$/.test(key)) { h.selectSlot(key === '0' ? 9 : Number(key) - 1); return true; }
  switch (key) {
    case 'e': h.endTurn(); return true;
    case 'd': h.draw(); return true;
    case 'r': h.refreshShop(); return true;
    case 'x': h.demolish(); return true;
    case 'b': h.tab('city'); return true;
    case 't': h.tab('tech'); return true;
    case 'c': h.tab('culture'); return true;
    case 'm': h.tab('missions'); return true;
    case 'escape': h.escape(); return true;
    case '?': case 'h': h.toggleHelp(); return true;
  }
  return false;
}

export function initKeyboard(handlers) {
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.repeat) return;                 // 輸入法組字中 / 長按連發：忽略
    if (e.ctrlKey || e.metaKey || e.altKey) return;        // 不攔截瀏覽器自己的快速鍵（Ctrl+R 等）
    const t = e.target;
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    const key = normalizeKey(e);
    if (key && dispatch(key, handlers)) e.preventDefault();
  });
}
