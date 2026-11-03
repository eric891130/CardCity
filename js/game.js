import { state, playSound, message } from './state.js';
import { RARITY_CONFIG , CARDS, LANDFORM_NAMES, BIOME_NAMES, TERRAIN_NAMES, SHOP_ITEMS, MISSION_POOL, cardPool, MAX_TURNS, SIZE, OUTPUTS, BASE_PER_TURN, getRequiredScoreForTurn, TECH_TREE , CULTURE_TREE } from './config.js';
import { countBuilding, uniqueBuildingTypes, hasRiver } from './board.js';
import { computeCellStats, computeOnBuild, unlockedBuildingIds, activeTreeEffects } from './effects.js';
import { generateMap, randomSeed } from './mapgen.js';

export function rand(a){return a[Math.floor(Math.random()*a.length)]}
export function shuffle(a){let b=[...a];for(let i=b.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
export function newCard(id){return {id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),type:id}}

// ===== 地圖生成 =====
// 實際的流程在 mapgen.js：種子 → 高度場與地形 → 河流 → 濕度 / 溫度 → 地貌 → 起始位置 → 品質檢查。
// terrainMap(seed)：同一個種子永遠生出同一張地圖；沒給種子就隨機挑一個。
// 回傳棋盤陣列；種子、重試次數與品質檢查結果可用 getLastMapInfo() 取得。
let lastMapInfo = null;
export function terrainMap(seed){
  const result = generateMap(seed === undefined ? randomSeed() : seed);
  lastMapInfo = { seed: result.seed, attempts: result.attempts, ok: result.ok, checks: result.checks };
  return result.map;
}
export function getLastMapInfo(){ return lastMapInfo; }

// 建築放置限制：地形與地貌分開判斷；未設定的欄位代表不限。
export function matchesLand(cell, card){
  const landformOK = !card.landforms || card.landforms.includes(cell.landform);
  const biomeOK = !card.biomes || card.biomes.includes(cell.biome);
  const riverOK = !card.requiresRiver || hasRiver(cell);
  return landformOK && biomeOK && riverOK;
}
export function landDescription(cell){
  return `${LANDFORM_NAMES[cell.landform] || cell.landform}・${BIOME_NAMES[cell.biome] || cell.biome}`;
}


// 各種「依 OUTPUTS 建立的空記錄」：scores / bonusScore 的 key 就是 OUTPUTS 裡 group:'score' 的 id
export function zeroScores(){
  const s = {};
  for(const id in OUTPUTS) if(OUTPUTS[id].group === 'score') s[id] = 0;
  return s;
}

// 目前可抽到的卡池 = 基礎卡池 + 已研發科技/文化解鎖的建築（由解鎖旗標即時推導，不修改 cardPool）
export function availableCardPool(){
  let pool = cardPool.filter(id => CARDS[id]?.rarity !== 'wonder');
  const treeEffects = activeTreeEffects();

  // 收集所有被取代的舊建築 ID
  const replacedSet = new Set();
  treeEffects.forEach(e => {
    if (e.type === 'unlockBuilding' && e.mode === 'replacePool' && e.replaces) {
      replacedSet.add(e.replaces);
    }
  });

  treeEffects.forEach(e => {
    if (e.type === 'unlockBuilding') {
      const mode = e.mode || 'addPool';

      if (mode === 'addPool' || mode === 'replacePool') {
        if (!pool.includes(e.target)) pool.push(e.target);
      } else if (mode === 'upgradeOnly') {
        pool = pool.filter(id => id !== e.target);
      }
    }
  });

  // 最終過濾掉所有被取代的舊建築
  return pool.filter(id => !replacedSet.has(id));
}

export function availableWonders(){
  return [...new Set(activeTreeEffects()
    .filter(effect => effect.type === 'unlockWonder' && CARDS[effect.target]?.rarity === 'wonder')
    .map(effect => effect.target))];
}

export function isWonderUnlocked(wonderId){
  return availableWonders().includes(wonderId);
}

function wonderAlreadyStarted(wonderId){
  return state.board.some(cell => cell.building === wonderId || cell.construction?.wonderId === wonderId);
}

export function canPlaceWonder(wonderId, cell){
  const wonder = CARDS[wonderId];
  return !!wonder && wonder.rarity === 'wonder' && !state.gameOver && isWonderUnlocked(wonderId) &&
    !wonderAlreadyStarted(wonderId) && !cell.building && !cell.construction && matchesLand(cell, wonder) &&
    state.gold >= wonder.cost.gold;
}

// 判斷某個建築目前是否「已解鎖」（可用於升級檢核或抽卡）
export function isBuildingUnlocked(buildingId) {
  // 1. 如果在初始基礎卡池中，預設已解鎖[cite: 7]
  if (cardPool.includes(buildingId)) return true;

  // 2. 檢查這個建築是否被科技樹或文化樹所控制（也就是說，它需要透過研發解鎖）
  let isControlledByTech = false;
  const allTrees = [TECH_TREE, CULTURE_TREE];
  
  for (const tree of allTrees) {
    for (const techId in tree) {
      const node = tree[techId];
      if (node.effects && node.effects.some(e => e.type === 'unlockBuilding' && e.target === buildingId)) {
        isControlledByTech = true;
        break;
      }
    }
    if (isControlledByTech) break;
  }

  // 💡 關鍵修正：
  // 如果該建築受科技/文化樹控制，必須嚴格檢查玩家是否已經研發了該科技（activeTreeEffects 是否包含它）
  if (isControlledByTech) {
    const activeEffects = activeTreeEffects();
    return activeEffects.some(e => e.type === 'unlockBuilding' && e.target === buildingId);
  }

  // 3. 如果該建築「沒有」被任何科技/文化樹控制，但它是透過其他建築的「升級」取得的目標，則視為解鎖
  for (const id in CARDS) {
    const card = CARDS[id];
    if (card.upgradesTo) {
      const targets = Array.isArray(card.upgradesTo) ? card.upgradesTo : [card.upgradesTo];
      if (targets.includes(buildingId)) {
        return true;
      }
    }
  }

  return false;
}

// 依稀有度權重從目前已解鎖的卡池 (availableCardPool) 中隨機抽出一張卡片
export function drawFromDeck() {
  const pool = availableCardPool(); // 取得目前已解鎖且合法的卡片 ID 陣列
  if (!pool || pool.length === 0) return newCard('house'); // 預防空卡池

  // 將卡池依稀有度分類
  const poolByRarity = { common: [], rare: [], epic: [], legendary: [] };
  pool.forEach(id => {
    const rarity = CARDS[id]?.rarity || 'common';
    if (poolByRarity[rarity]) poolByRarity[rarity].push(id);
    else poolByRarity.common.push(id);
  });

  // 計算目前卡池中「有卡可抽」的稀有度總權重
  let totalWeight = 0;
  const availableRarities = [];

  for (const rarity in RARITY_CONFIG) {
    if (poolByRarity[rarity] && poolByRarity[rarity].length > 0) {
      const w = RARITY_CONFIG[rarity].weight || 10;
      totalWeight += w;
      availableRarities.push({ rarity, weight: w });
    }
  }

  // 隨機決定本次抽卡獲得的稀有度
  let roll = Math.random() * totalWeight;
  let chosenRarity = availableRarities[0].rarity;

  for (const item of availableRarities) {
    roll -= item.weight;
    if (roll <= 0) {
      chosenRarity = item.rarity;
      break;
    }
  }

  // 從該稀有度的候選卡片中等機率隨機抽取一張
  const candidates = poolByRarity[chosenRarity];
  const chosenType = candidates[Math.floor(Math.random() * candidates.length)];

  return newCard(chosenType);
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
//   state.maxPopulation / state.currentPopulation / state.population  人口容量 / 實際人口 / 扣掉工作人口後的可用人口
export function calculate(){
  computeCellStats(state.board);

  const perTurn = {}, scores = {};
  for(const id in OUTPUTS){
    if(OUTPUTS[id].group === 'resource') perTurn[id] = BASE_PER_TURN[id] || 0;
    if(OUTPUTS[id].group === 'score') scores[id] = (state.bonusScore && state.bonusScore[id]) || 0;
  }
  let popBonus = 0, usedPop = 0;
  let maxFoodBonus = 0;
  let totalUpkeep = 0; // 👈 累計全城建築維護費

  for(const c of state.board){
    if(!c.building) continue;
    for(const id in perTurn) perTurn[id] += c.stats[id];
    for(const id in scores) scores[id] += c.stats[id];
    popBonus += c.stats.population;
	maxFoodBonus += (c.stats.maxFood || 0);
    usedPop += (CARDS[c.building].cost.pop || 0) * (c.level || 1);

    // 計算該建築的維護費（隨等級倍增）
    let cardDef = CARDS[c.building];
    if(cardDef && cardDef.upkeep) {
      totalUpkeep += cardDef.upkeep * (c.level || 1);
    }
  }

  // 將總維護費從每回合金幣產出中扣除;每一點實際人口提供 1 點金幣收入
  if(perTurn.gold !== undefined) {
    perTurn.gold -= totalUpkeep;
	perTurn.gold += (state.currentPopulation || 0);
  }

  state.maxStoredFood = Math.max(10, 25 + maxFoodBonus);

  // 人口容量由建築效果與永久加成決定；糧食短缺只影響實際人口，不再永久扣減容量。
  state.maxPopulation = Math.max(1, popBonus + (Number(state.bonusPopulation) || 0));
  // 舊存檔若沒有 currentPopulation，先以舊人口容量推定實際人口。
  if(!Number.isFinite(state.currentPopulation)) state.currentPopulation = state.maxPopulation;
  state.currentPopulation = Math.max(0, state.currentPopulation);
  // 人口容量只限制自然成長，不會刪除已存在的居民；超額居民仍可工作並消耗糧食。
  state.population = Math.max(0, state.currentPopulation - usedPop);
  state.perTurn = perTurn;
  state.scores = scores;
  
  // 計算本回合預計增長的人口數（供 UI 顯示用）
  const foodProduction = perTurn.food || 0;
  const netFood = foodProduction - state.currentPopulation;
  const foodAfterBalance = state.storedFood + netFood;
  if (foodAfterBalance < 0 || state.currentPopulation >= state.maxPopulation) {
    state.projectedGrowth = 0;
  } else {
    const foodStockGrowth = Math.floor(foodAfterBalance / 10);
    const netFoodGrowth = Math.max(0, Math.floor(netFood));
    const capacityGrowth = Math.max(0, state.maxPopulation - state.currentPopulation);
    state.projectedGrowth = Math.min(foodStockGrowth, netFoodGrowth, capacityGrowth);
  }
}

// ===== 計分（集中管理）=====
// 最終分數 = 所有 group:'score' 的產出加總。想新增分數種類：在 config.js 的 OUTPUTS 加一筆 group:'score' 即可。
export function getScoreBreakdown(){
  let buildingEffectScore = (state.scores && state.scores.buildingScore) || 0;
  
  let rarityScore = 0;
  if (state && state.board) {
    state.board.forEach(cell => {
      if (cell.building) {
        let cardDef = CARDS[cell.building];
        const rConfig = RARITY_CONFIG[cardDef?.rarity] || RARITY_CONFIG.common;
        rarityScore += (rConfig?.score ?? 2) * (cell.level || 1);
      }
    });
  }

  let maxPop = state.maxPopulation || 1;
  let populationScore = Math.floor(maxPop / 10) * 30;

  let techCultureScore = (getUnlockedTechAndCultureCount() - 2) * 10;
  let achievementScore = state.achievementScore || 0;

  return [
    { key: 'buildingEffect', label: '建築效果分', value: buildingEffectScore },
    { key: 'rarity', label: '建築稀有度分', value: rarityScore },
    { key: 'population', label: '人口規模里程碑', value: populationScore },
    { key: 'techCulture', label: '科技與文化解鎖', value: techCultureScore },
    { key: 'achievement', label: '成就得分', value: achievementScore }
  ];
}

// 計算目前已解鎖的科技與文化節點總數
export function getUnlockedTechAndCultureCount() {
  let count = 0;
  // 假設你的 tech 和 culture 解鎖狀態記錄在 state 裡面 (例如 state.unlockedTechs 與 state.unlockedCultures)
  if (state.unlockedTechs) count += Object.keys(state.unlockedTechs).length;
  if (state.unlockedCultures) count += Object.keys(state.unlockedCultures).length;
  return count;
}

// 綜合計分函式
export function calculateTotalScore(){
  return getScoreBreakdown().reduce((total, item) => total + item.value, 0);
}

// ===== 計分（集中管理）結束=====//

export function canAfford(type){
  const d=CARDS[type];
  return state.gold >= d.cost.gold && state.population >= d.cost.pop;
}

export function canPlace(card,cell){
  const d=CARDS[card.type];
  if(cell.construction || d?.rarity === 'wonder') return false;
  if(cell.building){
    if(cell.building !== card.type) return false;
    const level = cell.level || 1;
    return !state.gameOver && level < 3 && state.gold >= d.cost.gold * (level + 1) && state.population >= (d.cost.pop || 0);
  }
  if(!matchesLand(cell, d)) return false;
  return canAfford(card.type);
}

function snapshotTotals(){
  const t = {
    foodNet: state.perTurn.food - state.currentPopulation, // 糧食淨值 = 產出 − 實際人口消耗
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
  const result = { reason:null, delta:null, once:null, upgrade:null };
  if(cell.construction){ result.reason = '這格正在建造奇觀，暫時不能放置其他建築。'; return result; }
  if(d.rarity === 'wonder'){ result.reason = '奇觀請從奇觀分頁選擇後開始建造。'; return result; }
  const isLevelUpgrade = cell.building === card.type;
  if(isLevelUpgrade){
    const level = cell.level || 1;
    result.upgrade = { cardCost:d.cost.gold, extraCost:d.cost.gold * level, totalCost:d.cost.gold * (level + 1), nextLevel:level + 1 };
  }

  if(cell.building && !isLevelUpgrade){ result.reason = '這格已有不同類型的建築；只能用相同建築卡升級。'; return result; }
  if(isLevelUpgrade && (cell.level || 1) >= 3){ result.reason = '建築已達 Lv.3，無法再升級。'; return result; }
  if(!cell.building && !matchesLand(cell, d)){ result.reason = d.requiresRiver && !hasRiver(cell) ? `${d.name}必須建在有河流流經邊界的格子旁。` : `${d.name}不能建在${landDescription(cell)}。`; return result; }
  if(state.gameOver) result.reason = '遊戲已結束。';
  else if(isLevelUpgrade && state.gold < d.cost.gold * ((cell.level || 1) + 1)) result.reason = `金幣不足（卡牌費 ${d.cost.gold} ◈，升級費 ${d.cost.gold * (cell.level || 1)} ◈，合計 ${d.cost.gold * ((cell.level || 1) + 1)} ◈）。`;
  else if(!isLevelUpgrade && state.gold < d.cost.gold) result.reason = `金幣不足（需要 ${d.cost.gold} ◈，目前 ${state.gold} ◈）。`;
  else if(state.population < d.cost.pop) result.reason = `可用人口不足（需要 ${d.cost.pop} 👤，目前 ${state.population} 👤）。`;

  calculate();
  const before = snapshotTotals();
  const prevBuilding = cell.building, prevLevel = cell.level, prevBiome = cell.biome;
  try{
    cell.building = card.type;
    cell.level = isLevelUpgrade ? (cell.level || 1) + 1 : 1;
    if(!isLevelUpgrade && cell.biome === 'forest' && !d.preserveForest ) cell.biome = 'grassland'; // 開發森林後保留地形，只把地貌改為草原
    calculate();
    const after = snapshotTotals();
    result.delta = {};
    for(const k in before) result.delta[k] = after[k] - before[k];
  } finally {
    cell.building = prevBuilding;
    cell.level = prevLevel;
    cell.biome = prevBiome;
    calculate();
  }

  if(!isLevelUpgrade){   // 同卡升級不會觸發一次性效果
    const gains = computeOnBuild(card.type, cell);
    if(Object.keys(gains).length) result.once = gains;
  }
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
  if(cell.construction){ message('這格正在建造奇觀，暫時不能放置其他建築。', true); return false; }
  if(d.rarity === 'wonder'){ message('奇觀請從奇觀分頁選擇後開始建造。', true); return false; }
  if(cell.building){
    if(cell.building === card.type) return upgradeBuildingWithCard(card, cell);
    message('這格已經有不同類型的建築；選擇相同類型的卡牌才能升級。',true);
    return false;
  }
  if(!matchesLand(cell, d)){message(d.requiresRiver && !hasRiver(cell) ? `${d.name}必須建在有河流流經邊界的格子旁。` : `${d.name}不能建在${landDescription(cell)}。`,true);return false;}
  if(state.gold < d.cost.gold){message('金幣不足！',true);return false;}
  if(state.population < d.cost.pop){message('可用人口（勞動力）不足！請先建造住宅。',true);return false;}

  state.gold -= d.cost.gold;
  cell.building=card.type;
  cell.level=1;
  if(cell.biome==='forest' && !d.preserveForest ) cell.biome='grassland';
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

export function placeWonder(wonderId, cell){
  if(state.gameOver) return false;
  const wonder = CARDS[wonderId];
  if(!wonder || wonder.rarity !== 'wonder') return false;
  if(!isWonderUnlocked(wonderId)){ message(`尚未解鎖 ${wonder.name}，請先完成對應科技或文化節點。`, true); return false; }
  if(wonderAlreadyStarted(wonderId)){ message(`${wonder.name} 已經開始建造或已完成；每局只能建造一座。`, true); return false; }
  if(cell.building || cell.construction){ message('奇觀只能建在空地上。', true); return false; }
  if(!matchesLand(cell, wonder)){
    message(wonder.requiresRiver && !hasRiver(cell) ? `${wonder.name} 必須建在有河流流經邊界的格子旁。` : `${wonder.name}不能建在${landDescription(cell)}。`, true);
    return false;
  }
  if(state.gold < wonder.cost.gold){ message(`金幣不足！建造 ${wonder.name} 需要 ${wonder.cost.gold} ◈。`, true); return false; }

  state.gold -= wonder.cost.gold;
  cell.construction = { wonderId, turnsRemaining: wonder.buildTurns };
  state.selectedWonder = null;
  state.selected = null;
  state.inspectedCell = { x: cell.x, y: cell.y };
  playSound('place');
  addLog(`開始建造奇觀 ${wonder.name}（-${wonder.cost.gold} ◈，需 ${wonder.buildTurns} 回合）。`);
  message(`開始建造 ${wonder.name}！還需 ${wonder.buildTurns} 回合完成。`, false, true);
  return true;
}

export function upgradeBuildingWithCard(card, cell){
  if(state.gameOver) return false;
  if(!cell?.building || cell.building !== card.type){ message('只能用相同類型的建築卡升級。', true); return false; }
  const d = CARDS[cell.building];
  if(d.rarity === 'wonder'){ message(`${d.name} 是奇觀，不能升級。`, true); return false; }
  const level = cell.level || 1;
  if(level >= 3){ message(`${d.name} 已達最高等級 Lv.3。`, true); return false; }

  const cardCost = d.cost.gold;
  const upgradeCost = cardCost * level;
  const totalCost = cardCost + upgradeCost;
  if(state.gold < totalCost){
    message(`金幣不足！卡牌費 ${cardCost} ◈，Lv.${level} 升級費 ${upgradeCost} ◈，合計需要 ${totalCost} ◈。`, true);
    return false;
  }
  const extraWorkers = d.cost.pop || 0;
  if(state.population < extraWorkers){
    message(`可用人口不足！升級需額外 ${extraWorkers} 👤 勞動力。`, true);
    return false;
  }

  state.gold -= totalCost;
  cell.level = level + 1;
  // 「建造時一次性獲得」只在『新蓋』與『改造成該建築』時觸發；同卡升級等級不會再領一次。
  cell.stats = {};
  state.hand = state.hand.filter(handCard => handCard.id !== card.id);
  state.selected = null;
  playSound('upgrade');
  calculate();
  message(`使用 ${d.name} 卡牌升級至 Lv.${cell.level}，卡牌費 ${cardCost} ◈ + 升級費 ${upgradeCost} ◈。`, false, true);
  addLog(`${d.name} 升級至 Lv.${cell.level}（卡牌費 ${cardCost} ◈ + 升級費 ${upgradeCost} ◈，額外消耗 ${extraWorkers} 👤）。`);
  return true;
}

export function demolishCell(cell) {
  if(state.gameOver) return false;
  if(!cell.building) { message('這格沒有建築可以拆除。', true); return false; }
  let d = CARDS[cell.building];
  if(d?.rarity === 'wonder'){ message(`${d.name} 是奇觀，不能拆除。`, true); return false; }
  cell.building = null;
  cell.level = 1;
  playSound('place');
  calculate();
  playSound('demolish');
  message(`已拆除 ${d.name}（拆除不會退還金錢）。`, false, true);
  addLog(`拆除了 ${d.name}。`);
  return true;
}

export function upgradeInspectedBuilding(targetChoiceId = null) {
  if(!state.inspectedCell) return false;
  let c = state.board.find(cell => cell.x === state.inspectedCell.x && cell.y === state.inspectedCell.y);
  if(!c || !c.building) { message('未選取有效建築。', true); return false; }
  if(state.gameOver) { message('遊戲已結束，無法升級或改造建築。', true); return false; }

  let d = CARDS[c.building];
  if(d?.rarity === 'wonder'){ message(`${d.name} 是奇觀，不能升級或改造。`, true); return false; }
  const level = Math.max(1, Math.min(3, Math.floor(c.level || 1)));
  if(targetChoiceId === null){ message('請打出相同類型的建築卡並放到原建築格進行升級。', true); return false; }
  if(level < 3){
    message(`${d.name} 必須先升至 Lv.3 才能改造。`, true);
    return false;
  }
  
  // 1. 檢查是否有填寫升級目標
  if(!d.upgradesTo || (Array.isArray(d.upgradesTo) && d.upgradesTo.length === 0)) {
    message(`${d.name} 已達最終形態，無法繼續升級。`, true);
    return false;
  }

  // 2. 確定升級目標 ID
  let targetCardId = Array.isArray(d.upgradesTo) ? (targetChoiceId || d.upgradesTo[0]) : d.upgradesTo;
  let targetCard = CARDS[targetCardId];
  
  if(!targetCard) {
    message('找不到指定的升級目標建築設定。', true);
    return false;
  }

  // 3. 🔍 【新增升級解鎖檢測】檢測玩家是否已經解鎖該目標建築
  if (!isBuildingUnlocked(targetCardId)) {
    message(`尚未解鎖 ${targetCard.emoji} ${targetCard.name}！請先在科技或文化樹研發對應技術。`, true);
    return false;
  }

  // 💡 注意：這裡故意「不檢查」 targetCard 的 landforms 與 biomes 限制，
  // 保持玩家可以無視地形限制將舊建築原地改造升級的趣味性！
  // 但河流需求是核心條件，必須保留。
  if(targetCard.requiresRiver && !hasRiver(c)){
    message(`${targetCard.name}必須建在有河流流經邊界的格子旁，這座建築無法在此升級。`, true);
    return false;
  }

  // 4. 計算升級花費與人口勞動力差值
  let upgradeCost = d.upgradeCost ? d.upgradeCost.gold : targetCard.cost.gold;
  if(state.gold < upgradeCost) {
    message(`金幣不足！升級為 ${targetCard.name} 需要 ${upgradeCost} ◈（目前擁有 ${state.gold} ◈）。`, true);
    return false;
  }

  let popDiff = (targetCard.cost.pop || 0) - (d.cost.pop || 0) * level;
  if(popDiff > 0 && state.population < popDiff) {
    message(`可用人口不足！升級為 ${targetCard.name} 需要額外 ${popDiff} 👤 勞動力。`, true);
    return false;
  }

  // 5. 執行升級轉職
  state.gold -= upgradeCost;
  c.building = targetCardId;
  c.level = 1;
  c.stats = {};

  // 改造等同「蓋出」新建築：觸發目標建築的「建造時一次性獲得」（鄰居數以改造當下的棋盤計算）。
  const gains = computeOnBuild(targetCardId, c);
  if(Object.keys(gains).length){
    applyGains(gains);
    addLog(`${targetCard.name} 改造完成：獲得 ${describeGains(gains)}。`);
  }

  playSound('upgrade');
  calculate();
  message(`成功將 ${d.name} 升級改造為 ${targetCard.emoji} ${targetCard.name}！`, false, true);
  addLog(`將 ${d.name}（Lv.${level}，(${c.x},${c.y})）改造為 ${targetCard.name} Lv.1（-${upgradeCost} ◈）。`);
  return true;
}

// 取得下一個階段性目標資訊：回傳 { turn, targetScore, remaining }，若沒有下一個門檻則回傳 null
export function getNextMilestone() {
  const currentTurn = state.turn;
  const currentScore = calculateTotalScore();
  
													 
  const upcomingTurns = [];
  for (let turn = 10; turn < MAX_TURNS; turn += 10) {
    if (turn >= currentTurn) upcomingTurns.push(turn);
  }
  if (upcomingTurns.length === 0) return null;

																	

  const targetTurn = upcomingTurns[0];
  const targetScore = getRequiredScoreForTurn(targetTurn);
															

  return {
    turn: targetTurn,
    targetScore,
    remaining: Math.max(0, targetScore - currentScore)
  };
}

function advanceWonderConstructions(){
  for(const cell of state.board){
    if(!cell.construction) continue;
    const construction = cell.construction;
    construction.turnsRemaining = Math.max(0, construction.turnsRemaining - 1);
    const wonder = CARDS[construction.wonderId];
    if(construction.turnsRemaining > 0){
      addLog(`${wonder.name}施工中，還需 ${construction.turnsRemaining} 回合。`);
      continue;
    }

    delete cell.construction;
    cell.building = construction.wonderId;
    cell.level = 1;
    if(cell.biome === 'forest' && !wonder.preserveForest) cell.biome = 'grassland';
    const gains = computeOnBuild(construction.wonderId, cell);
    if(Object.keys(gains).length){
      applyGains(gains);
      addLog(`${wonder.name}完工：獲得 ${describeGains(gains)}。`);
    }
    playSound('win');
    addLog(`奇觀 ${wonder.name} 已完工！`);
  }
}

export function endTurn(){
  if(state.gameOver) return;
  if(state.tradePrices){
    const change = Math.floor(Math.random() * 11) - 5;
    state.tradePrices.stockPrice = Math.max(1, state.tradePrices.stockPrice + change);
    state.tradePrices.stockHistory.push(state.tradePrices.stockPrice);
    state.tradePrices.stockHistory = state.tradePrices.stockHistory.slice(-30);
  }
  const populationAtSettlementStart = state.currentPopulation;
  
  // 糧食先供應目前實際人口；工作人口仍是居民，因此同樣消耗糧食。
  const foodProduction = state.perTurn.food || 0;
  const netFood = foodProduction - state.currentPopulation;
  const foodAfterBalance = state.storedFood + netFood;

  if(foodAfterBalance < 0){
    // 存糧與當回合產量仍不足的數量，就是本回合糧食短缺量。
    const shortage = Math.ceil(-foodAfterBalance);
    const lost = Math.min(state.currentPopulation, shortage);
    state.currentPopulation -= lost;
    state.storedFood = 0;
    addLog(`⚠️ 糧食短缺 ${shortage} 點，人口流失 ${lost} 人。`);
  } else {
	  
    if (foodAfterBalance > state.maxStoredFood) {
      const spoiled = Math.floor(foodAfterBalance - state.maxStoredFood);
      state.storedFood = state.maxStoredFood;
      addLog(`🌾 糧食倉儲已滿 (${state.maxStoredFood})，${spoiled} 點糧食腐敗浪費了。`);
    } else {
      state.storedFood = foodAfterBalance;
    }
    
    // 人口成長同時受糧食存量、糧食淨值與剩餘人口容量限制；超過容量時不成長，但不會自動流失。
    // 每累積 10 點存糧提供 1 個成長名額；淨糧食盈餘限制成長速度。
    const foodStockGrowth = Math.floor(state.storedFood / 10);
    const netFoodGrowth = Math.max(0, Math.floor(netFood));
    const capacityGrowth = Math.max(0, state.maxPopulation - state.currentPopulation);
    const growth = Math.min(foodStockGrowth, netFoodGrowth, capacityGrowth);
    if(growth > 0){
      state.currentPopulation += growth;
      addLog(`👥 糧食充足，人口增加 ${growth} 人。`);
    }
  }

  // 其餘資源產出結算...
  for(const id in state.perTurn){
    if(id === 'food') continue;
    const amount = id === 'gold'
      ? state.perTurn[id] - populationAtSettlementStart + state.currentPopulation
      : state.perTurn[id];
    const key = OUTPUTS[id].stateKey;
    // 負面鄰接可能讓科技 / 文化 / 信仰的產出變成負數：這些點數最低扣到 0；金幣沿用原本規則（可為負）。
    state[key] = id === 'gold' ? state[key] + amount : Math.max(0, state[key] + amount);
  }
  playSound('coin');

  // 人口歸零與回合門檻判定...（保持原本邏輯）
  if (state.currentPopulation <= 0) {
    state.gameOver = true;
    state.failReason = '糧食短缺導致人口完全流失，城市宣告荒廢！';
    return;
  }

  state.turn++;
  state.selected = null;
  advanceWonderConstructions();
  calculate();

  // 每 10 回合依公式檢查一次中期分數，不再依賴固定門檻表。
  const checkingTurn = state.turn - 1;
											
  const requiredScore = getRequiredScoreForTurn(checkingTurn);
  if (requiredScore !== null && calculateTotalScore() < requiredScore) {
    state.gameOver = true;
    state.failReason = `第 ${checkingTurn} 回合結束時總積分未達標（需要 ${requiredScore} 分）。`;
    return;
	 
  }

  if(state.turn > MAX_TURNS){
    state.gameOver = true;
    state.failReason = null;
  } else {
    state.hand = state.hand.filter(c => c.locked);
    while(state.hand.length < 5) {
      state.hand.push(drawFromDeck());
    }
    rebuildShop();
  }
}
