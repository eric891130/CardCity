// ============================================================================
//  地圖生成（純計算，不碰 DOM 與遊戲狀態）
// ============================================================================
//  流程（每一步只依賴前面的結果；整條流程由「品質檢查」包住，不合格就換下一個種子重做）：
//
//    0. 亂數種子      同一個種子永遠生出同一張地圖；每個階段用各自的亂數流，互不干擾
//    1. 高度場 → 地形  平滑的隨機高度，依排名切成 水 < 平原 < 丘陵 < 山（數量固定，與舊版相同）
//    2. 河流          從高處出發，順著地勢流向湖泊或棋盤邊緣（優先淹沒法保證一定流得出去）
//    3. 濕度          離水域與河流越近越濕
//    4. 溫度          越高越冷，再加一個隨機方向的冷熱梯度
//    5. 地貌          依溫度 / 濕度「依排名」分配，所以每張圖的地貌比例都一樣穩定（與舊版相同）
//    6. 起始位置      找靠水或河、周圍有空地的位置放農田，兩座營地放在旁邊
//    7. 品質檢查      不合格就換下一個種子（最多 MAX_ATTEMPTS 次），仍不合格取最好的一次
//    8. 回傳地圖與種子
//
//  generateMap(seed) → { map, seed, attempt, attempts, ok, checks }
//  所有調整數值都集中在下面的 MAP_CONFIG。
// ============================================================================
import { SIZE, CARDS } from './config.js';

export const MAP_CONFIG = {
  // 地形比例（與舊版相同）
  waterShare: 0.06, mountainShare: 0.16, hillShare: 0.22,
  // 陸地格中的地貌比例（與舊版實測的比例相同；其餘為草原）
  biomeShare: { snow: 0.19, desert: 0.105, wetland: 0.085, forest: 0.26 },
  // 各地形允許出現的地貌（與舊版相同，濕地限定在平原與丘陵）
  allowedBiomes: {
    mountain: ['snow', 'forest', 'grassland'],
    hill: ['forest', 'grassland', 'snow', 'desert', 'wetland'],
    plain: ['grassland', 'forest', 'desert', 'snow', 'wetland']
  },
  // 河流
  river: { minTotal: Math.ceil(SIZE * 1.5), maxTotal: SIZE * 3 + 4, maxRivers: 4, minLength: 5, sourceSpacing: 3, gateMin: Math.ceil(SIZE * 1.3), edgePenalty: 0.35, lakeBonus: 0.2 },
  // 品質檢查
  gate: { maxLakes: 3, minLargestLake: 5, minFarmFood: 3, maxClash: 4, minCellsPerCard: 4, minStartRoom: 9 },
  maxAttempts: 40
};

const TOTAL = SIZE * SIZE;
const idx = (x, y) => y * SIZE + x;
const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

// ---------- 0. 亂數 ----------
export function makeRng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 每個階段、每次嘗試各用一條獨立的亂數流：改動某一階段，不會影響其他階段的結果
const stream = (seed, attempt, stage) => makeRng(((seed >>> 0) + Math.imul(attempt + 1, 0x9E3779B1) + Math.imul(stage + 1, 0x85EBCA6B)) >>> 0);
export function randomSeed() { return Math.floor(Math.random() * 4294967296) >>> 0; }
export function parseSeed(text) {
  if (text === null || text === undefined || !/^\d{1,10}$/.test(String(text).trim())) return null;
  const n = Number(text);
  return n <= 4294967295 ? n >>> 0 : null;
}

