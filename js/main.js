import { state, setState, soundEnabled, setSoundEnabled, playSound, message } from './state.js';
import { HAND_LIMIT, LANDFORM_NAMES, BIOME_NAMES, CARDS, TECH_TREE, CULTURE_TREE, MISSION_POOL, EVENT_POOL, cardPool, MAX_TURNS, VERSION, RARITY_CONFIG} from './config.js';
import { rand, calculate, terrainMap, availableCardPool, shuffle, drawFromDeck, makeShop, rebuildShop, calculateTotalScore, getNextMilestone, getScoreBreakdown, getRandomMissions, endTurn, placeCard, demolishCell, previewPlacement, upgradeInspectedBuilding, zeroScores, addLog } from './game.js';
import { countBuilding, uniqueBuildingTypes } from './board.js';
import { renderBoard, renderHand, renderShop, renderMissions, updateAllTabNotifications, renderLog, renderBuildingInfo, buildPlacementTip, setCellTip, moveCellTip, hideCellTip, renderEncyclopedia, } from './render.js';
import { TREES, renderTree, openTreeModal, closeTreeModal, unlockSelectedNode } from './trees.js';
import { writeSave, readSave, applySave } from './save.js';
import { initKeyboard, SHORTCUT_LIST } from './keys.js';
import { validateCards } from './validate.js';
import { describeCard } from './effects.js';

const $ = id => document.getElementById(id);

// ===== 畫面更新 =====
// render() 只更新「頂部統計列」與「目前所在的分頁」；其他分頁在切換過去時才會繪製。
// 這樣在城市分頁操作時，不會白白重畫科技樹 / 文化樹 / 任務清單。
let currentTab = 'city';
let renderEpoch = 0;          // 每次 render 加 1：格子重建後，預覽提示需要重新計算
let tipKey = null;            // 目前預覽提示對應的 (render, 卡牌, 格子)，相同就只移動位置、不重算
let pendingDemolish = null;   // {x, y}：已按過一次「拆除」，等待第二次確認

function render(){
  renderEpoch++;
  calculate();
  renderStats();
  updateAllTabNotifications();

  switch(currentTab){
    case 'city':    renderCityTab(); break;
    case 'tech':    renderTree('tech', id => openTreeModal('tech', id)); break;
    case 'culture': renderTree('culture', id => openTreeModal('culture', id)); break;
    case 'missions': renderMissions(claimMission); break;
	case 'encyclopedia': renderEncyclopedia(); break;
  }
}

// 頂部統計列：每次 render 都更新（內容很小）。科技點 / 文化點也在這裡更新，
// 因此即使科技樹分頁沒有被繪製，頂部數字也一定是最新的。
function renderStats(){
  $('turnStat').textContent = `${state.turn} / ${MAX_TURNS}`;
  $('phaseStat').textContent = state.gameOver ? '遊戲結束' : '建設階段';
  $('goldStat').textContent = `${state.gold} (${state.perTurn.gold >= 0 ? '+' : ''}${state.perTurn.gold})`;
  
  // 顯示目前人口/上限，若有預計增長則以綠色小字標示（例如 +1）
  const growthText = state.projectedGrowth > 0 ? ` <span style="color:var(--green); font-size:11px;">(+${state.projectedGrowth})</span>` : '';
  $('popStat').innerHTML = `${state.currentPopulation} / ${state.maxPopulation}${growthText}`;
  
  let netFood = state.perTurn.food - state.currentPopulation;
  $('foodStat').textContent = `${Math.floor(state.storedFood)} / ${state.maxStoredFood} (${netFood >= 0 ? '+' : ''}${netFood})`;
  $('foodConsumeStat').textContent = `產出 ${state.perTurn.food} / 消耗 ${state.currentPopulation} · 可用人口 ${state.population}`;
  
  if(state.storedFood + netFood < 0){
    $('foodDeficitHint').textContent = '⚠️ 存糧見底！';
    $('foodDeficitHint').style.color = 'var(--red)';
  } else if(netFood < 0){
    $('foodDeficitHint').textContent = '⚠️ 糧食淨值為負（存糧可支撐）';
    $('foodDeficitHint').style.color = 'var(--orange)';
  } else {
    $('foodDeficitHint').textContent = `可用工作人口：${state.population} · 糧食充足`;
    $('foodDeficitHint').style.color = 'var(--green)';
  }
  
  $('faithStat').textContent = `${state.faith} (+${state.perTurn.faithPoints})`;
  $('techPointsHeaderStat').textContent = `${state.techPoints} (+${state.perTurn.techPoints})`;
  $('culturePointsHeaderStat').textContent = `${state.culturePoints} (+${state.perTurn.culturePoints})`;
  
  
  // 🌟 更新總積分與下一次目標門檻提示
  const totalScore = calculateTotalScore();
  $('scoreStat').textContent = totalScore;

  const milestone = getNextMilestone();
  const hintEl = $('scoreTargetHint');
  if (hintEl) {
    if (milestone) {
      if (milestone.remaining > 0) {
        hintEl.textContent = `第 ${milestone.turn} 回合需 ${milestone.targetScore}★ (還差 ${milestone.remaining}★)`;
        hintEl.style.color = 'var(--orange)';
      } else {
        hintEl.textContent = `第 ${milestone.turn} 回合門檻達標！(${milestone.targetScore}★)`;
        hintEl.style.color = 'var(--green)';
      }
    } else {
      hintEl.textContent = '已達成所有階段目標！';
      hintEl.style.color = 'var(--green)';
    }
  }
}

