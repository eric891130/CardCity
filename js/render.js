import { state } from './state.js';
import { CARDS, TERRAIN_NAMES, SHOP_ITEMS, OUTPUTS, RARITY_CONFIG } from './config.js';
import { canPlace, canAfford } from './game.js';
import { countBuilding, uniqueBuildingTypes } from './board.js';
import { describeCard } from './effects.js';

const $ = id => document.getElementById(id);

// 格子上的簡短標示：每回合資源 / 人口用「+數字＋圖示」，最終分數合計成「★數字」
export function formatBonus(s){
  const bits = []; let score = 0;
  for(const id in OUTPUTS){
    const v = s[id] || 0;
    if(!v) continue;
    if(OUTPUTS[id].group === 'score') score += v;
    else bits.push((v > 0 ? '+' : '') + v + OUTPUTS[id].icon);
  }
  if(score) bits.push('★' + score);
  return bits.join(' ');
}
// 建築資訊面板用的完整標示：「金幣 +4　糧食 +2」，只列出指定 group 的產出
function formatStats(s, groups){
  const bits = [];
  for(const id in OUTPUTS){
    const v = s[id] || 0;
    if(v && groups.includes(OUTPUTS[id].group)) bits.push(`${OUTPUTS[id].label} ${v > 0 ? '+' : ''}${v}`);
  }
  return bits.join('　');
}

export function renderBoard(onCellClick, onCellPointer, onCellLeave){
  const el=$('board');el.innerHTML='';
  hideCellTip();   // 格子會整批重建，舊的預覽提示一併收起
  const selCard = state.selected ? state.hand.find(h=>h.id===state.selected) : null;
  state.board.forEach(c=>{
    let b=document.createElement('button');
    let valid = !!selCard && canPlace(selCard, c);
    let isInspected = state.inspectedCell && state.inspectedCell.x === c.x && state.inspectedCell.y === c.y;

    b.className=`cell ${c.terrain} ${c.building?'occupied':'empty'}${valid?' selected':''}${isInspected?' inspected':''}`;
    if(valid) b.setAttribute('data-ghost', CARDS[selCard.type].emoji);   // 滑過時顯示半透明的建築預覽
    
    let terrainIcon={plain:'·',forest:'♣',water:'≈',mountain:'▲'}[c.terrain];
    b.innerHTML=`<span class="terrain">${terrainIcon}</span>${c.building?`<span class="emoji">${CARDS[c.building].emoji}</span><span class="bname">${CARDS[c.building].name}</span><span class="bonus">${formatBonus(c.stats)}</span>`:''}`;
    
    b.addEventListener('click',()=>{ if(onCellClick) onCellClick(c); });
    b.addEventListener('mouseenter',(ev)=>{ if(onCellPointer) onCellPointer(c, ev); });
    b.addEventListener('mousemove',(ev)=>{ if(onCellPointer) onCellPointer(c, ev); });
    b.addEventListener('mouseleave',()=>{ if(onCellLeave) onCellLeave(c); });
    el.appendChild(b);
  });
}

// ===== 放置預覽提示框 =====
const signed = n => (n > 0 ? '+' : '') + n;

// 預覽差值的列：[差值的 key, 圖示, 名稱]。糧食顯示「淨值」（產出 − 人口消耗），後面接「可用人口」。
function tipTurnRows(){
  const rows = [];
  for(const id in OUTPUTS){
    const o = OUTPUTS[id];
    if(o.group !== 'resource') continue;
    if(id === 'food'){ rows.push(['foodNet', o.icon, '糧食淨值']); rows.push(['freePop', OUTPUTS.population.icon, '可用人口']); }
    else rows.push([id, o.icon, o.label]);
  }
  return rows;
}
function tipScoreRows(){
  return Object.keys(OUTPUTS).filter(id => OUTPUTS[id].group === 'score').map(id => [id, OUTPUTS[id].icon, OUTPUTS[id].label]);
}
const tipRow = (cls, icon, label, v) => `<div class="tip-row ${cls}"><span>${icon} ${label}</span><b>${v}</b></div>`;

