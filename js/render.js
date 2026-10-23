import { state } from './state.js';
import { CARDS, LANDFORM_NAMES, BIOME_NAMES, SHOP_ITEMS, OUTPUTS, RARITY_CONFIG, TECH_TREE, CULTURE_TREE, cardPool} from './config.js';
import { canPlace, canAfford, isBuildingUnlocked } from './game.js';
import { countBuilding, uniqueBuildingTypes } from './board.js';
import { describeCard } from './effects.js';
import { hasResearchableNodes } from './trees.js';

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

    b.className=`cell landform-${c.landform} biome-${c.biome} ${c.building?'occupied':'empty'}${valid?' selected':''}${isInspected?' inspected':''}`;
    if(valid) b.setAttribute('data-ghost', CARDS[selCard.type].emoji);   // 滑過時顯示半透明的建築預覽
    
    let terrainIcon={plain:'·',hill:'⌁',water:'≈',mountain:'▲'}[c.landform] || '·';
    let biomeIcon={grassland:'🌱',forest:'🌲',desert:'🏜️',snow:'❄️',water:'🌊',wetland:'🌿'}[c.biome] || '';
    const riverMarkup=(c.riverEdges||[]).map(dir=>`<span class="river-edge river-${dir.toLowerCase()}" aria-hidden="true"></span>`).join('');
    b.innerHTML=`${riverMarkup}<span class="terrain" title="${LANDFORM_NAMES[c.landform]}">${terrainIcon}</span><span class="biome" title="${BIOME_NAMES[c.biome]}">${biomeIcon}</span>${c.building?`<span class="emoji">${CARDS[c.building].emoji}</span><span class="bname">${CARDS[c.building].name}</span><span class="bonus">${formatBonus(c.stats)}</span>`:''}`;
	
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
  let html = `<div class="tip-title">${d.emoji} ${d.name}<span class="tip-sub">${LANDFORM_NAMES[cell.landform]}・${BIOME_NAMES[cell.biome]} (${cell.x}, ${cell.y})</span></div>`;
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