// ---------- 小工具 ----------
function neighbors8(x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    if (inBoard(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
  }
  return out;
}
function neighbors4(x, y) {
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => inBoard(a, b)).map(([a, b]) => idx(a, b));
}
function blur(h) {
  const out = new Array(TOTAL);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const ns = [idx(x, y), ...neighbors8(x, y)];
    out[idx(x, y)] = ns.reduce((s, i) => s + h[i], 0) / ns.length;
  }
  return out;
}
// 低頻率的大範圍起伏（雙線性內插）
function coarseField(rng, pts = 5) {
  const g = Array.from({ length: pts * pts }, () => rng());
  const out = new Array(TOTAL);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const fx = (x + 0.5) / SIZE * (pts - 1), fy = (y + 0.5) / SIZE * (pts - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, pts - 1), y1 = Math.min(y0 + 1, pts - 1);
    const tx = fx - x0, ty = fy - y0;
    const a = g[y0 * pts + x0] * (1 - tx) + g[y0 * pts + x1] * tx;
    const b = g[y1 * pts + x0] * (1 - tx) + g[y1 * pts + x1] * tx;
    out[idx(x, y)] = a * (1 - ty) + b * ty;
  }
  return out;
}
// 依排名正規化到 0~1（分布均勻，之後用門檻切分不會因為數值範圍而偏斜）
function rankNormalize(values, indices = null) {
  const ids = indices || values.map((_, i) => i);
  const order = [...ids].sort((a, b) => values[a] - values[b] || a - b);
  const out = new Array(values.length).fill(0);
  order.forEach((i, r) => { out[i] = order.length > 1 ? r / (order.length - 1) : 0.5; });
  return out;
}
const cellAt = (map, x, y) => map[idx(x, y)];

// ---------- 1. 高度場 → 地形 ----------
function buildLandforms(rng) {
  const coarse = coarseField(rng, 5);
  let fine = Array.from({ length: TOTAL }, () => rng());
  for (let k = 0; k < 3; k++) fine = blur(fine);
  const nc = rankNormalize(coarse), nf = rankNormalize(fine);
  const raw = nc.map((v, i) => 0.6 * v + 0.4 * nf[i]);
  const height = rankNormalize(raw);                      // 0 = 最低、1 = 最高
  const water = Math.max(2, Math.round(TOTAL * MAP_CONFIG.waterShare));
  const mountain = Math.round(TOTAL * MAP_CONFIG.mountainShare);
  const hill = Math.round(TOTAL * MAP_CONFIG.hillShare);
  const landform = new Array(TOTAL).fill('plain');
  // 水域：從最低的格子開始，一次往外擴一格最低的鄰格，長成一片湖；剩下的水量在另一個低窪處長成小池。
  // 這樣水域一定是「一個湖 + 最多一個小池」，不會散成一格一格的小水坑。
  const lowest = [...height.keys()].sort((a, b) => height[a] - height[b] || a - b);
  const growLake = (startCell, size, blocked) => {
    const cells = [startCell]; const inLake = new Set(cells);
    while (cells.length < size) {
      let best = -1;
      for (const c of cells) for (const n of neighbors4(c % SIZE, Math.floor(c / SIZE))) {
        if (inLake.has(n) || blocked.has(n)) continue;
        if (best === -1 || height[n] < height[best] || (height[n] === height[best] && n < best)) best = n;
      }
      if (best === -1) break;
      cells.push(best); inLake.add(best);
    }
    return cells;
  };
  const mainSize = water >= 6 ? Math.ceil(water * 0.7) : water;
  const main = growLake(lowest[0], mainSize, new Set());
  const waterCells = new Set(main);
  if (waterCells.size < water) {
    const nearMain = new Set(main.flatMap(c => [c, ...neighbors8(c % SIZE, Math.floor(c / SIZE))]));
    const second = lowest.find(c => !nearMain.has(c));
    if (second !== undefined) growLake(second, water - waterCells.size, nearMain).forEach(c => waterCells.add(c));
  }
  waterCells.forEach(i => { landform[i] = 'water'; });
  // 其餘陸地依高度排名切成 平原 < 丘陵 < 山
  const landOrder = lowest.filter(i => !waterCells.has(i));
  landOrder.slice(landOrder.length - mountain).forEach(i => { landform[i] = 'mountain'; });
  landOrder.slice(landOrder.length - mountain - hill, landOrder.length - mountain).forEach(i => { landform[i] = 'hill'; });
  return { height, landform };
}