function renderCityTab(){
  renderBoard(onBoardCellClick, onCellPointer, onCellLeave);
  renderHand(onHandCardClick, render);   // 第二個參數：切換鎖定後重繪
  renderShop(onShopBuy, render);
  renderLog();
  renderBuildingInfo(onUpgradeClick, onDemolishClick, isDemolishArmed());

  $('drawBtn').disabled = state.gold < 3 || state.hand.length >= HAND_LIMIT || state.gameOver;
  $('refreshShopBtn').disabled = state.gold < 2 || state.gameOver;
  $('endTurnBtn').disabled = state.gameOver;
  $('cancelBtn').disabled = !state.selected;
}

function onBoardCellClick(c){
  clearPendingDemolish();
  // 已選牌且點到空格 → 嘗試放置。失敗時保留 placeCard 設定的錯誤訊息（不再往下覆蓋）。
  // 點到已有建築的格子則視為「檢視建築」，不會觸發放置錯誤。
  if(state.selected && !c.building){
    let card = state.hand.find(h => h.id === state.selected);
    if(card){
      if(placeCard(card, c)) render();
      return;
    }
  }

  state.inspectedCell = {x: c.x, y: c.y};
  if(c.building){
    let d = CARDS[c.building];
    message(`已選取 ${d.emoji} ${d.name} (Lv.${c.level||1})，可在右側「建築資訊」面板升級或拆除。`);
  } else {
    let terrainName = LANDFORM_NAMES[c.landform];
    let biomeName = BIOME_NAMES[c.biome];
    message(`已選取 ${terrainName}・${biomeName} (座標 ${c.x}, ${c.y})｜選擇手牌後可在此建造。`);
  }
  render();
}

function onHandCardClick(card){
  clearPendingDemolish();
  state.selected = state.selected === card.id ? null : card.id;
  render();
  let d = CARDS[card.type];
  message(state.selected ? `已選擇 ${d.name}，請點擊棋盤。` : '已取消選牌。');
}

// 追蹤目前點擊篩選的稀有度（null 代表顯示全部）
let selectedRarityFilter = null;