export function updateAllTabNotifications() {
  // 1. 任務系統紅點
  let hasMissionReward = state.activeMissions.some(m => {
    let currentTotal = m.building === '__variety__' ? uniqueBuildingTypes() : countBuilding(m.building);
    let progress = Math.max(0, currentTotal - (m.baseline || 0));
    return progress >= m.target;
  });
  let missionTabBtn = document.querySelector('.tab-btn[data-tab="missions"]');
  if (missionTabBtn) {
    if (hasMissionReward) missionTabBtn.classList.add('has-reward');
    else missionTabBtn.classList.remove('has-reward');
  }

  // 2. 科技樹紅點
  let techBtn = document.querySelector('.tab-btn[data-tab="tech"]');
  if (techBtn) {
    if (hasResearchableNodes('tech')) techBtn.classList.add('has-reward');
    else techBtn.classList.remove('has-reward');
  }

  // 3. 文化樹紅點
  let cultBtn = document.querySelector('.tab-btn[data-tab="culture"]');
  if (cultBtn) {
    if (hasResearchableNodes('culture')) cultBtn.classList.add('has-reward');
    else cultBtn.classList.remove('has-reward');
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

  let terrainIcon = {plain:'·',hill:'⌁',water:'≈',mountain:'▲'}[c.landform] || '·';
  let terrainName = LANDFORM_NAMES[c.landform] || c.landform;
  let biomeName = BIOME_NAMES[c.biome] || c.biome;
  let biomeIcon = {grassland:'🌱',forest:'🌲',desert:'🏜️',snow:'❄️',water:'🌊',wetland:'🌿'}[c.biome] || ''; 

  // 1. 【基本地形資訊】無論如何都會在最上方顯示
  let html = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <span style="font-size:24px;">${terrainIcon} ${biomeIcon}</span>
      <div>
        <strong style="font-size:14px; color:var(--text);">地形：${terrainName}</strong>
        <div style="font-size:11px; color:var(--muted);">地貌：${biomeName}</div>
        <div style="font-size:11px; color:var(--muted);">座標 (${c.x}, ${c.y})${c.building ? ' · 已有建築' : ' · 可建造'}</div>
      </div>
    </div>
  `;

  // 2. 【建築資訊區塊】如果該格子有建築，則在下方新增這一欄
  if(c.building) {
    let d = CARDS[c.building];
    let lvl = c.level || 1;
    
    // 檢查是否有填寫升級目標
    let hasUpgrade = d.upgradesTo && (!Array.isArray(d.upgradesTo) || d.upgradesTo.length > 0);
    
    // 🔽 分別抓取不同類型的統計數據
    let resourceStats = formatStats(c.stats, ['resource']);
    let capacityStats = formatStats(c.stats, ['capacity']);
    let scoreStats = formatStats(c.stats, ['score']);
	let upkeepCost = d.upkeep ? d.upkeep * lvl : 0;
	
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
      
      <!-- 🔽 拆分顯示：每回合產出、常駐效果、最終分數 -->
      <div style="margin:6px 0; padding:6px; background:#101820; border-radius:6px; font-size:11px; line-height:1.6;">
        ${resourceStats ? `<div>每回合產出：<b>${resourceStats}</b></div>` : ''}
        ${capacityStats ? `<div>常駐效果：<b>${capacityStats}</b></div>` : ''}
		<div>建築維護費：<b style="color:var(--red);">-${upkeepCost} ◈ / 回合</b></div>
        <div>目前最終分數：<b>${scoreStats || '—'}</b></div>
      </div>
    `;
	
    // 🔽 依據是否有填寫升級資料來動態渲染
    if(hasUpgrade) {
    let upgradeOptions = Array.isArray(d.upgradesTo) ? d.upgradesTo : [d.upgradesTo];
    
    upgradeOptions.forEach(targetId => {
      let targetCard = CARDS[targetId];
      if(!targetCard) return;

      let isUnlocked = isBuildingUnlocked(targetId); // 檢查是否已解鎖
      let upgradeCost = d.upgradeCost ? d.upgradeCost.gold : targetCard.cost.gold;
      let canUpgrade = isUnlocked && state.gold >= upgradeCost && !state.gameOver;

      let btnLabel = !isUnlocked ? `🔒 未解鎖 ${targetCard.name}` : `改造為 ${targetCard.name}`;

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
          <span style="font-size:11px; color:${isUnlocked ? 'var(--gold)' : 'var(--muted)'};">
            升級目標：${targetCard.emoji} ${targetCard.name} (${upgradeCost} ◈) ${!isUnlocked ? '<span style="color:var(--red)">(未解鎖)</span>' : ''}
          </span>
          <button class="primary upgrade-choice-btn" data-target="${targetId}" style="padding:5px 10px; font-size:11px;" ${!canUpgrade ? 'disabled' : ''}>
            ${btnLabel}
          </button>
        </div>
      `;
    });
  } else {
      html += `
        <div style="margin-top:8px; font-size:11px; color:var(--muted); text-align:center;">此建築已達最終形態，無法繼續升級。</div>
      `;
    }

    // 拆除按鈕
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <span style="font-size:11px; color:var(--muted);">拆除不會退還任何金錢</span>
        <button id="demolishBuildingBtn" class="danger${demolishArmed ? ' armed' : ''}" style="padding:5px 10px; font-size:11px;" ${state.gameOver ? 'disabled' : ''}>
          ${demolishArmed ? '確定拆除？ <kbd>X</kbd>' : '🔨 拆除 <kbd>X</kbd>'}
        </button>
      </div>
    `;
  }

  el.innerHTML = html;

  // 綁定動態產生的升級分支按鈕事件
  el.querySelectorAll('.upgrade-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let targetId = btn.getAttribute('data-target');
      if(onUpgrade) onUpgrade(targetId);
    });
  });

  let dBtn = $('demolishBuildingBtn');
  if(dBtn) {
    dBtn.addEventListener('click', () => {
      if(onDemolish) onDemolish();
    });
  }
}

// 輔助函式：檢查該卡片是由哪個科技、文化或初始卡池解鎖
function getCardUnlockInfo(cardId) {
  if (cardPool.includes(cardId)) {
    return '初始解鎖 (基礎卡池)';
  }
  
  // 檢查科技樹與文化樹
  const trees = [TECH_TREE, CULTURE_TREE];
  for (const tree of trees) {
    for (const techId in tree) {
      const node = tree[techId];
      if (node.effects) {
        const effect = node.effects.find(e => e.type === 'unlockBuilding' && e.target === cardId);
        if (effect) {
          const mode = effect.mode || 'addPool';
          if (mode === 'upgradeOnly') {
            return `科技/文化解鎖：${node.icon} ${node.name} <span style="color:var(--purple);">(僅限升級獲得，不入卡池)</span>`;
          } else if (mode === 'replacePool') {
            const relCard = CARDS[effect.replaces];
            const relName = relCard ? relCard.name : effect.replaces;
            return `科技/文化解鎖：${node.icon} ${node.name} <span style="color:var(--orange);">(替代卡池中的【${relName}】)</span>`;
          } else {
            return `科技/文化解鎖：${node.icon} ${node.name} (加入卡池)`;
          }
        }
      }
    }
  }
  return '特殊解鎖 / 隱藏';
}

