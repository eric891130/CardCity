import { state, playSound, message } from './state.js';
import { RARITY_CONFIG , CARDS, LANDFORM_NAMES, BIOME_NAMES, TERRAIN_NAMES, SHOP_ITEMS, MISSION_POOL, cardPool, MAX_TURNS, SIZE, OUTPUTS, BASE_PER_TURN, TURN_SCORE_MILESTONES } from './config.js';
import { countBuilding, uniqueBuildingTypes, hasRiver } from './board.js';
import { computeCellStats, computeOnBuild, unlockedBuildingIds, activeTreeEffects } from './effects.js';

export function rand(a){return a[Math.floor(Math.random()*a.length)]}
export function shuffle(a){let b=[...a];for(let i=b.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
export function newCard(id){return {id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),type:id}}

// 河流是格子之間的邊界，不佔用任何棋盤格。每個河段記錄在相鄰兩格的對應方向。
const RIVER_DIRS = { N:{dx:0,dy:-1,opposite:'S'}, E:{dx:1,dy:0,opposite:'W'}, S:{dx:0,dy:1,opposite:'N'}, W:{dx:-1,dy:0,opposite:'E'} };

// 💡 安全的邊界寫入輔助函式：即使在棋盤最外側，也能正確將河道邊界寫入單側或雙側格子
function addRiverEdgeToCell(board, x, y, dir) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = y * SIZE + x;
  if (!Array.isArray(board[idx].riverEdges)) board[idx].riverEdges = [];
  if (!board[idx].riverEdges.includes(dir)) {
    board[idx].riverEdges.push(dir);
  }
}

function addRiverSegment(board, x0, y0, x1, y1) {
  if (x0 === x1) {
    // 垂直線
    const x = x0;
    const y = Math.min(y0, y1);
    const leftCell = x - 1 >= 0 ? {x: x - 1, y: y} : null;
    const rightCell = x < SIZE ? {x: x, y: y} : null;

    if (leftCell && rightCell) {
      addRiverEdgeToCell(board, leftCell.x, leftCell.y, 'E');
      addRiverEdgeToCell(board, rightCell.x, rightCell.y, 'W');
    } else if (leftCell) {
      addRiverEdgeToCell(board, leftCell.x, leftCell.y, 'E');
    } else if (rightCell) {
      addRiverEdgeToCell(board, rightCell.x, rightCell.y, 'W');
    }
  } else {
    // 水平線
    const y = y0;
    const x = Math.min(x0, x1);
    const topCell = y - 1 >= 0 ? {x: x, y: y - 1} : null;
    const bottomCell = y < SIZE ? {x: x, y: y} : null;

    if (topCell && bottomCell) {
      addRiverEdgeToCell(board, topCell.x, topCell.y, 'S');
      addRiverEdgeToCell(board, bottomCell.x, bottomCell.y, 'N');
    } else if (topCell) {
      addRiverEdgeToCell(board, topCell.x, topCell.y, 'S');
    } else if (bottomCell) {
      addRiverEdgeToCell(board, bottomCell.x, bottomCell.y, 'N');
    }
  }
}