// ===== 牌庫與已解鎖卡池檢視與排序功能 =====
function openDeckModal() {
  const container = $('deckModalContent');
  if(!container) return;

  const currentPool = availableCardPool();
  
  // 計算總權重與各稀有度數量
  const poolByRarity = { common: [], rare: [], epic: [], legendary: [] };
  currentPool.forEach(id => {
    const card = CARDS[id];
    if (!card) return;
    const r = card.rarity || 'common';
    if (!poolByRarity[r]) poolByRarity[r] = [];
    poolByRarity[r].push({ id, card });
  });

  let totalWeight = 0;
  for (const r in RARITY_CONFIG) {
    if (poolByRarity[r] && poolByRarity[r].length > 0) {
      totalWeight += RARITY_CONFIG[r].weight || 10;
    }
  }

  // 1. 頂部資訊與排序選單列
  let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
    <div style="font-size:13px; font-weight:bold; color:var(--text);">目前已解鎖卡池總數：<span style="color:var(--gold);">${currentPool.length} 種</span></div>
    <div style="display:flex; align-items:center; gap:6px;">
      <label style="font-size:11px; color:var(--muted);">排序：</label>
      <select id="deckSortSelect" style="background:#101820; color:var(--text); border:1px solid var(--line); padding:3px 6px; border-radius:4px; font-size:11px;">
        <option value="rarity">依稀有度</option>
        <option value="cost">依金幣消耗</option>
        <option value="name">依名稱</option>
      </select>
    </div>
  </div>`;
  
  // 2. 稀有度機率概覽列（加入可點擊的篩選效果，若被點擊則加上邊框高亮）
  html += `<div style="display:flex; gap:8px; margin-bottom:12px; font-size:11px;">`;
  for (const r in RARITY_CONFIG) {
    const conf = RARITY_CONFIG[r];
    const count = poolByRarity[r] ? poolByRarity[r].length : 0;
    const pct = (count > 0 && totalWeight > 0) ? ((conf.weight / totalWeight) * 100).toFixed(1) : 0;
    const isSelected = selectedRarityFilter === r;
    const activeStyle = isSelected ? `border:2px solid ${conf.color}; background:#1a2634;` : `border-left:3px solid ${conf.color};`;
    
    html += `<div class="rarity-filter-card" data-rarity="${r}" style="flex:1; background:#101820; padding:6px; border-radius:6px; ${activeStyle} text-align:center; cursor:pointer; transition:all 0.2s;" title="點擊篩選 ${conf.name} 卡片">
      <div style="color:${conf.color}; font-weight:bold;">${conf.name}</div>
      <div>${pct}% (共${count}種)</div>
    </div>`;
  }
  html += `</div>`;

  // 如果目前有啟動篩選，顯示提示列與「顯示全部」按鈕
  if (selectedRarityFilter) {
    const filterName = RARITY_CONFIG[selectedRarityFilter]?.name || selectedRarityFilter;
    html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:4px; margin-bottom:10px; font-size:11px;">
      <span style="color:var(--gold);">目前篩選：${filterName} 卡片</span>
      <button id="clearFilterBtn" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:11px; text-decoration:underline;">顯示全部</button>
    </div>`;
  }

  // 3. 取得目前排序選擇器的值
  const sortSelect = $('deckSortSelect');
  const sortMode = sortSelect ? sortSelect.value : 'rarity';

  // 4. 過濾卡片（如果有選稀有度）
  let filteredPool = currentPool.filter(cardId => {
    const card = CARDS[cardId];
    if (!card) return false;
    if (selectedRarityFilter && (card.rarity || 'common') !== selectedRarityFilter) {
      return false;
    }
    return true;
  });

  // 5. 執行排序邏輯
  filteredPool.sort((a, b) => {
    const cardA = CARDS[a];
    const cardB = CARDS[b];
    if (!cardA || !cardB) return 0;

    if (sortMode === 'rarity') {
      // 稀有度排序權重 (legendary > epic > rare > common)
      const weights = { legendary: 4, epic: 3, rare: 2, common: 1 };
      const wA = weights[cardA.rarity || 'common'] || 1;
      const wB = weights[cardB.rarity || 'common'] || 1;
      if (wA !== wB) return wB - wA; // 高稀有度排前面
      return cardA.name.localeCompare(cardB.name, 'zh-Hant');
    } else if (sortMode === 'cost') {
      // 依金幣消耗排序（小的在前）
      const costA = cardA.cost?.gold || 0;
      const costB = cardB.cost?.gold || 0;
      if (costA !== costB) return costA - costB;
      return cardA.name.localeCompare(cardB.name, 'zh-Hant');
    } else if (sortMode === 'name') {
      // 依中文名稱筆畫/字首排序
      return cardA.name.localeCompare(cardB.name, 'zh-Hant');
    }
    return 0;
  });

  // 6. 渲染卡牌詳細清單
  html += '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:8px;">';
  if (filteredPool.length === 0) {
    html += `<div style="grid-column: 1 / -1; text-align:center; color:var(--muted); padding:20px; font-size:12px;">沒有符合此稀有度的卡片</div>`;
  } else {
    filteredPool.forEach(cardId => {
      const cardData = CARDS[cardId];
      if(!cardData) return;
      const rarityKey = cardData.rarity || 'common';
      const rarityInfo = RARITY_CONFIG[rarityKey] || RARITY_CONFIG.common;
      const descText = describeCard(cardData);

      html += `
        <div class="deck-card-item" style="border-left: 4px solid ${rarityInfo.color};">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:20px;">${cardData.emoji}</span>
            <div>
              <div style="font-size:13px; color:var(--text); font-weight:bold;">
                ${cardData.name} <span style="font-size:10px; color:${rarityInfo.color};">[${rarityInfo.name}]</span>
              </div>
              <div style="font-size:10px; color:var(--muted);">${cardData.type}建築 · 費用 ${cardData.cost.gold}◈ / ${cardData.cost.pop}👤</div>
            </div>
          </div>
          <div class="deck-card-desc">
            <div><b>效果：</b>${descText}</div>
          </div>
        </div>
      `;
    });
  }
  html += '</div>';

  container.innerHTML = html;

  // 保持原本的下拉選單選項記憶
  const newSortSelect = $('deckSortSelect');
  if (newSortSelect) newSortSelect.value = sortMode;

  // 繫結事件：點擊卡片展開說明
  container.querySelectorAll('.deck-card-item').forEach(el => {
    el.addEventListener('click', () => {
      const isExpanded = el.classList.toggle('expanded');
      const descBox = el.querySelector('.deck-card-desc');
      if (descBox) descBox.style.display = isExpanded ? 'block' : 'none';
    });
  });

  // 繫結事件：點擊機率表卡片進行篩選
  container.querySelectorAll('.rarity-filter-card').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      const targetRarity = cardEl.getAttribute('data-rarity');
      // 如果點擊目前已經選中的稀有度，則取消篩選；否則切換為該稀有度
      if (selectedRarityFilter === targetRarity) {
        selectedRarityFilter = null;
      } else {
        selectedRarityFilter = targetRarity;
      }
      openDeckModal(); // 重新整理 Modal 畫面
    });
  });

  // 繫結事件：點擊「顯示全部」按鈕
  const clearBtn = $('clearFilterBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selectedRarityFilter = null;
      openDeckModal();
    });
  }

  // 繫結事件：排序下拉選單切換
  const sortDropdown = $('deckSortSelect');
  if (sortDropdown) {
    sortDropdown.addEventListener('change', () => {
      openDeckModal();
    });
  }

  $('deckModalBackdrop').classList.add('show');
}

$('viewDeckBtn').addEventListener('click', () => {selectedRarityFilter = null;openDeckModal();});
$('deckModalClose').addEventListener('click', () => $('deckModalBackdrop').classList.remove('show'));
$('deckModalConfirmBtn').addEventListener('click', () => $('deckModalBackdrop').classList.remove('show'));

// ===== 格子預覽：選牌後滑過格子，顯示「放在這裡會有什麼變化」=====
function onCellPointer(c, ev){
  const card = state.selected ? state.hand.find(h => h.id === state.selected) : null;
  if(!card || c.building){ hideCellTip(); tipKey = null; return; }   // 沒選牌或已有建築：不顯示
  const key = `${renderEpoch}|${card.id}|${c.x},${c.y}`;
  if(key !== tipKey){                                                 // 換了格子才重新計算
    tipKey = key;
    setCellTip(buildPlacementTip(card, c, previewPlacement(card, c)));
  }
  moveCellTip(ev);
}
function onCellLeave(){ hideCellTip(); tipKey = null; }

// ===== 升級 / 拆除（建築資訊面板）=====
function selectedBuildingCell(){
  const ic = state.inspectedCell;
  if(!ic) return null;
  const c = state.board.find(cell => cell.x === ic.x && cell.y === ic.y);
  return c && c.building ? c : null;
}
function isDemolishArmed(){
  const c = selectedBuildingCell();
  return !!(c && pendingDemolish && pendingDemolish.x === c.x && pendingDemolish.y === c.y);
}
function clearPendingDemolish(){ pendingDemolish = null; }

function onUpgradeClick(targetChoiceId = null){
  clearPendingDemolish();
  upgradeInspectedBuilding(targetChoiceId);
  render();
}

// 拆除需要連按兩次：第一次進入「確定拆除？」狀態，第二次才真正執行。
// 換選格子、選牌、升級、結束回合或按 Esc 都會取消確認，避免誤觸旁邊的升級 / 拆除按鈕。
function onDemolishClick(){
  const c = selectedBuildingCell();
  if(!c || state.gameOver) return;
  if(!isDemolishArmed()){
    pendingDemolish = { x: c.x, y: c.y };
    const d = CARDS[c.building];
    render();
    message(`再按一次「拆除」確認拆除 ${d.name}（不會退還金錢），按 Esc 取消。`, true);
    return;
  }
  clearPendingDemolish();
  demolishCell(c);
  render();
}

// 購買後直接移除該項目（不補充，直到下回合）
function onShopBuy(i, item){
  if(state.faith < item.cost) return message('信仰點不足！', true);
  state.faith -= item.cost;
  item.effect(state);
  playSound('win');
  state.shop.splice(i, 1);
  render();
  message(`成功施放奇蹟【${item.name}】！`, false, true);
}

function startGame(){
  const initialTechs = Object.keys(TECH_TREE).filter(id => TECH_TREE[id].unlocked);
  const initialCultures = Object.keys(CULTURE_TREE).filter(id => CULTURE_TREE[id].unlocked);

  setState({
    turn:1, gold:5, faith: 10,
    maxPopulation:0, currentPopulation:2, lostPopulation:0, storedFood:5,
    bonusScore: zeroScores(),      // 建造時永久獲得的分數（onBuild 的 xxxScore）
    scores: zeroScores(),          // 目前的最終分數（calculate 會重算）
    perTurn: {},                   // 每回合的資源產出（calculate 會重算）
    techPoints: 0, unlockedTechs: initialTechs,
    culturePoints: 0, unlockedCultures: initialCultures,
    activeMissions: [],
    board:terrainMap(), hand:[], deck:[], 
    shop: [],
    selected:null, log:[],
    gameOver:false
  });

  for(let id in TECH_TREE){ TECH_TREE[id].unlocked = initialTechs.includes(id);}
  for(let id in CULTURE_TREE){ CULTURE_TREE[id].unlocked = initialCultures.includes(id); }

  // 任務的 baseline 取自 state.board，必須在新 state 設定完成之後才產生
  state.activeMissions = getRandomMissions(3);
  state.shop = makeShop();
  
  for(let i=0;i<5;i++) state.hand.push(drawFromDeck());

  pendingDemolish = null;
  
  render();
  message('歡迎遊玩 Card City ！');
}

function claimMission(instanceId) {	
  let index = state.activeMissions.findIndex(m => m.instanceId === instanceId);
  if(index === -1) return;
  let m = state.activeMissions[index];
  let currentTotal = m.building === '__variety__' ? uniqueBuildingTypes() : countBuilding(m.building);
  let progress = Math.max(0, currentTotal - (m.baseline || 0));
  if(progress < m.target) return message('尚未達成任務目標！', true);

  state.gold += m.reward;
  playSound('coin');
  message(`成功領取任務獎勵：${m.title}！`, false, true);

  let activeIds = state.activeMissions.map(x => x.id);
  let newPool = MISSION_POOL.filter(item => !activeIds.includes(item.id));
  if(newPool.length === 0) newPool = MISSION_POOL;
  let newTemplate = rand(newPool);

  // 替換新任務並重設 baseline
  state.activeMissions[index] = {
    ...newTemplate,
    instanceId: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    baseline: newTemplate.building === '__variety__' ? uniqueBuildingTypes() : countBuilding(newTemplate.building)
  };
  
  // 👈 絕對不能少這行！領完立刻強制重新渲染畫面，按鈕才會變成 disabled 且進度歸零
  render();
}

function checkRandomEvent() {
  // 設定為每過 5 回合觸發一次
  if (state.turn > 1 && state.turn % 5 === 0) {
    let randomEvent = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
    randomEvent.effect(state); // 執行事件效果
	
    // 顯示內建的事件彈窗
    $('eventModalTitle').textContent = `🏛️ 城市事件：${randomEvent.title}`;
    $('eventModalText').textContent = randomEvent.desc;
    $('eventModalBackdrop').classList.add('show');

    addLog(`發生隨機事件：${randomEvent.title}`);
  }
}

function saveGame() {
  try {
    writeSave();
    message('遊戲已完整儲存。', false, true);
  } catch(e) {
    message('儲存失敗。', true);
  }
}

function loadGame() {
  const result = readSave();
  if(result.error) return message(result.error, true);
  applySave(result.data);
  render();
  message('已成功讀取存檔。', false, true);
}

// Event Bindings
$('endTurnBtn').addEventListener('click', () => {
  clearPendingDemolish();
  endTurn();
  if(state.gameOver) {
    const totalScore = calculateTotalScore();
    const breakdown = getScoreBreakdown();
    
    // 組合每項分行的 HTML 結構
    let breakdownHtml = `<div style="text-align: left; margin: 15px auto; max-width: 320px; background: #101820; padding: 12px; border-radius: 8px; border: 1px solid var(--line);">`;
    breakdownHtml += `<div style="font-weight: bold; color: var(--gold); margin-bottom: 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px;">📈 積分來源明細：</div>`;
    breakdown.forEach(item => {
      breakdownHtml += `<div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">`;
      breakdownHtml += `<span style="color: var(--muted);">${item.label}：</span>`;
      breakdownHtml += `<span style="color: var(--text); font-weight: bold;">+${item.value} 分</span>`;
      breakdownHtml += `</div>`;
    });
    breakdownHtml += `<div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 8px; border-top: 1px solid var(--line); paddingTop: 6px; font-weight: bold;">`;
    breakdownHtml += `<span style="color: var(--gold);">總積分合計：</span>`;
    breakdownHtml += `<span style="color: var(--gold);">${totalScore} ★</span>`;
    breakdownHtml += `</div>`;
    breakdownHtml += `</div>`;

    // 恢復 modal 的按鈕顯示
    $('modalRestart').style.display = 'inline-block';
    $('modalClose').textContent = '返回城市';

    if (state.failReason) {
      $('modalTitle').textContent = '💀 遊戲失敗';
      // 使用 innerHTML 來支援分行與美化排版
      $('modalText').innerHTML = `<p style="margin:0 0 10px 0;">${state.failReason}</p>` + breakdownHtml;
    } else {
      $('modalTitle').textContent = '🎉 城市建設圓滿成功！';
      $('modalText').innerHTML = `<p style="margin:0 0 10px 0;">你成功帶領城市撐過了 30 回合的挑戰！</p>` + breakdownHtml;
    }
    
    $('modalBackdrop').classList.add('show');
  } else {
    checkRandomEvent(); // 檢查隨機事件
  }
  render();
});

