import { state, playSound, message } from './state.js';
import { RARITY_CONFIG , CARDS, TERRAIN_NAMES, SHOP_ITEMS, MISSION_POOL, cardPool, MAX_TURNS, SIZE, OUTPUTS, BASE_PER_TURN } from './config.js';
import { countBuilding, uniqueBuildingTypes } from './board.js';
import { computeCellStats, computeOnBuild, unlockedBuildingIds } from './effects.js';

export function rand(a){return a[Math.floor(Math.random()*a.length)]}
export function shuffle(a){let b=[...a];for(let i=b.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
export function newCard(id){return {id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),type:id}}

export function terrainMap(){
  let map=[];
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    let r=Math.random(),t=r<.12?'water':r<.24?'mountain':r<.40?'forest':'plain';
    map.push({x,y,terrain:t,building:null,level: 1,stats:{}})
  }
  return map;
}

// 各種「依 OUTPUTS 建立的空記錄」：scores / bonusScore 的 key 就是 OUTPUTS 裡 group:'score' 的 id
export function zeroScores(){
  const s = {};
  for(const id in OUTPUTS) if(OUTPUTS[id].group === 'score') s[id] = 0;
  return s;
}

// 目前可抽到的卡池 = 基礎卡池 + 已研發科技/文化解鎖的建築（由解鎖旗標即時推導，不修改 cardPool）
export function availableCardPool(){
  const pool = [...cardPool];
  for(const b of unlockedBuildingIds()) if(!pool.includes(b)) pool.push(b);
  return pool;
}

// 依稀有度取得牌庫張數
export function getCardDeckCount(cardId) {
  const card = CARDS[cardId];
  if (!card || !card.rarity || !RARITY_CONFIG[card.rarity]) return 2; // 預設 2 張
  return RARITY_CONFIG[card.rarity].count;
}

// 依稀有度初始化牌庫
export function initDeck(pool) {
  let deck = [];
  pool.forEach(id => {
    let count = getCardDeckCount(id);
    for (let i = 0; i < count; i++) {
      deck.push(id); 
    }
  });
  return shuffle(deck);
}

// 研發出新建築時，依稀有度加入張數
export function addCardsToDeck(type) {
  let count = getCardDeckCount(type);
  state.deck = shuffle([...state.deck, ...Array(count).fill(type)]);
}

export function drawFromDeck(){if(!state.deck.length)state.deck=shuffle(availableCardPool());return newCard(state.deck.pop())}

// 統計目前牌庫剩餘的各張卡片數量
export function getDeckComposition() {
  const currentPool = availableCardPool();
  const counts = {};
  
  // 初始化可用卡池的計數為 0
  currentPool.forEach(id => { counts[id] = 0; });
  
  // 計算 state.deck 裡實際剩餘的張數（兼容物件 {type: 'xxx'} 或純字串 'xxx'）
  if (state && state.deck) {
    state.deck.forEach(card => {
      // 判斷 card 是物件（有 type 屬性）還是直接就是字串 id
      const cardType = (typeof card === 'object' && card !== null) ? card.type : card;
      
      if (cardType && counts[cardType] !== undefined) {
        counts[cardType]++;
      } else if (cardType) {
        counts[cardType] = 1; // 預防萬一卡池外的新解鎖卡片
      }
    });
  }
  
  return {
    total: state && state.deck ? state.deck.length : 0,
    counts: counts
  };
}
// 商店只存 {id, locked}，不存函式（函式無法 JSON 存檔），顯示/購買時再從 SHOP_ITEMS 查表
export function makeShop(){return shuffle(SHOP_ITEMS).slice(0, 3).map(item => ({ id: item.id, locked: false }));}
// 重新整理商店：保留鎖定的商品，其餘重抽補滿 3 格（回合開始與手動刷新共用）
export function rebuildShop(){
  const locked = (state.shop || []).filter(i => i.locked);
  const lockedIds = new Set(locked.map(i => i.id));
  const fresh = makeShop().filter(i => !lockedIds.has(i.id));
  const next = [...locked];
  while(next.length < 3 && fresh.length) next.push(fresh.pop());
  state.shop = next;
}
export function addLog(msg){state.log.unshift({turn:state.turn,msg});state.log=state.log.slice(0,12)}

export function getRandomMissions(count, excludeIds = []) {
  let available = MISSION_POOL.filter(m => !excludeIds.includes(m.id));
  if (available.length < count) available = [...MISSION_POOL];
  let shuffled = shuffle(available);
  return shuffled.slice(0, count).map(m => ({ 
    ...m, 
    instanceId: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    baseline: (state && state.board) ? (m.building === '__variety__' ? uniqueBuildingTypes() : countBuilding(m.building)) : 0
  }));
}