export function generateRiverEdges(board) {
  // 已有河流資料時保留，避免覆蓋既有地圖或存檔[cite: 8]
  if (board.some(c => Array.isArray(c.riverEdges) && c.riverEdges.length)) {
    return board;
  }

  let segments = [];
  let attempts = 0;
  const MIN_LENGTH = 7; // 👈 規定河流最低長度限制

  // 🔄 持續嘗試隨機生成，直到河流長度達到 7 格以上，或超過最大嘗試次數
  while (segments.length < MIN_LENGTH && attempts < 50) {
    attempts++;
    for (const c of board) c.riverEdges = [];

    const edges = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
    const chosenEdge = edges[Math.floor(Math.random() * edges.length)];

    let vx, vy;
    let lastDx = 0, lastDy = 0;

    // 隨機選取四周任一邊界作為起點[cite: 8]
    switch (chosenEdge) {
      case 'TOP':
        vx = Math.floor(Math.random() * (SIZE + 1));
        vy = 0;
        lastDy = 1;
        break;
      case 'BOTTOM':
        vx = Math.floor(Math.random() * (SIZE + 1));
        vy = SIZE;
        lastDy = -1;
        break;
      case 'LEFT':
        vx = 0;
        vy = Math.floor(Math.random() * (SIZE + 1));
        lastDx = 1;
        break;
      case 'RIGHT':
        vx = SIZE;
        vy = Math.floor(Math.random() * (SIZE + 1));
        lastDx = -1;
        break;
    }

    const visited = new Set([vx + ',' + vy]);
    segments = [];
    let steps = 0;
    const maxSteps = SIZE * SIZE * 4;

    while (steps < maxSteps) {
      const options = [];
      const dirs = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
      ];

      for (const d of dirs) {
        const nx = vx + d.dx;
        const ny = vy + d.dy;

        if (nx < 0 || nx > SIZE || ny < 0 || ny > SIZE) continue;
        if (visited.has(nx + ',' + ny)) continue;

        let w = 1.0;
        if (d.dx === lastDx && d.dy === lastDy) {
          w = 2.0; // 慣性權重
        } else if (d.dx === -lastDx && d.dy === -lastDy) {
          continue; // 禁止 180 度回頭
        }

        options.push({ dx: d.dx, dy: d.dy, w });
      }

      if (options.length === 0) break;

      let r = Math.random() * options.reduce((sum, o) => sum + o.w, 0);
      let next = options[0];
      for (const o of options) {
        r -= o.w;
        if (r <= 0) { next = o; break; }
      }

      const nx = vx + next.dx;
      const ny = vy + next.dy;

      segments.push([vx, vy, nx, ny]);
      visited.add(nx + ',' + ny);

      lastDx = next.dx;
      lastDy = next.dy;
      vx = nx;
      vy = ny;
      steps++;

      // 碰到對側或其他邊界時結束[cite: 8]
      const isAtBoundary = (vx === 0 || vx === SIZE || vy === 0 || vy === SIZE);
      if (isAtBoundary && steps > 2) {
        break;
      }
    }
  }

  console.log(`🌊 [河流系統] 成功生成河流！總長度：${segments.length} 格（嘗試次數：${attempts}）`);

  // 將所有產生的線段正式寫入棋盤格的共用邊界中
  for (const [x0, y0, x1, y1] of segments) {
    addRiverSegment(board, x0, y0, x1, y1);
  }

  return board;
}