$('drawBtn').addEventListener('click', () => {
  if(state.gold < 3 || state.hand.length >= HAND_LIMIT) return;
  state.gold -= 3;
  let c = drawFromDeck();
  state.hand.push(c);
  render();
  message(`抽到 ${CARDS[c.type].name}。`, false, true);
});

$('refreshShopBtn').addEventListener('click', () => {
  if(state.gold < 2) return;
  if(state.shop.length && state.shop.every(i => i.locked)) return message('所有商品都已鎖定，無法刷新。', true);
  state.gold -= 2;
  rebuildShop();
  render();
  message('商店已重新整理（鎖定的商品會保留）。');
});

$('cancelBtn').addEventListener('click', () => {
  state.selected = null;
  render();
  message('已取消選牌。');
});

$('saveBtn').addEventListener('click', saveGame);$('loadBtn').addEventListener('click', loadGame);

$('soundBtn').addEventListener('click', () => {
  setSoundEnabled(!soundEnabled);
  $('soundBtn').textContent = soundEnabled ? '🔊 音效: 開' : '🔇 音效: 關';
});

$('restartBtn').addEventListener('click', () => {
  if(confirm('重新開始？')) {
    $('modalBackdrop').classList.remove('show');
    startGame();
  }
});

$('modalRestart').addEventListener('click', () => {$('modalBackdrop').classList.remove('show');
  startGame();
});