// 輔助函式：反向檢查有哪些建築可以升級成當前卡片
function getCardUpgradeSources(targetId) {
  const sources = [];
  for (const id in CARDS) {
    const card = CARDS[id];
    if (card.upgradesTo) {
      const targets = Array.isArray(card.upgradesTo) ? card.upgradesTo : [card.upgradesTo];
      if (targets.includes(targetId)) {
        sources.push(id);
      }
    }
  }
  return sources;
}

export function renderEncyclopedia() {
  const el = $('encyclopediaContainer');
  if(!el) return;

  let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">';
  
  for(const cardId in CARDS) {
    const card = CARDS[cardId];
    let rarityKey = card.rarity || 'common';
    let rarityInfo = RARITY_CONFIG[rarityKey] || RARITY_CONFIG.common;
    
    // 1. 取得解鎖條件
    let unlockText = getCardUnlockInfo(cardId);
    
    // 2. 取得「升級自」(Reverse Lookup)
    const sources = getCardUpgradeSources(cardId);
    let sourceText = '無 (只能透過抽卡或解鎖建造)';
    if (sources.length > 0) {
      sourceText = sources.map(sId => {
        const sCard = CARDS[sId];
        return `<span class="encyclopedia-link" data-target="${sId}">${sCard ? sCard.emoji + ' ' + sCard.name : sId}</span>`;
      }).join(' / ');
    }

    // 3. 取得「升級至」
    let upgradeText = '無 (已達最終形態)';
    if (card.upgradesTo) {
      const targets = (Array.isArray(card.upgradesTo) ? card.upgradesTo : [card.upgradesTo]).filter(Boolean);
      if (targets.length > 0) {
        upgradeText = targets.map(tId => {
          const tCard = CARDS[tId];
          return `<span class="encyclopedia-link" data-target="${tId}">${tCard ? tCard.emoji + ' ' + tCard.name : tId}</span>`;
        }).join(' / ');
      }
    }

    let landformText = card.landforms ? card.landforms.map(l => LANDFORM_NAMES[l] || l).join('、') : '不限';
    let biomeText = card.biomes ? card.biomes.map(b => BIOME_NAMES[b] || b).join('、') : '不限';
    if(card.requiresRiver) biomeText += '；需鄰接河流';

    // 加上 id="encyclopedia-card-${cardId}" 以便後續點擊跳轉定位
    html += `
      <div id="encyclopedia-card-${cardId}" class="encyclopedia-card" style="background:#101820; border:1px solid var(--line); border-radius:8px; padding:12px; border-left: 4px solid ${rarityInfo.color}; display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:24px;">${card.emoji}</span>
            <div>
              <div style="font-size:14px; font-weight:bold; color:var(--text);">
                ${card.name} <span style="font-size:10px; color:${rarityInfo.color};">[${rarityInfo.name}]</span>
              </div>
              <div style="font-size:11px; color:var(--muted);">${card.type}建築 · 費用 ${card.cost.gold}◈ / ${card.cost.pop}👤</div>
            </div>
          </div>
        </div>
        
        <div style="font-size:11px; color:var(--muted); line-height:1.4; border-top:1px solid var(--line); padding-top:6px; margin-top:2px;">
          <div><b>效果：</b>${describeCard(card)}</div>
          <div style="margin-top:3px; color:var(--blue);"><b>限制：</b>地形[${landformText}] · 地貌[${biomeText}]</div>
          <div style="margin-top:3px; color:var(--gold);"><b>解鎖條件：</b>${unlockText}</div>
          <div style="margin-top:3px; color:var(--orange);"><b>升級自：</b>${sourceText}</div>
          <div style="margin-top:3px; color:var(--green);"><b>升級至：</b>${upgradeText}</div>
        </div>
      </div>
    `;
  }
  html += '</div>';
  el.innerHTML = html;

  // 4. 綁定圖鑑中所有「升級自 / 升級至」卡片名稱的點擊跳轉事件
  el.querySelectorAll('.encyclopedia-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = link.getAttribute('data-target');
      const targetEl = $(`encyclopedia-card-${targetId}`);
      if (targetEl) {
        // 平滑滾動到該張卡片
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 加上金色發光高亮特效
        targetEl.classList.add('highlight-flash');
        setTimeout(() => {
          targetEl.classList.remove('highlight-flash');
        }, 1500);
      }
    });
  });
}