// ---------- 2. 河流 ----------
// 河流畫在格子的邊上，也就是 (SIZE+1)×(SIZE+1) 個「頂點」之間的線段。
// 做法：把每個頂點的高度算出來，用「優先淹沒法」（從出口往上淹）替每個頂點找到一條一定能流到出口的下坡路：
// 出口 = 棋盤邊緣的頂點，以及貼著水域的頂點。再從高處挑幾個源頭，順著路徑往下走。
function buildRivers(rng, height, landform) {
  const VN = SIZE + 1, vid = (x, y) => y * VN + x;
  const cfg = MAP_CONFIG.river;
  const vx = v => v % VN, vy = v => Math.floor(v / VN);
  const adjCells = v => [[vx(v) - 1, vy(v) - 1], [vx(v), vy(v) - 1], [vx(v) - 1, vy(v)], [vx(v), vy(v)]].filter(([x, y]) => inBoard(x, y)).map(([x, y]) => idx(x, y));
  const vh = [], touchesWater = [], touchesMountain = [], boundary = [];
  for (let v = 0; v < VN * VN; v++) {
    const cs = adjCells(v);
    vh[v] = cs.reduce((s, i) => s + height[i], 0) / cs.length + (rng() - 0.5) * 0.05;   // 一點擾動，讓河道會彎
    touchesWater[v] = cs.some(i => landform[i] === 'water');
    touchesMountain[v] = cs.some(i => landform[i] === 'mountain');
    boundary[v] = vx(v) === 0 || vy(v) === 0 || vx(v) === SIZE || vy(v) === SIZE;
  }
  const isSink = v => boundary[v] || touchesWater[v];
  const nbrs = v => [[vx(v) - 1, vy(v)], [vx(v) + 1, vy(v)], [vx(v), vy(v) - 1], [vx(v), vy(v) + 1]].filter(([x, y]) => x >= 0 && y >= 0 && x <= SIZE && y <= SIZE).map(([x, y]) => vid(x, y));

  const visited = new Array(VN * VN).fill(false), fill = new Array(VN * VN).fill(0), flow = new Array(VN * VN).fill(-1);
  let open = [];
  // 棋盤邊緣也是出口，但要多付一點「代價」：這樣水會優先流向湖泊，只有流不到湖泊的地方才流出棋盤
  for (let v = 0; v < VN * VN; v++) if (isSink(v)) { visited[v] = true; fill[v] = vh[v] + (touchesWater[v] ? 0 : cfg.edgePenalty); open.push(v); }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (fill[open[i]] < fill[open[bi]]) bi = i;
    const v = open.splice(bi, 1)[0];
    for (const u of nbrs(v)) if (!visited[u]) { visited[u] = true; fill[u] = Math.max(vh[u], fill[v] + 1e-6); flow[u] = v; open.push(u); }
  }

  const edges = new Set();                         // 'a-b'（a < b）
  const edgeKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const onRiver = new Set();
  const sources = [];
  // 每個頂點到出口要走幾步：源頭偏好流程長的位置，河才不會一下就流出棋盤
  const depth = new Array(VN * VN).fill(-1);
  const depthOf = v => { if (depth[v] >= 0) return depth[v]; return depth[v] = flow[v] === -1 ? 0 : depthOf(flow[v]) + 1; };
  const terminalOf = v => flow[v] === -1 ? v : terminalOf(flow[v]);
  const candidates = [];
  for (let v = 0; v < VN * VN; v++) if (!isSink(v) && depthOf(v) >= cfg.minLength) candidates.push({ v, score: vh[v] + (touchesMountain[v] ? 0.25 : 0) + 0.035 * depth[v] + (touchesWater[terminalOf(v)] ? cfg.lakeBonus : 0) });
  if (!candidates.length) for (let v = 0; v < VN * VN; v++) if (!isSink(v)) candidates.push({ v, score: vh[v] });
  candidates.sort((a, b) => b.score - a.score || a.v - b.v);
  const pool = candidates.slice(0, Math.max(12, Math.floor(candidates.length * 0.4)));
  const tracePath = s => { const path = [s]; while (flow[path[path.length - 1]] !== -1 && path.length < VN * VN) path.push(flow[path[path.length - 1]]); return path; };

  // 每一輪：把所有候選源頭的路徑都試走一遍，挑「能新增最多河段」的前幾名之一（避免新源頭很快匯入既有河流、河道太短）
  let rivers = 0;
  while (rivers < cfg.maxRivers) {
    if (rivers >= 2 && edges.size >= cfg.minTotal) break;
    const options = [];
    for (const cand of pool) {
      const s = cand.v;
      if (onRiver.has(s) || sources.some(o => Math.max(Math.abs(vx(o) - vx(s)), Math.abs(vy(o) - vy(s))) < cfg.sourceSpacing)) continue;
      const path = tracePath(s);
      const fresh = [];
      for (let i = 0; i < path.length - 1; i++) if (!edges.has(edgeKey(path[i], path[i + 1]))) fresh.push(edgeKey(path[i], path[i + 1]));
      if (path.length - 1 < cfg.minLength || fresh.length < 3 || edges.size + fresh.length > cfg.maxTotal) continue;
      options.push({ s, path, fresh });
    }
    if (!options.length) break;
    options.sort((a, b) => b.fresh.length - a.fresh.length || a.s - b.s);
    const top = options.slice(0, 3), chosen = top[Math.floor(rng() * top.length)];
    chosen.fresh.forEach(k => edges.add(k)); chosen.path.forEach(v => onRiver.add(v));
    sources.push(chosen.s); rivers++;
  }
  return { edges: [...edges].map(k => k.split('-').map(Number)), vx, vy, VN };
}
// 與舊版相同的資料格式：每段河記錄在相鄰兩格（棋盤外側只記一側）
function writeRivers(map, rivers) {
  const add = (x, y, dir) => { if (inBoard(x, y)) { const c = cellAt(map, x, y); if (!c.riverEdges.includes(dir)) c.riverEdges.push(dir); } };
  for (const [a, b] of rivers.edges) {
    const ax = rivers.vx(a), ay = rivers.vy(a), bx = rivers.vx(b), by = rivers.vy(b);
    if (ax === bx) { const y = Math.min(ay, by); add(ax - 1, y, 'E'); add(ax, y, 'W'); }
    else { const x = Math.min(ax, bx); add(x, ay - 1, 'S'); add(x, ay, 'N'); }
  }
}