$('modalClose').addEventListener('click', () =>$('modalBackdrop').classList.remove('show'));

// ===== 點擊頂部統計列的互動處理 ===== //
// 點擊總分：顯示詳細的分數統計表彈窗
$('statScoreStat').addEventListener('click', () => {
  const breakdown = getScoreBreakdown();
  const total = calculateTotalScore();
  
  let html = `<div style="font-size:13px; line-height:1.8;">`;
  html += `<p style="color:var(--gold); font-weight:bold; font-size:15px; margin-bottom:10px;">目前總積分：${total} ★</p>`;
  html += `<ul style="padding-left:20px; margin:0; color:var(--text);">`;
  breakdown.forEach(item => {
    html += `<li style="margin-bottom:6px;"><b>${item.label}</b>：<span style="color:var(--green);">${item.value} 分</span></li>`;
  });
  html += `</ul></div>`;

  $('modalTitle').textContent = '📊 詳細分數統計來源';
  $('modalText').innerHTML = html;
  // 隱藏「再玩一局」按鈕，只留返回城市
  $('modalRestart').style.display = 'none';
  $('modalClose').textContent = '了解';
  $('modalBackdrop').classList.add('show');
});

// 點擊科技點：切換到科技樹分頁
$('statTechStat').addEventListener('click', () => {
  switchTab('tech');
});

