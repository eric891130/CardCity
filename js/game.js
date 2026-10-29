import { state, playSound, message } from './state.js';
import { RARITY_CONFIG , CARDS, LANDFORM_NAMES, BIOME_NAMES, TERRAIN_NAMES, SHOP_ITEMS, MISSION_POOL, cardPool, MAX_TURNS, SIZE, OUTPUTS, BASE_PER_TURN, getRequiredScoreForTurn, TECH_TREE , CULTURE_TREE } from './config.js';
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
  // 已有河流資料時保留，避免覆蓋既有地圖或存檔。
  if (board.some(c => Array.isArray(c.riverEdges) && c.riverEdges.length)) return board;   

  for (const c of board) c.riverEdges = [];
				  
  const MIN_TOTAL_LENGTH = Math.ceil(SIZE * 1.5); // 12x12 棋盤至少約 18 段河道
  const MAX_RIVERS = 4;
  const MAX_ATTEMPTS_PER_RIVER = 12;
  const riverSegments = new Set();

  function traceRiver() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_RIVER; attempt++) {
      const edges = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
      const chosenEdge = edges[Math.floor(Math.random() * edges.length)];
      let vx, vy, lastDx = 0, lastDy = 0;

      switch (chosenEdge) {
        case 'TOP':    vx = Math.floor(Math.random() * (SIZE + 1)); vy = 0;    lastDy = 1; break;
        case 'BOTTOM': vx = Math.floor(Math.random() * (SIZE + 1)); vy = SIZE; lastDy = -1; break;
        case 'LEFT':   vx = 0;    vy = Math.floor(Math.random() * (SIZE + 1)); lastDx = 1; break;
        case 'RIGHT':  vx = SIZE; vy = Math.floor(Math.random() * (SIZE + 1)); lastDx = -1; break;
      }

      const visited = new Set([`${vx},${vy}`]);
      const path = [];
      let steps = 0;
      const maxSteps = SIZE * SIZE * 2;
			   
      while (steps < maxSteps) {
        const options = [];
        const dirs = [
          { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
          { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
        ];

        for (const d of dirs) {
          const nx = vx + d.dx, ny = vy + d.dy;
          if (nx < 0 || nx > SIZE || ny < 0 || ny > SIZE) continue;
          if (visited.has(`${nx},${ny}`)) continue;
          if (d.dx === -lastDx && d.dy === -lastDy) continue;

          const weight = (d.dx === lastDx && d.dy === lastDy) ? 2 : 1;
          options.push({ ...d, weight });
        }
        if (!options.length) break;

        let r = Math.random() * options.reduce((sum, o) => sum + o.weight, 0);
        let next = options[0];
        for (const o of options) {
          r -= o.weight;
          if (r <= 0) { next = o; break; }
        }

        const nx = vx + next.dx, ny = vy + next.dy;
        path.push([vx, vy, nx, ny]);
        visited.add(`${nx},${ny}`);
        vx = nx; vy = ny;
        lastDx = next.dx; lastDy = next.dy;
        steps++;

        // 至少走過數段後，碰到棋盤邊界便結束此條河流。
        if ((vx === 0 || vx === SIZE || vy === 0 || vy === SIZE) && steps >= 4) break;

      }

      if (path.length >= Math.max(5, Math.floor(SIZE * 0.55))) return path;
    }
    return [];
  }

  // 第一條河流必定生成；若河道總長不足，會繼續補生成。
  // 達到最低長度後，仍有機率額外生成河流，最多四條。
  let riverCount = 0;
  while (riverCount < MAX_RIVERS) {
    const shouldAddRiver = riverCount === 0 ||
      [...riverSegments].length < MIN_TOTAL_LENGTH ||
      Math.random() < 0.1;
    if (!shouldAddRiver) break;

    const path = traceRiver();
    if (!path.length) break;
			  
			  
			  

    let addedNewSegment = 0;
    for (const [x0, y0, x1, y1] of path) {
      const key = `${Math.min(x0,x1)},${Math.min(y0,y1)},${Math.max(x0,x1)},${Math.max(y0,y1)}`;
      if (!riverSegments.has(key)) {
        riverSegments.add(key);
        addedNewSegment++;
      }
      addRiverSegment(board, x0, y0, x1, y1);
    }
    riverCount++;

    // 防止因路徑重疊而一直無法增加總長。
    if (addedNewSegment === 0 && riverCount >= 2 && riverSegments.size >= MIN_TOTAL_LENGTH) break;
																	
											
										   
  }

  console.log(`🌊 [河流系統] 生成 ${riverCount} 條河流，總長度 ${riverSegments.size} 段（目標至少 ${MIN_TOTAL_LENGTH} 段）`);
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

// 隨機在符合地形限制的合法格子中放置初始建築
function placeInitialBuilding(board, buildingType) {
  // 過濾出所有「沒有建築」且「符合該建築地形/地貌限制」的格子
  const validCells = board.filter(c => !c.building && matchesLand(c, CARDS[buildingType]));
  if (validCells.length > 0) {
    // 隨機挑選一格
    const cell = validCells[Math.floor(Math.random() * validCells.length)];
    cell.building = buildingType;
    cell.level = 1;
    // 如果該格是森林，且該建築沒有設定 preserveForest，則照規則轉為草原
    if (cell.biome === 'forest' && !CARDS[buildingType].preserveForest) {
      cell.biome = 'grassland';
    }
  }
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
  
  placeInitialBuilding(map, 'farm');
  placeInitialBuilding(map, 'tent');
  placeInitialBuilding(map, 'tent');

//  ===== 用於測試一些要求建築解鎖的功能 ===== //   
 placeInitialBuilding(map, 'market');
 placeInitialBuilding(map, 'business_center');
 placeInitialBuilding(map, 'mint');
//

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

  // 人口容量由基礎容量與建築效果決定；糧食短缺只影響實際人口，不再永久扣減容量。
  state.maxPopulation = Math.max(1, popBonus);
  // 舊存檔若沒有 currentPopulation，先以舊人口容量推定實際人口。
  if(!Number.isFinite(state.currentPopulation)) state.currentPopulation = state.maxPopulation;
  state.currentPopulation = Math.max(0, state.currentPopulation);
  // 建築佔用的是工作人口；居民仍然存在並照常消耗糧食。
  state.population = Math.max(0, Math.min(state.currentPopulation, state.maxPopulation) - usedPop);
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

  let techCultureScore = (getUnlockedTechAndCultureCount() - 1) * 20;
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

export function upgradeBuildingWithCard(card, cell){
  if(state.gameOver) return false;
  if(!cell?.building || cell.building !== card.type){ message('只能用相同類型的建築卡升級。', true); return false; }
  const d = CARDS[cell.building];
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
  const gains = computeOnBuild(cell.building, cell);
  if(Object.keys(gains).length){
    applyGains(gains);
    addLog(`${d.name} 升至 Lv.${cell.level}：獲得 ${describeGains(gains)}。`);
  }
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
  cell.building = null;
  cell.level = 1;
  playSound('place');
  calculate();
  if(state.currentPopulation > state.maxPopulation){
    const excess = state.currentPopulation - state.maxPopulation;
    state.currentPopulation = state.maxPopulation;
    calculate();
    addLog(`⚠️ 人口容量下降，${excess} 名居民離開城市。`);
  }
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

  playSound('upgrade');
  calculate();
  if(state.currentPopulation > state.maxPopulation){
    const excess = state.currentPopulation - state.maxPopulation;
    state.currentPopulation = state.maxPopulation;
    calculate();
    addLog(`⚠️ 改造後人口容量下降，${excess} 名居民離開城市。`);
  }
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

export function endTurn(){
  if(state.gameOver) return;
  if(state.tradePrices){
    const change = Math.floor(Math.random() * 11) - 5;
    state.tradePrices.stockPrice = Math.max(1, state.tradePrices.stockPrice + change);
    state.tradePrices.stockHistory.push(state.tradePrices.stockPrice);
    state.tradePrices.stockHistory = state.tradePrices.stockHistory.slice(-30);
  }
  const populationAtSettlementStart = state.currentPopulation;
  
  // 容量降低時，超出容量的居民離開城市；這與糧食短缺分開處理。
  if(state.currentPopulation > state.maxPopulation){
    const excess = state.currentPopulation - state.maxPopulation;
    state.currentPopulation = state.maxPopulation;
    addLog(`⚠️ 人口容量不足，${excess} 名居民離開城市。`);
  }

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
    
    // 人口成長同時受糧食存量、糧食淨值與剩餘人口容量限制。
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
    state[OUTPUTS[id].stateKey] += amount;
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