// ---------- 3、4. 濕度與溫度 ----------
function buildMoisture(rng, map) {
  const dist = new Array(TOTAL).fill(Infinity), queue = [];
  map.forEach((c, i) => { if (c.landform === 'water' || c.riverEdges.length) { dist[i] = 0; queue.push(i); } });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % SIZE, y = Math.floor(i / SIZE);
    for (const n of neighbors8(x, y)) if (dist[n] === Infinity) { dist[n] = dist[i] + 1; queue.push(n); }
  }
  const noise = coarseField(rng, 4);
  return map.map((_, i) => 0.75 * Math.exp(-Math.min(dist[i], 30) / 2.5) + 0.25 * noise[i]);
}
function buildTemperature(rng, height) {
  const angle = rng() * Math.PI * 2, c = (SIZE - 1) / 2;
  const grad = Array.from({ length: TOTAL }, (_, i) => ((i % SIZE - c) * Math.cos(angle) + (Math.floor(i / SIZE) - c) * Math.sin(angle)));
  const lat = rankNormalize(grad), noise = coarseField(rng, 4);
  return height.map((h, i) => 0.55 * (1 - h) + 0.35 * lat[i] + 0.10 * noise[i]);   // 越大越熱
}

// ---------- 5. 地貌（依排名分配，比例固定）----------
function assignBiomes(rng, map, height, moisture, temperature) {
  const landIdx = map.map((c, i) => i).filter(i => map[i].landform !== 'water');
  const n = landIdx.length, share = MAP_CONFIG.biomeShare, allowed = MAP_CONFIG.allowedBiomes;
  const want = { snow: Math.round(n * share.snow), desert: Math.round(n * share.desert), wetland: Math.round(n * share.wetland), forest: Math.round(n * share.forest) };
  const taken = new Set();
  // blocked：這種地貌不能貼著的地貌（沙漠、雪地、濕地兩兩互斥），所以結果一定沒有氣候衝突
  const take = (biome, score, count, blocked = []) => {
    const cand = landIdx.filter(i => !taken.has(i) && allowed[map[i].landform].includes(biome)).sort((a, b) => score(b) - score(a) || a - b);
    let got = 0;
    for (const i of cand) {
      if (got >= count) break;
      if (neighbors8(i % SIZE, Math.floor(i / SIZE)).some(j => blocked.includes(map[j].biome))) continue;
      map[i].biome = biome; taken.add(i); got++;
    }
  };
  const jitter = () => (rng() - 0.5) * 0.06;
  take('snow', i => -temperature[i] + jitter(), want.snow);                                                  // 最冷的
  take('desert', i => temperature[i] * (1 - moisture[i]) + jitter(), want.desert, ['snow']);                 // 又熱又乾，且不貼雪地
  take('wetland', i => moisture[i] * (1 - 0.7 * height[i]) + jitter(), want.wetland, ['snow', 'desert']);    // 又濕又低，且不貼雪地與沙漠
  take('forest', i => moisture[i] + jitter(), want.forest);                                                  // 剩下較濕的
  for (const i of landIdx) if (!taken.has(i)) map[i].biome = 'grassland';
}