// 點擊文化點：切換到文化樹分頁
$('statCultureStat').addEventListener('click', () => {
  switchTab('culture');
});

// 點擊回合/人口/存糧：切換到城市分頁
$('statTurnStat').addEventListener('click', () => {
  switchTab('city');
});
$('statPOPStat').addEventListener('click', () => {
  switchTab('city');
});
$('statFoodStat').addEventListener('click', () => {
  switchTab('city');
});
// ===== 點擊頂部統計列的互動處理(結束) ===== //

for(const kind of Object.keys(TREES)){
  const prefix = TREES[kind].prefix;
  $(`${prefix}ModalClose`).addEventListener('click', () => closeTreeModal(kind));
  $(`${prefix}ModalResearchBtn`).addEventListener('click', () => unlockSelectedNode(kind, render));
}

$('eventModalClose').addEventListener('click', () => {
  $('eventModalBackdrop').classList.remove('show');
  render();
});

function switchTab(tab){
  if(currentTab == tab) return;
  playSound('page');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if(btn) btn.classList.add('active');
  currentTab = tab;
  document.getElementById('tab-' + tab).classList.add('active');
  hideCellTip(); tipKey = null;
  render();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
});

// ===== 鍵盤快速鍵 =====
// 快速鍵一律「代按」畫面上真正的按鈕：按鈕被停用時快速鍵也不會動作，
// 邏輯只有一份（按鈕的 click 處理函式），不會出現「快速鍵能做、按鈕不能做」的漏洞。
const MODALS = [   // [視窗 backdrop, 關閉按鈕]；排在前面的優先關閉
  ['shortcutModalBackdrop', 'shortcutModalClose'],
  ['eventModalBackdrop', 'eventModalClose'],
  ['techModalBackdrop', 'techModalClose'],
  ['cultureModalBackdrop', 'cultureModalClose'],
  ['modalBackdrop', 'modalClose']
];
const isShown = id => $(id).classList.contains('show');