export function buildPlacementTip(card, cell, pv){
  const d = CARDS[card.type];
  let html = `<div class="tip-title">${d.emoji} ${d.name}<span class="tip-sub">${TERRAIN_NAMES[cell.terrain]} (${cell.x}, ${cell.y})</span></div>`;
  html += `<div class="tip-cost">費用 ${d.cost.gold} ◈ · ${d.cost.pop} 👤</div>`;
  if(pv.reason) html += `<div class="tip-warn">⚠ ${pv.reason}</div>`;
  if(pv.delta){
    const section = (title, rowDefs, emptyText) => {
      const rows = rowDefs.filter(([k]) => pv.delta[k] !== 0)
        .map(([k, icon, label]) => tipRow(pv.delta[k] > 0 ? 'pos' : 'neg', icon, label, signed(pv.delta[k])));
      return `<div class="tip-head">${title}</div>` + (rows.length ? rows.join('') : `<div class="tip-muted">${emptyText}</div>`);
    };
    html += section('每回合變化（整座城市）', tipTurnRows(), '沒有變化');
    const scoreRows = tipScoreRows().filter(([k]) => pv.delta[k] !== 0);
    if(scoreRows.length) html += section('最終分數變化', scoreRows, '沒有變化');
  }
  if(pv.once){
    const rows = Object.keys(pv.once).map(id => {
      const o = OUTPUTS[id];
      return tipRow('pos', o.icon, o.group === 'score' ? `${o.label}（最終）` : o.label, signed(pv.once[id]));
    });
    html += `<div class="tip-head">建造時一次性獲得</div>` + rows.join('');
  }
  return html;
}

export function setCellTip(html){
  const tip = $('cellTip'); if(!tip) return;
  tip.innerHTML = html;
  tip.classList.add('show');
}
export function moveCellTip(ev){
  const tip = $('cellTip'); if(!tip) return;
  const pad = 14, w = tip.offsetWidth || 0, h = tip.offsetHeight || 0;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if(x + w > window.innerWidth - 8) x = ev.clientX - w - pad;    // 靠右 / 靠下時改放到游標另一側
  if(y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}
export function hideCellTip(){
  const tip = $('cellTip'); if(tip) tip.classList.remove('show');
}

export function renderHand(onCardClick, onToggleLock){
  const el=$('hand'); el.innerHTML='';
  state.hand.forEach((card, idx)=>{
    const cardType = (typeof card === 'object' && card !== null) ? card.type : card;
    let d = CARDS[cardType];
    
    if(!d) {
      console.error("❌ 錯誤：手牌中出現未定義的卡片類型 ->", card);
      return;
    }

    // 取得該卡片的稀有度與對應顏色（若沒填預設為 common）
    let rarityKey = d.rarity || 'common';
    let rarityInfo = RARITY_CONFIG[rarityKey] || RARITY_CONFIG.common;

    let b=document.createElement('div');
    b.className = 'card' + (state.selected === card.id ? ' active' : '') + (card.locked ? ' locked' : '');
    
    // 👈 這裡利用 rarityInfo.color 動態為卡牌加上稀有度邊框或色塊提示
    b.style.borderColor = rarityInfo.color;

    b.innerHTML = `
      ${idx < 10 ? `<span class="slot-key" title="快速鍵">${(idx + 1) % 10}</span>` : ''}
      <div class="card-body">
        <span class="c-emoji">${d.emoji}</span>
        <span class="c-name">${d.name}</span>
      </div>
      <!-- 顯示稀有度標籤與對應顏色 -->
      <span class="card-rarity" style="color: ${rarityInfo.color}; font-size: 10px; font-weight: bold; margin: 2px 0;">[${rarityInfo.name}]</span>
      <span class="type">${d.type}</span>
      <span class="c-desc">${describeCard(d)}</span>
      <span class="cost">費用: ${d.cost.gold}◈ / ${d.cost.pop}👤</span>
      <button class="lock-btn ${card.locked ? 'active' : ''}" title="鎖定卡牌">${card.locked ? '🔒 已鎖定' : '🔓 鎖定'}</button>
    `;

    b.addEventListener('click', () => {
      if(onCardClick) onCardClick(card);
    });

    b.querySelector('.lock-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      card.locked = !card.locked;
      if(onToggleLock) onToggleLock();
    });

    if(!canAfford(cardType)) b.style.opacity='.62';
    el.appendChild(b);
  });
  if(!state.hand.length) el.innerHTML='<div style="color:var(--muted);font-size:12px">手牌已空。</div>';
}

