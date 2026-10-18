import { state, setState, soundEnabled, setSoundEnabled, playSound, message } from './state.js';
import { HAND_LIMIT, TERRAIN_NAMES, CARDS, TECH_TREE, CULTURE_TREE, MISSION_POOL, EVENT_POOL, cardPool, MAX_TURNS, VERSION } from './config.js';
import { rand, calculate, terrainMap, shuffle, drawFromDeck, makeShop, rebuildShop, calculateTotalScore, getScoreBreakdown, getRandomMissions, endTurn, placeCard, demolishCell, previewPlacement, upgradeInspectedBuilding, zeroScores, addLog } from './game.js';
import { countBuilding, uniqueBuildingTypes } from './board.js';
import { renderBoard, renderHand, renderShop, renderMissions, updateMissionTabNotification, renderLog, renderBuildingInfo, buildPlacementTip, setCellTip, moveCellTip, hideCellTip } from './render.js';
import { TREES, renderTree, openTreeModal, closeTreeModal, unlockSelectedNode } from './trees.js';
import { writeSave, readSave, applySave } from './save.js';
import { initKeyboard, SHORTCUT_LIST } from './keys.js';
import { validateCards } from './validate.js';

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
  updateMissionTabNotification();

  switch(currentTab){
    case 'city':    renderCityTab(); break;
    case 'tech':    renderTree('tech', id => openTreeModal('tech', id)); break;
    case 'culture': renderTree('culture', id => openTreeModal('culture', id)); break;
    case 'missions': renderMissions(claimMission); break;
  }
}

// 頂部統計列：每次 render 都更新（內容很小）。科技點 / 文化點也在這裡更新，
// 因此即使科技樹分頁沒有被繪製，頂部數字也一定是最新的。
function renderStats(){
  $('turnStat').textContent = `${state.turn} / ${MAX_TURNS}`;
  $('phaseStat').textContent = state.gameOver ? '遊戲結束' : '建設階段';
  $('goldStat').textContent = `${state.gold} (+${state.perTurn.gold})`;
  $('incomeStat').textContent = `每回合結算`;
  
  $('popStat').textContent = `${state.population} / ${state.maxPopulation}`;
  
  let netFood = state.perTurn.food - state.maxPopulation;
  $('foodStat').textContent = `${state.storedFood} (${netFood >= 0 ? '+' : ''}${netFood})`;
  $('foodConsumeStat').textContent = `產出 ${state.perTurn.food} / 消耗 ${state.maxPopulation}`;
  
  if(state.storedFood === 0 && netFood < 0){
    $('foodDeficitHint').textContent = '⚠️ 存糧見底！';
    $('foodDeficitHint').style.color = 'var(--red)';
  } else if(state.perTurn.food < state.maxPopulation){
    $('foodDeficitHint').textContent = '⚠️ 糧食短缺！';
    $('foodDeficitHint').style.color = 'var(--red)';
  } else {
    $('foodDeficitHint').textContent = '糧食充足';
    $('foodDeficitHint').style.color = 'var(--green)';
  }
  
  $('faithStat').textContent = `${state.faith} (+${state.perTurn.faithPoints})`;
  $('techPointsHeaderStat').textContent = `${state.techPoints} (+${state.perTurn.techPoints})`;
  $('culturePointsHeaderStat').textContent = `${state.culturePoints} (+${state.perTurn.culturePoints})`;
  $('scoreStat').textContent = calculateTotalScore();
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
    let terrainName = TERRAIN_NAMES[c.terrain];
    message(`已選取 ${terrainName}地形 (座標 ${c.x}, ${c.y})｜選擇手牌後可在此建造。`);
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

function onUpgradeClick(){
  clearPendingDemolish();
  upgradeInspectedBuilding();
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
  setState({
    turn:1, gold:25, faith: 15,
    basePopulation:3, maxPopulation:3, lostPopulation:0, storedFood:5,
    bonusScore: zeroScores(),      // 建造時永久獲得的分數（onBuild 的 xxxScore）
    scores: zeroScores(),          // 目前的最終分數（calculate 會重算）
    perTurn: {},                   // 每回合的資源產出（calculate 會重算）
    techPoints: 0, unlockedTechs: [],
    culturePoints: 0, unlockedCultures: [],
    activeMissions: [],
    board:terrainMap(), hand:[], deck:shuffle([...cardPool,...cardPool]), 
    shop: [],
    selected:null, log:[],
    gameOver:false
  });

  for(let id in TECH_TREE){ TECH_TREE[id].unlocked = false; }
  for(let id in CULTURE_TREE){ CULTURE_TREE[id].unlocked = false; }

  // 任務的 baseline 取自 state.board，必須在新 state 設定完成之後才產生
  state.activeMissions = getRandomMissions(3);
  state.shop = makeShop();
  
  state.hand.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()), type: 'farm' });
  for(let i=0;i<4;i++) state.hand.push(drawFromDeck());

  pendingDemolish = null;
  
  render();
  message('歡迎遊玩 Card City 模組化版本！');
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
    const breakdown = getScoreBreakdown().map(e => `${e.label}：${e.value}`).join('、');
    $('modalTitle').textContent = '城市建設完成！';
    $('modalText').textContent = `總積分 ${calculateTotalScore()} ★（${breakdown}）。`;
    $('modalBackdrop').classList.add('show');
  } else {
    checkRandomEvent(); // 👈 檢查並觸發隨機事件
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
function openNoticeModal() {
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

// 檢查是否為首次遊玩，如果是則自動彈出
function checkFirstTimePlayer() {
  const hasSeenNotice = localStorage.getItem('hasSeenCardCityNoticeV1');
  if (!hasSeenNotice) {
    openNoticeModal();
    localStorage.setItem('hasSeenCardCityNoticeV1', 'true');
  }
}

// 事件綁定
$('noticeBtn').addEventListener('click', openNoticeModal);
$('noticeModalClose').addEventListener('click', () => $('noticeModalBackdrop').classList.remove('show'));
$('noticeModalConfirmBtn').addEventListener('click', () => $('noticeModalBackdrop').classList.remove('show'));

$('noticeTabTutorialBtn').addEventListener('click', () => switchNoticeTab('tutorial'));
$('noticeTabChangelogBtn').addEventListener('click', () => switchNoticeTab('changelog'));

// 在遊戲初始化後呼叫檢查
checkFirstTimePlayer();