function pressButton(id, blockedMsg){
  if(currentTab !== 'city') return;
  const btn = $(id);
  if(!btn) return;
  if(btn.disabled) return message(blockedMsg, true);
  btn.click();
}
function pressBuildingButton(id, blockedMsg){
  if(currentTab !== 'city') return;
  const btn = $(id);
  if(!btn) return message('請先點選棋盤上的一座建築。', true);
  if(btn.disabled) return message(blockedMsg, true);
  btn.click();
}

initKeyboard({
  isModalOpen: () => MODALS.some(([b]) => isShown(b)),
  isHelpOpen: () => isShown('shortcutModalBackdrop'),
  closeModal: () => { const m = MODALS.find(([b]) => isShown(b)); if(m) $(m[1]).click(); },
  toggleHelp: () => $('shortcutModalBackdrop').classList.add('show'),
  tab: switchTab,
  selectSlot: (i) => {
    if(currentTab !== 'city') return;
    const card = state.hand[i];
    if(!card) return message(`第 ${i + 1} 格沒有手牌。`, true);
    onHandCardClick(card);
  },
  endTurn: () => pressButton('endTurnBtn', '遊戲已結束。'),
  draw: () => pressButton('drawBtn', '無法抽牌：金幣不足（需 3 ◈）、手牌已滿，或遊戲已結束。'),
  refreshShop: () => pressButton('refreshShopBtn', '無法刷新商店：金幣不足（需 2 ◈）或遊戲已結束。'),
  upgrade: () => pressBuildingButton('upgradeBtn', '無法升級：金幣不足、已達最高等級，或遊戲已結束。'),
  demolish: () => pressBuildingButton('demolishBuildingBtn', '遊戲已結束，無法拆除。'),
  escape: () => {
    if(pendingDemolish){ clearPendingDemolish(); render(); message('已取消拆除。'); return; }
    if(state.selected){ state.selected = null; render(); message('已取消選牌。'); return; }
    if(state.inspectedCell){ state.inspectedCell = null; render(); message('已取消選取格子。'); }
  }
});

