// ============================================================================
//  平衡檢查：估算每張卡的「每回合價值」，並檢查改造路線是否符合規則
// ============================================================================
//  這個檔案只做「計算與檢查」，不影響遊戲本身；由 validate.js 的 validateBalance() 與
//  tools/check.mjs 使用。想調整估值方式，只改下面的 BALANCE 即可。
//
//  【改造規則】
//    改造目標「Lv.1」的基礎數值  >=  來源建築「Lv.3」的基礎數值 × renovationRatio（預設 1.2）
//    （Lv.3 = 三座同類建築的產出，所以目標 Lv.1 要是來源 Lv.1 的 3.6 倍以上。）
//
//  【基礎數值 = 每回合，已扣維護費】
//    固定產出（points）        amount × 該產出的權重（BALANCE.weights）
//    最終分數（finalScore）    amount × 分數權重（遊戲結束才結算，所以折價）
//    一次性效果（onBuild）     攤提到 onBuildTurns 回合（改造 / 新蓋時觸發一次）
//    維護費                    直接扣（金幣權重 1）
//    等級                      持續效果隨等級倍增；一次性效果不倍增
//  「條件效果」（相鄰 / 範圍 / 多樣性 / 空地 / 光環…）不計入基礎數值，視為額外的加成；
//  但為了方便比較強弱，estimateValue 也會用「典型符合數量」估算它們，放在 conditional 欄位僅供參考。
// ============================================================================
import { CARDS, OUTPUTS } from './config.js';

export const BALANCE = {
  renovationRatio: 1.2,
  // 各種產出一點值多少「金幣當量」
  weights: { gold: 1, food: 1, techPoints: 1.5, culturePoints: 1.5, faithPoints: 1, population: 0.5, maxFood: 0.1, buildingScore: 0.3 },
  // 條件效果「典型」能湊到幾個
  typical: {
    adjacentBuildingSpecific: 1.2,  // 指定某幾種建築（例如只算住宅）
    adjacentBuildingAny: 2.5,       // 任何建築 / 某一類型
    adjacentTerrain: 1.0,           // 相鄰某種地形 / 地貌 / 河流
    radiusBuilding: 2.5,
    uniqueTypes: 4,
    aura: 1.5,                      // 光環：通常影響幾座相鄰建築（負數 = 汙染）
    variety: 2.5,                   // 相鄰建築的不同種類數
    same: 1.0,                      // 相鄰同類建築（負數 = 擁擠懲罰）
    empty: 2.5,                     // 相鄰空地
    buildingCount: 0.7              // 全城數量門檻：達成的機率折算
  },
  onBuildTurns: 10                  // 一次性獲得攤提到幾回合
};

const w = output => BALANCE.weights[output] ?? 0;
const T = BALANCE.typical;

const BASE_TYPES = new Set(['points', 'finalScore']);

// 單一「條件效果」每回合的估值（等級 1）
function conditionalValue(e) {
  const unit = e.amount * w(e.output);
  const cap = (n) => e.cap === undefined ? n : Math.min(e.cap, n);
  switch (e.type) {
    case 'adjacentBuilding': return unit * cap(e.target === 'any' || e.targetType !== undefined ? T.adjacentBuildingAny : T.adjacentBuildingSpecific);
    case 'adjacentLandform':
    case 'adjacentBiome':
    case 'adjacentRiver': return unit * cap(T.adjacentTerrain);
    case 'radiusBuilding': return unit * cap(T.radiusBuilding);
    case 'uniqueTypes': return unit * cap(T.uniqueTypes);
    case 'adjacentAura': return unit * T.aura;
    case 'adjacentVariety': return unit * cap(T.variety);
    case 'adjacentSame': return unit * cap(T.same);
    case 'adjacentEmpty': return unit * cap(T.empty);
    case 'buildingCount': return unit * T.buildingCount;
    default: return 0;
  }
}
function onBuildValue(e) {
  const n = e.target === undefined && e.targetType === undefined ? 1 : (e.cap !== undefined ? Math.min(e.cap, 2) : 2);
  return e.amount * w(e.output) * n / BALANCE.onBuildTurns;
}

// 估值：{ base, conditional, upkeep }
//   base         基礎數值（固定產出 + 分數 + 一次性攤提 − 維護費）→ 改造規則比的就是這個
//   conditional  條件效果的典型估值（僅供參考）
export function estimateValue(cardId, level = 1, cards = CARDS) {
  const c = cards[cardId];
  if (!c) return { base: 0, conditional: 0, upkeep: 0 };
  let fixed = 0, once = 0, conditional = 0;
  for (const e of c.effects || []) {
    if (e.type === 'onBuild') once += onBuildValue(e);
    else if (BASE_TYPES.has(e.type)) fixed += e.amount * w(e.output);
    else conditional += conditionalValue(e);
  }
  const upkeep = c.upkeep || 0;
  return { base: level * (fixed - upkeep) + once, conditional: level * conditional, upkeep: level * upkeep };
}

// 所有改造路線：[{ from, to, v3, v1, need, ratio, ok }]
export function renovationEdges(cards = CARDS) {
  const rows = [];
  for (const from in cards) {
    const ups = cards[from].upgradesTo;
    const targets = (Array.isArray(ups) ? ups : ups ? [ups] : []).filter(Boolean);
    for (const to of targets) {
      if (!cards[to]) continue;
      const v3 = estimateValue(from, 3, cards).base;
      const v1 = estimateValue(to, 1, cards).base;
      const need = v3 * BALANCE.renovationRatio;
      rows.push({ from, to, v3, v1, need, ratio: v3 > 0 ? v1 / v3 : Infinity, ok: v3 > 0 && v1 >= need - 1e-9 });
    }
  }
  return rows;
}

// 檢查改造規則，回傳白話問題清單（空陣列 = 全部符合）
export function validateBalance(cards = CARDS) {
  const problems = [];
  const f = n => (Math.round(n * 10) / 10).toString();
  for (const r of renovationEdges(cards)) {
    const A = cards[r.from].name, B = cards[r.to].name;
    if (r.v3 <= 0) problems.push(`[改造 ${A} → ${B}] 來源 Lv.3 的基礎數值是 ${f(r.v3)}（≤ 0），無法套用 ${BALANCE.renovationRatio} 倍規則；請先給 ${A} 正的固定產出（現在幾乎全靠條件效果或維護費太高）。`);
    else if (!r.ok) problems.push(`[改造 ${A} → ${B}] ${B} Lv.1 基礎數值 ${f(r.v1)}，需要 ≥ ${f(r.need)}（${A} Lv.3 的 ${f(r.v3)} × ${BALANCE.renovationRatio}）。`);
  }
  return problems;
}