// ===== 重新計算整個城市 =====
// 每格的產出（cell.stats）由 effects.js 算出；這裡負責加總成：
//   state.perTurn    每回合的資源產出（含基礎產出 BASE_PER_TURN）
//   state.scores     目前的最終分數（建築的 xxxScore + 建造時永久獲得的 state.bonusScore）
//   state.maxPopulation / state.population  人口上限 / 扣掉建築佔用後的可用人口
export function calculate(){
  computeCellStats(state.board);

  const perTurn = {}, scores = {};
  for(const id in OUTPUTS){
    if(OUTPUTS[id].group === 'resource') perTurn[id] = BASE_PER_TURN[id] || 0;
    if(OUTPUTS[id].group === 'score') scores[id] = (state.bonusScore && state.bonusScore[id]) || 0;
  }
  let popBonus = 0, usedPop = 0;
  for(const c of state.board){
    if(!c.building) continue;
    for(const id in perTurn) perTurn[id] += c.stats[id];
    for(const id in scores) scores[id] += c.stats[id];
    popBonus += c.stats.population;
    usedPop += CARDS[c.building].cost.pop || 0;
  }

  state.maxPopulation = Math.max(1, state.basePopulation + popBonus - state.lostPopulation);
  state.population = Math.max(0, state.maxPopulation - usedPop);
  state.perTurn = perTurn;
  state.scores = scores;
}

// ===== 計分（集中管理）=====
// 最終分數 = 所有 group:'score' 的產出加總。想新增分數種類：在 config.js 的 OUTPUTS 加一筆 group:'score' 即可。
export function getScoreBreakdown(){
  const out = [];
  for(const id in OUTPUTS){
    if(OUTPUTS[id].group !== 'score') continue;
    out.push({ key:id, label:OUTPUTS[id].label, value:(state.scores && state.scores[id]) || 0 });
  }
  return out;
}

export function calculateTotalScore(){
  // 1. 建築分總計
  let buildingScore = (state.scores && state.scores.buildingScore) || 0;
  
  // 2. 遊戲過程中產生的資源總和（金幣 + 信仰點 + 科技點 + 文化點）
  let totalResources = (state.gold || 0) + (state.faith || 0) + (state.techPoints || 0) + (state.culturePoints || 0);
  
  return buildingScore + totalResources;
}

export function canAfford(type){
  const d=CARDS[type];
  return state.gold >= d.cost.gold && state.population >= d.cost.pop;
}

export function canPlace(card,cell){
  const d=CARDS[card.type];
  if(cell.building) return false;
  if(!d.terrain.includes(cell.terrain)) return false;
  return canAfford(card.type);
}

function snapshotTotals(){
  const t = {
    foodNet: state.perTurn.food - state.maxPopulation,   // 糧食淨值 = 產出 − 人口消耗
    freePop: state.population                            // 可用人口（已扣除建築佔用）
  };
  for(const id in state.perTurn) if(id !== 'food') t[id] = state.perTurn[id];
  for(const id in state.scores) t[id] = state.scores[id];
  return t;
}

// 預覽「把這張卡放在這格」的結果，不會改動遊戲狀態：
//   reason → 無法建造的原因（null 代表可以建造；資源不足時仍會附上 delta 供規劃）
//   delta  → 放置後「整個城市」的變化：每回合資源（含對鄰近建築的加成 / 人口消耗）與最終分數
//   once   → 建造當下的一次性獲得 { output: 數量 }，沒有就是 null
// 作法：暫時放上建築 → calculate() 取得放置後的總量 → 還原並再算一次，與放置前相減。
export function previewPlacement(card, cell){
  const d = CARDS[card.type];
  const result = { reason:null, delta:null, once:null };

  if(cell.building){ result.reason = '這格已經有建築。'; return result; }
  if(!d.terrain.includes(cell.terrain)){ result.reason = `${d.name}不能放在${TERRAIN_NAMES[cell.terrain]}上。`; return result; }
  if(state.gameOver) result.reason = '遊戲已結束。';
  else if(state.gold < d.cost.gold) result.reason = `金幣不足（需要 ${d.cost.gold} ◈，目前 ${state.gold} ◈）。`;
  else if(state.population < d.cost.pop) result.reason = `可用人口不足（需要 ${d.cost.pop} 👤，目前 ${state.population} 👤）。`;

  calculate();
  const before = snapshotTotals();
  const prevLevel = cell.level, prevTerrain = cell.terrain;
  try{
    cell.building = card.type;
    cell.level = 1;
    if(cell.terrain === 'forest') cell.terrain = 'plain';   // 與 placeCard 一致：蓋在森林上會變成平原
    calculate();
    const after = snapshotTotals();
    result.delta = {};
    for(const k in before) result.delta[k] = after[k] - before[k];
  } finally {
    cell.building = null;
    cell.level = prevLevel;
    cell.terrain = prevTerrain;
    calculate();
  }

  const gains = computeOnBuild(card.type, cell);
  if(Object.keys(gains).length) result.once = gains;
  return result;
}