$('shortcutList').innerHTML = SHORTCUT_LIST.map(s => `
  <div class="sc-row">
    <span class="sc-keys">${s.keys.map(k => `<kbd>${k}</kbd>`).join('')}</span>
    <span class="sc-desc">${s.desc}${s.scope ? `<small>（${s.scope}分頁）</small>` : ''}</span>
  </div>`).join('');
$('helpBtn').addEventListener('click', () => $('shortcutModalBackdrop').classList.add('show'));
$('shortcutModalClose').addEventListener('click', () => $('shortcutModalBackdrop').classList.remove('show'));

document.title = `Card City｜卡牌城市建造 v${VERSION}`;
document.querySelectorAll('[data-version]').forEach(el => { el.textContent = 'v' + VERSION; });
startGame();

// 啟動時檢查建築 / 科技設定。有打錯的地方會在這裡直接指出來，而不是讓建築「安靜地沒有效果」。
const configProblems = validateCards();
if(configProblems.length){
  console.error(`設定有 ${configProblems.length} 個問題：\n` + configProblems.join('\n'));
  message(`⚠ 建築 / 科技設定有 ${configProblems.length} 個問題，請按 F12 開啟主控台查看詳情。`, true);
}
// ===== 公告與新手教學邏輯 =====

// 開啟公告彈窗
function openNoticeModal(defaultTab = 'tutorial') {
  switchNoticeTab(defaultTab);
  $('noticeModalBackdrop').classList.add('show');
}

// 切換公告裡的分頁（新手教學 / 更新日誌）
function switchNoticeTab(tabName) {
  if (tabName === 'tutorial') {
    $('noticeTabTutorial').style.display = 'block';
    $('noticeTabChangelog').style.display = 'none';
    $('noticeTabTutorialBtn').classList.add('active');
    $('noticeTabChangelogBtn').classList.remove('active');
  } else {
    $('noticeTabTutorial').style.display = 'none';
    $('noticeTabChangelog').style.display = 'block';
    $('noticeTabTutorialBtn').classList.remove('active');
    $('noticeTabChangelogBtn').classList.add('active');
  }
}

// 檢查是否為「首次遊玩」或「有版號更新」
function checkNoticeModalOnLoad() {
  const lastSeenVersion = localStorage.getItem('cardCity_lastSeenVersion');

  if (!lastSeenVersion) {
    // 1. 完全的新玩家：彈出公告（預設顯示新手教學）
    openNoticeModal('tutorial');
    localStorage.setItem('cardCity_lastSeenVersion', VERSION);
  } else if (lastSeenVersion !== VERSION) {
    // 2. 老玩家遭遇新版本更新：自動彈出公告，且「預設直接切到更新日誌分頁」！
    openNoticeModal('changelog');
    localStorage.setItem('cardCity_lastSeenVersion', VERSION);
  }
}
function initUpdateLogVersion() {
  const latestTitleEl = $('latestVersionTitle');
  if (latestTitleEl) {
    latestTitleEl.textContent = `v${VERSION} (目前版本)`;
  }
}

// 事件綁定
$('noticeBtn').addEventListener('click', () => openNoticeModal('tutorial')); // 點擊按鈕預設開新手教學
$('noticeModalClose').addEventListener('click', () => $('noticeModalBackdrop').classList.remove('show'));
$('noticeModalConfirmBtn').addEventListener('click', () => $('noticeModalBackdrop').classList.remove('show'));

$('noticeTabTutorialBtn').addEventListener('click', () => switchNoticeTab('tutorial'));
$('noticeTabChangelogBtn').addEventListener('click', () => switchNoticeTab('changelog'));

// 在遊戲初始化後呼叫檢查
checkNoticeModalOnLoad();
initUpdateLogVersion();