// ---------- 6. 起始位置 ----------
const landOk = (cell, cardId) => {
  const card = CARDS[cardId];
  return (!card.landforms || card.landforms.includes(cell.landform)) && (!card.biomes || card.biomes.includes(cell.biome))
    && (!card.requiresRiver || cell.riverEdges.length > 0);
};
export const farmFoodAt = (map, cell) => 1 + neighbors8(cell.x, cell.y).filter(i => map[i].landform === 'water').length + cell.riverEdges.length;
function placeStart(rng, map) {
  const farmCards = CARDS.farm;
  const scored = [];
  for (const c of map) {
    if (c.building || !landOk(c, 'farm')) continue;
    const bonus = farmFoodAt(map, c) - 1;
    const room = neighbors8(c.x, c.y).filter(i => !map[i].building && map[i].landform !== 'water' && landOk(map[i], 'tent')).length;
    const edgePenalty = (c.x === 0 || c.y === 0 || c.x === SIZE - 1 || c.y === SIZE - 1) ? 0.8 : 0;
    scored.push({ c, score: 3 * Math.min(bonus, 2) - 1.2 * Math.max(0, bonus - 2) + 0.4 * Math.min(room, 6) - edgePenalty + rng() * 1.2 });   // 偏好產出剛好 3（開局糧食淨值 +1），再高不加分
  }
  if (!scored.length) return false;
  scored.sort((a, b) => b.score - a.score);
  const farm = scored[0].c;
  const put = (cell, id) => { cell.building = id; cell.level = 1; if (cell.biome === 'forest' && !CARDS[id].preserveForest) cell.biome = 'grassland'; };
  put(farm, 'farm');
  // 營地：優先放在農田旁；農田旁不夠就往外找最近的合法格。不要占掉河邊 / 水邊的好位置。
  const d = c => Math.max(Math.abs(c.x - farm.x), Math.abs(c.y - farm.y));
  const spots = map.filter(c => !c.building && landOk(c, 'tent') && d(c) <= 3)
    .map(c => ({ c, score: -d(c) * 2 - c.riverEdges.length * 0.7 - neighbors8(c.x, c.y).filter(i => map[i].landform === 'water').length * 0.5 + rng() }))
    .sort((a, b) => b.score - a.score);
  for (const s of spots.slice(0, 2)) put(s.c, 'tent');
  return true;
}