// ===== 建造時的一次性獲得 =====
// 資源類（gold / 點數 / 存糧）直接加進對應的 state 欄位；分數類永久記在 state.bonusScore。
function applyGains(gains){
  for(const id in gains){
    const o = OUTPUTS[id];
    if(!o) continue;
    if(o.group === 'resource') state[o.stateKey] += gains[id];
    else if(o.group === 'score') state.bonusScore[id] = (state.bonusScore[id] || 0) + gains[id];
  }
}
function describeGains(gains){
  return Object.keys(gains).map(id => {
    const o = OUTPUTS[id];
    return o.group === 'score' ? `最終${o.label} +${gains[id]}` : `${gains[id]} ${o.label}`;
  }).join('、');
}

export function placeCard(card,cell){
  if(state.gameOver)return false;
  let d=CARDS[card.type];
  if(cell.building){message('這格已經有建築！',true);return false;}
  if(!d.terrain.includes(cell.terrain)){message(`${d.name}不能放在${TERRAIN_NAMES[cell.terrain]}上。`,true);return false;}
  if(state.gold < d.cost.gold){message('金幣不足！',true);return false;}
  if(state.population < d.cost.pop){message('可用人口（勞動力）不足！請先建造住宅。',true);return false;}

  state.gold -= d.cost.gold;
  cell.building=card.type;
  cell.level=1;
  if(cell.terrain==='forest') cell.terrain='plain';
  const gains = computeOnBuild(card.type, cell);
  if(Object.keys(gains).length){
    applyGains(gains);
    addLog(`${d.name} 建造完成：獲得 ${describeGains(gains)}。`);
  }
  state.hand=state.hand.filter(c=>c.id!==card.id);
  state.selected=null;
  playSound('place');
  calculate();
  addLog(`建造了 ${d.name}（-${d.cost.gold} ◈, 消耗 ${d.cost.pop} 👤）。`);
  message(`成功建造 ${d.name}！`,false,true);
  return true;
}

export function demolishCell(cell) {
  if(state.gameOver) return false;
  if(!cell.building) { message('這格沒有建築可以拆除。', true); return false; }
  let d = CARDS[cell.building];
  cell.building = null;
  cell.level = 1;
  playSound('place');
  calculate();
  message(`已拆除 ${d.name}（拆除不會退還金錢）。`, false, true);
  addLog(`拆除了 ${d.name}。`);
  return true;
}

export function upgradeInspectedBuilding() {
  if(!state.inspectedCell) return false;
  let c = state.board.find(cell => cell.x === state.inspectedCell.x && cell.y === state.inspectedCell.y);
  if(!c || !c.building) { message('未選取有效建築。', true); return false; }

  let d = CARDS[c.building];
  let maxLevel = 3;
  let currentLevel = c.level || 1;

  if(currentLevel >= maxLevel) {
    message(`${d.name} 已經達到最高等級 (Lv.${maxLevel})！`, true);
    return false;
  }

  let upgradeCost = d.cost.gold * currentLevel;
  if(state.gold < upgradeCost) {
    message(`金幣不足！升級需要 ${upgradeCost} ◈（目前擁有 ${state.gold} ◈）。`, true);
    return false;
  }

  state.gold -= upgradeCost;
  c.level = currentLevel + 1;
  
  playSound('coin');
  calculate();
  message(`成功將 ${d.name} 升級至 Lv.${c.level}！`, false, true);
  addLog(`將 ${d.name}（(${c.x},${c.y})）升級至 Lv.${c.level}（-${upgradeCost} ◈）。`);
  return true;
}

export function endTurn(){
  if(state.gameOver) return;
  
  // 糧食：產出 − 人口消耗，結算進存糧；存糧耗盡就流失人口
  let netFood = state.perTurn.food - state.maxPopulation;
  state.storedFood += netFood;

  if(state.storedFood < 0){
    state.storedFood = 0;
    state.lostPopulation += 1;
    addLog(`⚠️ 存糧耗盡！庫存歸 0，人口流失 1 人！`);
  } else {
    addLog(`糧食結算：產出 ${state.perTurn.food}，消耗 ${state.maxPopulation}，目前存糧：${state.storedFood}`);
  }

  // 其餘資源：每回合產出累積進對應的 state 欄位（金幣、文化點、科技點、信仰點…）
  for(const id in state.perTurn){
    if(id === 'food') continue;
    state[OUTPUTS[id].stateKey] += state.perTurn[id];
  }
  playSound('coin');
  
  state.turn++;
  state.selected = null;

  if(state.turn > MAX_TURNS){
    state.gameOver = true;
  } else {
    // 1. 保留鎖定的手牌，並抽新牌補充
    state.hand = state.hand.filter(c => c.locked);
    while(state.hand.length < 5) {
      state.hand.push(drawFromDeck());
    }

    // 2. 每回合開始重置商店：保留鎖定的項目，其餘重新產生
    rebuildShop();
  }
}