export function renderShop(onBuyFaithClick, onToggleLock){
  const el=$('shop');
  if(!el) return;
  el.innerHTML='';
  
  if(!state.shop) state.shop = [];

  // state.shop 只存 {id, locked}；顯示與效果從 SHOP_ITEMS 查表
  state.shop.forEach((entry, i) => {
    const item = SHOP_ITEMS.find(s => s.id === entry.id);
    if(!item) return;
    let div = document.createElement('div');
    div.className = 'shop-item' + (entry.locked ? ' locked' : '');
    div.innerHTML = `
      <span class="emoji">${item.emoji}</span>
      <strong>${item.name}</strong>
      <small>${item.desc}</small>
      <span class="cost" style="color:var(--purple);">${item.cost} ⛪</span>
      <div class="shop-actions">
        <button class="buy-btn ${state.faith >= item.cost && !state.gameOver ? 'primary' : ''}" ${state.faith < item.cost || state.gameOver ? 'disabled' : ''}>祈求</button>
        <button class="lock-btn ${entry.locked ? 'active' : ''}">${entry.locked ? '🔒' : '🔓'}</button>
      </div>
    `;
    
    // 購買（買完後不自動補充，直接移除，直到下一回合才刷新）
    div.querySelector('.buy-btn').addEventListener('click', () => {
      if(onBuyFaithClick) onBuyFaithClick(i, item);
    });

    // 鎖定
    div.querySelector('.lock-btn').addEventListener('click', () => {
      entry.locked = !entry.locked;
      if(onToggleLock) onToggleLock();
    });

    el.appendChild(div);
  });
  
  if(!state.shop.length) el.innerHTML='<div style="color:var(--muted);font-size:12px">本回合商品已售罄。下回合將自動重置！</div>';
}

export function renderMissions(onClaimClick) {
  const el = $('missionsContainer');
  if(!el) return;
  el.innerHTML = '';
  
  state.activeMissions.forEach(m => {
    let currentTotal = m.building === '__variety__' ? uniqueBuildingTypes() : countBuilding(m.building);
    let progress = Math.max(0, currentTotal - (m.baseline || 0));
    let finished = progress >= m.target;
    
    let div = document.createElement('div');
    div.className = 'mission';
    div.innerHTML = `
      <div class="mission-title">
        <span>${m.title}</span>
        <span>${Math.min(progress, m.target)} / ${m.target}</span>
      </div>
      <p>${m.desc}</p>
      <div class="progress"><i style="width:${Math.min(100, progress/m.target*100)}%"></i></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <div class="reward">獎勵：${m.reward} ◈</div>
        <button class="${finished ? 'primary' : ''}" style="padding:4px 10px; font-size:11px;" ${!finished || state.gameOver ? 'disabled' : ''}>領取獎勵</button>
      </div>
    `;
    if (finished) {
      div.querySelector('button').addEventListener('click', () => {
        if(onClaimClick) onClaimClick(m.instanceId);
      });
    }
    el.appendChild(div);
  });
}

export function updateMissionTabNotification() {
  let hasReward = state.activeMissions.some(m => {
    let currentTotal = m.building === '__variety__' ? uniqueBuildingTypes() : countBuilding(m.building);
    let progress = Math.max(0, currentTotal - (m.baseline || 0));
    return progress >= m.target;
  });
  let missionTabBtn = document.querySelector('.tab-btn[data-tab="missions"]');
  if (missionTabBtn) {
    if (hasReward) missionTabBtn.classList.add('has-reward');
    else missionTabBtn.classList.remove('has-reward');
  }
}

export function renderLog(){
  const el=$('log');el.innerHTML='';
  state.log.forEach(x=>{
    let d=document.createElement('div');d.className='log-item';
    d.innerHTML=`<b>第 ${x.turn} 回合</b> · ${x.msg}`;
    el.appendChild(d);
  });
}