// 以連續區域生成地形，避免每一格獨立抽籤造成棋盤像雜亂拼貼。
function boardIndex(x,y){ return y*SIZE+x; }
function orthogonalNeighbors(x,y){
  const out=[];
  if(x>0) out.push([x-1,y]);
  if(x<SIZE-1) out.push([x+1,y]);
  if(y>0) out.push([x,y-1]);
  if(y<SIZE-1) out.push([x,y+1]);
  return out;
}
function growLandformRegions(){
  const total=SIZE*SIZE;
  const counts={water:Math.max(2,Math.round(total*0.06)),mountain:Math.round(total*0.16),hill:Math.round(total*0.22)};
  counts.plain=total-counts.water-counts.mountain-counts.hill;
  const types=[];
  for(const [type,count] of Object.entries(counts)) for(let i=0;i<count;i++) types.push(type);
  // 隨機排序決定區域種子的先後，但每種地形的總量大致穩定。
  for(let i=types.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[types[i],types[j]]=[types[j],types[i]];}
  const cells=Array(total).fill(null), remaining={...counts};
  // 先建立少量區域種子，再從區域邊緣擴張，讓相同地形自然聚集。
  const seedCount={water:1,mountain:2,hill:2,plain:3};
  const seeds=[];
  for(const type of ['water','mountain','hill','plain']){
    const available=Array.from({length:total},(_,i)=>i).filter(i=>!cells[i]);
    for(let n=0;n<Math.min(seedCount[type],remaining[type]);n++){
      const i=available.splice(Math.floor(Math.random()*available.length),1)[0];
      if(i===undefined) continue;
      cells[i]=type;remaining[type]--;seeds.push(i);
    }
  }
  while(Object.values(remaining).some(n=>n>0)){
    const frontier=[];
    for(let i=0;i<total;i++) if(cells[i]){
      const x=i%SIZE,y=Math.floor(i/SIZE);
      for(const [nx,ny] of orthogonalNeighbors(x,y)){
        const ni=boardIndex(nx,ny);
        if(cells[ni]===null && !frontier.includes(ni)) frontier.push(ni);
      }
    }
    if(!frontier.length) break;
    const i=frontier[Math.floor(Math.random()*frontier.length)];
    const x=i%SIZE,y=Math.floor(i/SIZE);
    const neighborTypes=orthogonalNeighbors(x,y).map(([nx,ny])=>cells[boardIndex(nx,ny)]).filter(Boolean);
    const weights={water:remaining.water||0,mountain:remaining.mountain||0,hill:remaining.hill||0,plain:remaining.plain||0};
    // 偏向延續周圍地形；剩餘數量仍作為權重，避免單一地形吞掉整張圖。
    for(const type of Object.keys(weights)) weights[type]*=(neighborTypes.includes(type)?3:1);
    const sum=Object.values(weights).reduce((a,b)=>a+b,0);
    let pick=Math.random()*sum,type='plain';
    for(const [candidate,w] of Object.entries(weights)){pick-=w;if(pick<=0){type=candidate;break;}}
    if(!remaining[type]) type=Object.keys(remaining).find(t=>remaining[t]>0);
    cells[i]=type;remaining[type]--;
  }
  return cells;
}
function chooseBiome(landform, riverNearby=false){
  if(landform==='water') return 'water';
  if(riverNearby && Math.random()<0.42) return 'wetland';
  const choices=landform==='mountain'
    ? ['snow','snow','forest','grassland']
    : landform==='hill'
      ? ['forest','forest','grassland','grassland','snow','desert']
      : ['grassland','grassland','grassland','forest','forest','desert','snow'];
  return rand(choices);
}
export function terrainMap(){
  const landforms=growLandformRegions();
  const map=[];
  for(let i=0;i<SIZE*SIZE;i++){
    const x=i%SIZE,y=Math.floor(i/SIZE),landform=landforms[i];
    map.push({x,y,landform,biome:landform==='water'?'water':chooseBiome(landform),riverEdges:[],building:null,level:1,stats:{}});
  }
  generateRiverEdges(map);
  // 河流附近較容易形成濕地；地形不變，只調整地貌。
  for(const cell of map){
    if(cell.landform==='water') continue;
    const nearRiver=hasRiver(cell)||orthogonalNeighbors(cell.x,cell.y).some(([x,y])=>hasRiver(map[boardIndex(x,y)]));
    if(nearRiver && Math.random()<0.2) cell.biome='wetland';
  }
  // 對同類地形內的地貌做一次輕度平滑，讓森林、草原等形成小片區域。
  const before=map.map(c=>c.biome);
  for(const cell of map){
    if(cell.landform==='water'||cell.biome==='wetland') continue;
    const neighbors=orthogonalNeighbors(cell.x,cell.y).map(([x,y])=>map[boardIndex(x,y)]).filter(n=>n.landform===cell.landform&&n.biome!=='wetland');
    if(!neighbors.length||Math.random()>0.48) continue;
    const counts={};
    for(const n of neighbors) counts[before[boardIndex(n.x,n.y)]]=(counts[before[boardIndex(n.x,n.y)]]||0)+1;
    const mostCommon=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
    if(mostCommon) cell.biome=mostCommon;
  }
  return map;
}

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
  let pool = [...cardPool];
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
// 判斷某個建築目前是否「已解鎖」（可用於升級檢核）
export function isBuildingUnlocked(buildingId) {
  // 1. 如果在初始基礎卡池中，預設已解鎖
  if (cardPool.includes(buildingId)) return true;

  // 2. 檢查科技/文化樹是否有解鎖該建築
  const treeEffects = activeTreeEffects();
  return treeEffects.some(e => e.type === 'unlockBuilding' && e.target === buildingId);
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

export function drawFromDeck(){
  if(!state.deck.length) {
    // 牌庫耗盡時，重新依稀有度配置洗牌生成
    state.deck = initDeck(availableCardPool());
  }
  return newCard(state.deck.pop());
}

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
  let totalUpkeep = 0; // 👈 累計全城建築維護費

  for(const c of state.board){
    if(!c.building) continue;
    for(const id in perTurn) perTurn[id] += c.stats[id];
    for(const id in scores) scores[id] += c.stats[id];
    popBonus += c.stats.population;
    usedPop += CARDS[c.building].cost.pop || 0;

    // 計算該建築的維護費（隨等級倍增）
    let cardDef = CARDS[c.building];
    if(cardDef && cardDef.upkeep) {
      totalUpkeep += cardDef.upkeep * (c.level || 1);
    }
  }

  // 👈 將總維護費從每回合金幣產出中扣除
  if(perTurn.gold !== undefined) {
    perTurn.gold -= totalUpkeep;
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
  if(!matchesLand(cell, d)) return false;
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
  if(!matchesLand(cell, d)){ result.reason = d.requiresRiver && !hasRiver(cell) ? `${d.name}必須建在有河流流經邊界的格子旁。` : `${d.name}不能建在${landDescription(cell)}。`; return result; }
  if(state.gameOver) result.reason = '遊戲已結束。';
  else if(state.gold < d.cost.gold) result.reason = `金幣不足（需要 ${d.cost.gold} ◈，目前 ${state.gold} ◈）。`;
  else if(state.population < d.cost.pop) result.reason = `可用人口不足（需要 ${d.cost.pop} 👤，目前 ${state.population} 👤）。`;

  calculate();
  const before = snapshotTotals();
  const prevLevel = cell.level, prevBiome = cell.biome;
  try{
    cell.building = card.type;
    cell.level = 1;
    if(cell.biome === 'forest') cell.biome = 'grassland'; // 開發森林後保留地形，只把地貌改為草原
    calculate();
    const after = snapshotTotals();
    result.delta = {};
    for(const k in before) result.delta[k] = after[k] - before[k];
  } finally {
    cell.building = null;
    cell.level = prevLevel;
    cell.biome = prevBiome;
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
  if(!matchesLand(cell, d)){message(d.requiresRiver && !hasRiver(cell) ? `${d.name}必須建在有河流流經邊界的格子旁。` : `${d.name}不能建在${landDescription(cell)}。`,true);return false;}
  if(state.gold < d.cost.gold){message('金幣不足！',true);return false;}
  if(state.population < d.cost.pop){message('可用人口（勞動力）不足！請先建造住宅。',true);return false;}

  state.gold -= d.cost.gold;
  cell.building=card.type;
  cell.level=1;
  if(cell.biome==='forest') cell.biome='grassland';
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

export function upgradeInspectedBuilding(targetChoiceId = null) {
  if(!state.inspectedCell) return false;
  let c = state.board.find(cell => cell.x === state.inspectedCell.x && cell.y === state.inspectedCell.y);
  if(!c || !c.building) { message('未選取有效建築。', true); return false; }

  let d = CARDS[c.building];
  
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

  let popDiff = (targetCard.cost.pop || 0) - (d.cost.pop || 0);
  if(popDiff > 0 && state.population < popDiff) {
    message(`可用人口不足！升級為 ${targetCard.name} 需要額外 ${popDiff} 👤 勞動力。`, true);
    return false;
  }

  // 5. 執行升級轉職
  state.gold -= upgradeCost;
  c.building = targetCardId;
  c.level = 1;
  c.stats = {};

  playSound('coin');
  calculate();
  message(`成功將 ${d.name} 升級改造為 ${targetCard.emoji} ${targetCard.name}！`, false, true);
  addLog(`將 ${d.name}（(${c.x},${c.y})）升級改造為 ${targetCard.name}（-${upgradeCost} ◈）。`);
  return true;
}

// 取得下一個階段性目標資訊：回傳 { turn, targetScore, remaining }，若沒有下一個門檻則回傳 null
export function getNextMilestone() {
  const currentTurn = state.turn;
  const currentScore = calculateTotalScore();
  
  // 找出比目前回合大的下一個門檻回合
  const upcomingTurns = Object.keys(TURN_SCORE_MILESTONES)
    .map(Number)
    .filter(t => t >= currentTurn)
    .sort((a, b) => a - b);

  if (upcomingTurns.length === 0) return null; // 沒有後續門檻

  const targetTurn = upcomingTurns[0];
  const targetScore = TURN_SCORE_MILESTONES[targetTurn];
  const remaining = Math.max(0, targetScore - currentScore);

  return {
    turn: targetTurn,
    targetScore: targetScore,
    remaining: remaining
  };
}

export function endTurn(){
  if(state.gameOver) return;
  
  // 糧食結算與人口流失邏輯...
  let netFood = state.perTurn.food - state.maxPopulation;
  state.storedFood += netFood;

  if(state.storedFood < 0){
    state.storedFood = 0;
    state.lostPopulation += 1;
    addLog(`⚠️ 存糧耗盡！庫存歸 0，人口流失 1 人！`);
  }
  
  // 其餘資源產出結算...
  for(const id in state.perTurn){
    if(id === 'food') continue;
    state[OUTPUTS[id].stateKey] += state.perTurn[id];
  }
  playSound('coin');

  // 人口歸零與回合門檻判定...（保持原本邏輯）
  if (state.maxPopulation <= 0 || (state.lostPopulation >= state.basePopulation)) {
    state.gameOver = true;
    state.failReason = '人口完全歸零與流失，城市宣告荒廢！';
    return;
  }

  state.turn++;
  state.selected = null;

  // 檢查 10/20 回合門檻...
  const checkingTurn = state.turn - 1;
  if (TURN_SCORE_MILESTONES[checkingTurn]) {
    const requiredScore = TURN_SCORE_MILESTONES[checkingTurn];
    if (calculateTotalScore() < requiredScore) {
      state.gameOver = true;
      state.failReason = `第 ${checkingTurn} 回合結束時總積分未達標。`;
      return;
    }
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