// ---------- 7. 品質檢查 ----------
function components(map, landform) {
  const seen = new Set(), sizes = [];
  for (let i = 0; i < TOTAL; i++) {
    if (seen.has(i) || map[i].landform !== landform) continue;
    let n = 0; const st = [i]; seen.add(i);
    while (st.length) { const u = st.pop(); n++; for (const v of neighbors4(u % SIZE, Math.floor(u / SIZE))) if (!seen.has(v) && map[v].landform === landform) { seen.add(v); st.push(v); } }
    sizes.push(n);
  }
  return sizes;
}
export function climateClashes(map) {
  const bad = new Set(['desert|snow', 'desert|wetland', 'snow|wetland']);
  let n = 0;
  for (const c of map) for (const j of neighbors8(c.x, c.y)) if (j > idx(c.x, c.y) && bad.has([c.biome, map[j].biome].sort().join('|'))) n++;
  return n;
}
export function riverSegmentCount(map) {
  const keys = new Set();
  for (const c of map) for (const s of c.riverEdges) {
    const [dx, dy] = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[s];
    const a = idx(c.x, c.y), b = inBoard(c.x + dx, c.y + dy) ? idx(c.x + dx, c.y + dy) : -1;
    keys.add(Math.min(a, b) + '_' + Math.max(a, b));
  }
  return keys.size;
}
export function evaluateMap(map) {
  const g = MAP_CONFIG.gate, r = MAP_CONFIG.river;
  const lakes = components(map, 'water'), farm = map.find(c => c.building === 'farm');
  const buildings = map.filter(c => c.building);
  const rivers = riverSegmentCount(map);
  const minCells = Math.min(...Object.keys(CARDS).map(id => map.filter(c => !c.building && landOk(c, id)).length));
  const farmFood = farm ? farmFoodAt(map, farm) : 0;
  const room = farm ? map.filter(c => !c.building && ['plain', 'hill'].includes(c.landform) && Math.max(Math.abs(c.x - farm.x), Math.abs(c.y - farm.y)) <= 2).length : 0;
  const tentsNear = farm ? buildings.filter(c => c.building === 'tent' && Math.max(Math.abs(c.x - farm.x), Math.abs(c.y - farm.y)) <= 3).length : 0;
  const checks = [
    { id: 'lakes', label: `水域不超過 ${g.maxLakes} 塊、最大一塊至少 ${g.minLargestLake} 格`, value: `${lakes.length} 塊 / 最大 ${Math.max(0, ...lakes)} 格`, ok: lakes.length <= g.maxLakes && Math.max(0, ...lakes) >= g.minLargestLake },
    { id: 'rivers', label: `河流總長 ${r.gateMin}～${r.maxTotal} 段`, value: `${rivers} 段`, ok: rivers >= r.gateMin && rivers <= r.maxTotal },
    { id: 'farm', label: `開局農田產出至少 ${g.minFarmFood}`, value: String(farmFood), ok: farmFood >= g.minFarmFood },
    { id: 'start', label: '開局有農田與 2 座營地，且營地在農田附近', value: `${buildings.length} 座 / 附近營地 ${tentsNear}`, ok: buildings.length === 3 && tentsNear === 2 },
    { id: 'room', label: `農田半徑 2 格內至少 ${g.minStartRoom} 格可建地（平原 / 丘陵）`, value: `${room} 格`, ok: room >= g.minStartRoom },
    { id: 'clash', label: `相鄰氣候衝突不超過 ${g.maxClash} 對`, value: `${climateClashes(map)} 對`, ok: climateClashes(map) <= g.maxClash },
    { id: 'cards', label: `每種建築至少 ${g.minCellsPerCard} 格可放置`, value: `最少 ${minCells} 格`, ok: minCells >= g.minCellsPerCard }
  ];
  return { checks, passed: checks.filter(c => c.ok).length, ok: checks.every(c => c.ok) };
}

// ---------- 整合 ----------
function buildOnce(seed, attempt) {
  const { height, landform } = buildLandforms(stream(seed, attempt, 1));                         // 1
  const map = Array.from({ length: TOTAL }, (_, i) => ({
    x: i % SIZE, y: Math.floor(i / SIZE), landform: landform[i], biome: landform[i] === 'water' ? 'water' : 'grassland',
    riverEdges: [], building: null, level: 1, stats: {}
  }));
  writeRivers(map, buildRivers(stream(seed, attempt, 2), height, landform));                    // 2
  const moisture = buildMoisture(stream(seed, attempt, 3), map);                                // 3
  const temperature = buildTemperature(stream(seed, attempt, 4), height);                       // 4
  assignBiomes(stream(seed, attempt, 5), map, height, moisture, temperature);                   // 5
  placeStart(stream(seed, attempt, 6), map);                                                    // 6
  return { map, report: evaluateMap(map) };                                                     // 7
}

export function generateMap(seed = randomSeed()) {
  seed = seed >>> 0;
  let best = null;
  for (let attempt = 0; attempt < MAP_CONFIG.maxAttempts; attempt++) {
    const built = buildOnce(seed, attempt);
    if (!best || built.report.passed > best.report.passed) best = { ...built, attempt };
    if (built.report.ok) { best = { ...built, attempt }; break; }
  }
  return { map: best.map, seed, attempt: best.attempt, attempts: best.attempt + 1, ok: best.report.ok, checks: best.report.checks };   // 8
}