export function renderBuildingInfo(onUpgrade, onDemolish, demolishArmed) {
  let el = $('buildingInfoContent');
  if(!el) return;

  if(!state.inspectedCell) {
    el.innerHTML = '<span style="color:var(--muted)">尚未選取格子。點擊棋盤上的格子來查看地形與建築資訊。</span>';
    return;
  }

  let c = state.board.find(cell => cell.x === state.inspectedCell.x && cell.y === state.inspectedCell.y);
  if(!c) {
    state.inspectedCell = null;
    el.innerHTML = '<span style="color:var(--muted)">尚未選取格子。點擊棋盤上的格子來查看地形與建築資訊。</span>';
    return;
  }

  let terrainIcon = {plain:'·',forest:'♣',water:'≈',mountain:'▲'}[c.terrain];
  let terrainName = TERRAIN_NAMES[c.terrain];

  // 1. 【基本地形資訊】無論如何都會在最上方顯示
  let html = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <span style="font-size:24px;">${terrainIcon}</span>
      <div>
        <strong style="font-size:14px; color:var(--text);">${terrainName}地形</strong>
        <div style="font-size:11px; color:var(--muted);">座標 (${c.x}, ${c.y})${c.building ? ' · 已有建築' : ' · 可建造'}</div>
      </div>
    </div>
  `;

  // 2. 【建築資訊區塊】如果該格子有建築，則在下方新增這一欄
  if(c.building) {
    let d = CARDS[c.building];
    let lvl = c.level || 1;
    let maxLevel = 3;
    let upgradeCost = d.cost.gold * lvl;
    let canUpgrade = state.gold >= upgradeCost && lvl < maxLevel && !state.gameOver;

    html += `
      <hr style="border:none; border-top:1px solid var(--line, #2a3b4c); margin:10px 0;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
        <span style="font-size:22px;">${d.emoji}</span>
        <div>
          <strong style="font-size:13px; color:var(--text);">${d.name}</strong> <span style="color:var(--gold)">Lv.${lvl}</span>
          <div style="font-size:11px; color:var(--muted);">${d.type}建築</div>
        </div>
      </div>
      <p style="margin:4px 0; color:var(--muted); line-height:1.4; font-size:11px;">${describeCard(d)}</p>
      <div style="margin:6px 0; padding:6px; background:#101820; border-radius:6px; font-size:11px; line-height:1.6;">
        <div>目前每回合：<b>${formatStats(c.stats, ['resource', 'capacity']) || '—'}</b></div>
        <div>目前最終分數：<b>${formatStats(c.stats, ['score']) || '—'}</b></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <span style="font-size:11px; color:var(--gold);">升級費用：${lvl < maxLevel ? upgradeCost + ' ◈' : '已達上限'}</span>
        <button id="upgradeBtn" class="primary" style="padding:5px 10px; font-size:11px;" ${!canUpgrade ? 'disabled' : ''}>
          ${lvl >= maxLevel ? '已滿級' : `升級至 Lv.${lvl + 1} <kbd>U</kbd>`}
        </button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <span style="font-size:11px; color:var(--muted);">拆除不會退還任何金錢</span>
        <button id="demolishBuildingBtn" class="danger${demolishArmed ? ' armed' : ''}" style="padding:5px 10px; font-size:11px;" ${state.gameOver ? 'disabled' : ''}>
          ${demolishArmed ? '確定拆除？ <kbd>X</kbd>' : '🔨 拆除 <kbd>X</kbd>'}
        </button>
      </div>
    `;
  } else {
    // 如果沒有建築，顯示簡單的空地提示
    html += `
      <p style="margin:6px 0; color:var(--muted); line-height:1.4; font-size:11px;">此處為空地，選擇手牌後可在此處建造對應的建築。</p>
    `;
  }

  el.innerHTML = html;

  // 綁定升級按鈕事件（如果有建築的話）
  let btn = $('upgradeBtn');
  if(btn) {
    btn.addEventListener('click', () => {
      if(onUpgrade) onUpgrade();
    });
  }

  let dBtn = $('demolishBuildingBtn');
  if(dBtn) {
    dBtn.addEventListener('click', () => {
      if(onDemolish) onDemolish();
    });
  }
}