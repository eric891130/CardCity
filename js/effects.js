// ============================================================================
//  效果登記表 —— 「有哪些效果、各自怎麼算、怎麼用白話描述」全部集中在這裡
// ============================================================================
//  想新增一種效果類型：在 EFFECT_TYPES 加一筆（needs / outputs / count / cond）即可，
//  計算（calculate）、建造預覽、卡牌說明文字、設定檢查（validate.js）都會自動支援。
//
//  所有效果的固定格式：{ type, output, amount, ...該類型專用欄位 }
//    type    效果類型（見 EFFECT_TYPES）
//    output  產出什麼（見 config.js 的 OUTPUTS）
//    amount  每單位產出多少
//    target  對象建築：單一 id、id 陣列、或 'any'（任何建築）
//    targetType  對象建築類型：比對 CARDS[id].type，例如 '生產'、'人口'、'科技'
// ============================================================================
import { CARDS, OUTPUTS, LANDFORM_NAMES, BIOME_NAMES, TECH_TREE, CULTURE_TREE } from './config.js';
import { neighbors, buildingsWithin, countMatching, uniqueBuildingTypes, matchesTarget, targetList, riverEdgeCount } from './board.js';

const buildingInstances = cells => cells.reduce((total, cell) => total + (cell.building ? (cell.level || 1) : 0), 0);
const matchingInstances = (cells, target, targetType) => cells.reduce((total, cell) =>
  total + (matchesTarget(cell.building, target, targetType) ? (cell.level || 1) : 0), 0);

// ---------- 建築效果 ----------
// needs     除了 type/output/amount 以外「必填」的欄位
// optional  「選填」的欄位
// outputs   允許的產出種類（OUTPUTS 裡的 group：resource 每回合資源 / capacity 容量 / score 最終分數）
// phase     'own'  = 作用在自己身上，每次 calculate 重新計算（持續效果）
//           'aura' = 作用在「相鄰的其他建築」身上（光環）
//           'build'= 建造時只觸發一次
// count     本效果「要乘幾倍 amount」（flat = 1）；cap 可限制最多算幾個
// cond      卡牌說明文字裡的「條件」部分
const names = (target, targetType) => {
  if (targetType !== undefined) return `所有「${targetType}」類建築`;
  return targetList(target).length && target !== 'any'
    ? targetList(target).map(id => (CARDS[id] ? CARDS[id].name : id)).join('、') : '建築';
};
const capText = (e, unit) => e.cap === undefined ? '' : `（最多 ${e.cap} ${unit}）`;
const ANY_OUTPUT = ['resource', 'capacity', 'score'];

export const EFFECT_TYPES = {
  points: {
    title: '每回合固定產出', phase: 'own', needs: [], optional: [], outputs: ['resource', 'capacity'],
    count: () => 1, cond: () => ''
  },
  finalScore: {
    title: '最終分數加成', phase: 'own', needs: [], optional: [], outputs: ['score'],
    count: () => 1, cond: () => ''
  },
  adjacentBuilding: {
    title: '相鄰建築加成', phase: 'own', needs: [], optional: ['target', 'targetType', 'cap'], outputs: ANY_OUTPUT, counted: true,
    count: (e, cell) => matchingInstances(neighbors(cell), e.target, e.targetType),
    cond: e => `每座相鄰的${names(e.target, e.targetType)}${capText(e, '座')}`
  },
  adjacentLandform: {
    title: '相鄰地形加成', phase: 'own', needs: ['landform'], optional: ['cap'], outputs: ANY_OUTPUT, counted: true,
    count: (e, cell) => neighbors(cell).filter(n => n.landform === e.landform).length,
    cond: e => `每格相鄰的${LANDFORM_NAMES[e.landform] || e.landform}${capText(e, '格')}`
  },
  adjacentBiome: {
    title: '相鄰地貌加成', phase: 'own', needs: ['biome'], optional: ['cap'], outputs: ANY_OUTPUT, counted: true,
    count: (e, cell) => neighbors(cell).filter(n => n.biome === e.biome).length,
    cond: e => `每格相鄰的${BIOME_NAMES[e.biome] || e.biome}${capText(e, '格')}`
  },
  adjacentRiver: {
    title: '河流加成', phase: 'own', needs: [], optional: ['cap'], outputs: ANY_OUTPUT, counted: true,
    count: (e, cell) => riverEdgeCount(cell),
    cond: e => `每段流經本格邊界的河流${capText(e, '段')}`
  },
  radiusBuilding: {
    title: '範圍內建築加成', phase: 'own', needs: ['radius'], optional: ['target', 'targetType', 'cap'], outputs: ANY_OUTPUT, counted: true,
    count: (e, cell) => matchingInstances(buildingsWithin(cell, e.radius), e.target, e.targetType),
    cond: e => `${e.radius} 格內每座${names(e.target, e.targetType)}${capText(e, '座')}`
  },
  buildingCount: {
    title: '建築數量門檻', phase: 'own', needs: ['min'], optional: ['target', 'targetType'], outputs: ANY_OUTPUT,
    count: e => buildingInstances(countMatching(e.target, e.targetType)) >= e.min ? 1 : 0,
    cond: e => `全城至少有 ${e.min} 座${names(e.target, e.targetType)}時`
  },
  uniqueTypes: {
    title: '建築種類數量加成', phase: 'own', needs: [], optional: ['cap'], outputs: ANY_OUTPUT, counted: true,
    count: () => uniqueBuildingTypes(),
    cond: e => `城市中每一種不同的建築${capText(e, '種')}`
  },
  adjacentAura: {
    title: '對相鄰建築提供光環', phase: 'aura', needs: ['target'], optional: [], outputs: ANY_OUTPUT,
    cond: e => `對每座相鄰的${names(e.target, e.targetType)}`
  },
  onBuild: {
    title: '建造時一次性獲得', phase: 'build', needs: [], optional: ['target', 'targetType', 'cap'], outputs: ['resource', 'score'], counted: true,
    // 未指定 target / targetType 時固定觸發一次；有指定時，依相鄰符合條件的建築數量計算。
    count: (e, cell) => e.target === undefined && e.targetType === undefined ? 1 : matchingInstances(neighbors(cell), e.target, e.targetType),
    cond: e => '建造時' + (e.target === undefined && e.targetType === undefined ? '' : `每座相鄰的${names(e.target, e.targetType)}${capText(e, '座')}`)
  }
};

// ---------- 科技 / 文化樹的效果 ----------
export const TREE_EFFECT_TYPES = {
  unlockBuilding: { title: '解鎖建築', needs: ['target'], optional: ['mode', 'replaces'] },
  buildingBonus:  { title: '指定建築類型的固定加成（依建築等級倍增）', needs: ['output', 'amount'], optional: ['target', 'targetType'] },
  effectBoost:    { title: '強化指定建築或類型的某種效果', needs: ['effectType', 'amount'], optional: ['target', 'targetType'] }
};

export const TREES = [TECH_TREE, CULTURE_TREE];
export function activeTreeEffects(){
  const out = [];
  for(const tree of TREES) for(const id in tree){
    if(tree[id].unlocked) out.push(...(tree[id].effects || []));
  }
  return out;
}
// 目前已解鎖的建築 id（來自科技 / 文化樹的 unlockBuilding）
export function unlockedBuildingIds(){
  return activeTreeEffects().filter(e => e.type === 'unlockBuilding').map(e => e.target);
}
// 針對單一科技/文化效果產生中文說明
export function describeTreeEffect(e) {
  if (!e || !e.type) return '';

  switch (e.type) {
    case 'unlockBuilding': {
      const targetCard = CARDS[e.target];
      const targetName = targetCard ? `${targetCard.emoji} ${targetCard.name}` : e.target;
      const mode = e.mode || 'addPool';

      if (mode === 'upgradeOnly') {
        return `解鎖建築【${targetName}】（僅限升級獲得，不加入抽牌卡池）`;
      } else if (mode === 'replacePool') {
        const replaceCard = CARDS[e.replaces];
        const replaceName = replaceCard ? `${replaceCard.emoji} ${replaceCard.name}` : e.replaces;
        return `解鎖建築【${targetName}】（將卡池中的【${replaceName}】替換為此建築）`;
      } else {
        return `解鎖新建築【${targetName}】（加入抽牌卡池）`;
      }
    }

    case 'buildingBonus': {
      const targets = targetList(e.target);
      const names = targets.map(id => (CARDS[id] ? `${CARDS[id].emoji} ${CARDS[id].name}` : id)).join('、');
      const outputInfo = OUTPUTS[e.output];
      const outputLabel = outputInfo ? outputInfo.label : e.output;
      const sign = e.amount > 0 ? '+' : '';

      return `所有 ${names} 每回合額外 ${outputLabel} ${sign}${e.amount}`;
    }

    case 'effectBoost': {
      const targetCard = CARDS[e.target];
      const targetName = targetCard ? `${targetCard.emoji} ${targetCard.name}` : e.target;
      const effectTitle = EFFECT_TYPES[e.effectType]?.title || e.effectType;
      const sign = e.amount > 0 ? '+' : '';

      return `強化 ${targetName} 的「${effectTitle}」效果 ${sign}${e.amount}`;
    }

    default:
      return '';
  }
}

// 自動生成科技/文化節點的效果說明
export function describeTreeNode(node) {
  if (!node.effects || !node.effects.length) return '（無特殊效果）';
  // 取得每個效果的文字說明陣列
  const parts = node.effects.map(describeTreeEffect).filter(Boolean);
  // 用 <br> 將每個效果隔開換行
  return parts.length ? parts.join('<br>') : '（無特殊效果）';
}


// ---------- 計算 ----------
export function emptyStats(){
  const s = {};
  for(const id in OUTPUTS) s[id] = 0;
  return s;
}
// 每升一級等同增加一座同類建築，因此所有持續效果（包含容量）都隨等級倍增。
export const levelFactor = (_output, level) => level;

// 算出整張棋盤每一格的產出，結果寫入 cell.stats（key 是 OUTPUTS 的 id）
export function computeCellStats(board){
  for(const c of board) c.stats = emptyStats();
  const tree = activeTreeEffects();
  const bonuses = tree.filter(e => e.type === 'buildingBonus');
  const boosts = tree.filter(e => e.type === 'effectBoost');
  const boostFor = (cardId, effectType) =>
    boosts.filter(b => matchesTarget(cardId, b.target, b.targetType) && b.effectType === effectType).reduce((s, b) => s + b.amount, 0);

  // 第 1 輪：每座建築「自己」的持續效果
  for(const c of board){
    if(!c.building) continue;
    const lvl = c.level || 1;
    for(const e of CARDS[c.building].effects || []){
      const spec = EFFECT_TYPES[e.type];
      if(!spec || spec.phase !== 'own') continue;
      let n = spec.count(e, c);
      if(spec.counted && e.cap !== undefined) n = Math.min(e.cap, n);
      c.stats[e.output] += n * (e.amount + boostFor(c.building, e.type)) * levelFactor(e.output, lvl);
    }
  }
  // 第 2 輪：光環。所有建築自己的數值都算完後才套用，結果不會受棋盤迴圈順序影響
  for(const c of board){
    if(!c.building) continue;
    const lvl = c.level || 1;
    for(const e of CARDS[c.building].effects || []){
      if(!EFFECT_TYPES[e.type] || EFFECT_TYPES[e.type].phase !== 'aura') continue;
      const amount = (e.amount + boostFor(c.building, e.type)) * levelFactor(e.output, lvl);
      for(const n of neighbors(c)) if(matchesTarget(n.building, e.target, e.targetType)) n.stats[e.output] += amount * (n.level || 1);
    }
  }
  // 第 3 輪：科技 / 文化樹的 buildingBonus（固定值）
  for(const c of board){
    if(!c.building) continue;
    for(const b of bonuses) if(matchesTarget(c.building, b.target, b.targetType)) c.stats[b.output] += b.amount * (c.level || 1);
  }
}

// 建造某建築「當下」會一次性獲得什麼：回傳 { output: 數量 }（只含非 0 的項目）
export function computeOnBuild(cardId, cell){
  const gains = {};
  for(const e of CARDS[cardId].effects || []){
    const spec = EFFECT_TYPES[e.type];
    if(!spec || spec.phase !== 'build') continue;
    let n = spec.count(e, cell);
    if(e.cap !== undefined) n = Math.min(e.cap, n);
    gains[e.output] = (gains[e.output] || 0) + n * e.amount;
  }
  for(const k in gains) if(gains[k] === 0) delete gains[k];
  return gains;
}

// ---------- 說明文字（卡牌的 desc 沒寫時，自動由效果產生）----------
// 同一個條件下的結果會合併，並固定排成：人口 → 每回合 → 建造時 → 最終分數
const signed = n => (n > 0 ? '+' : '') + n;
const ORDER = ['capacity', 'turn', 'build', 'score'];
function resultPart(e, spec){
  const o = OUTPUTS[e.output];
  if(!o) return { order: 'turn', prefix: '', body: `${e.output} ${signed(e.amount)}` };
  if(o.group === 'score') return { order: 'score', prefix: '', body: `${o.label} ${signed(e.amount)}` };
  if(o.group === 'capacity') return { order: 'capacity', prefix: '', body: `${o.label} ${signed(e.amount)}` };
  return spec.phase === 'build'
    ? { order: 'build', prefix: '獲得 ', body: `${e.amount} ${o.label}` }
    : { order: 'turn', prefix: '每回合 ', body: `${signed(e.amount)} ${o.label}` };
}
function joinParts(parts){
  const out = [];
  for(const order of ORDER){
    const group = parts.filter(p => p.order === order);
    if(group.length) out.push(group[0].prefix + group.map(p => p.body).join('、'));
  }
  return out.join('、');
}
export function describeEffects(effects){
  const groups = new Map();   // 條件相同的效果合併成一句
  for(const e of effects || []){
    const spec = EFFECT_TYPES[e.type];
    if(!spec) continue;
    const cond = spec.cond(e);
    if(!groups.has(cond)) groups.set(cond, []);
    groups.get(cond).push(resultPart(e, spec));
  }
  if(!groups.size) return '（沒有效果）';
  return [...groups].map(([cond, parts]) => cond ? `${cond}，${joinParts(parts)}` : joinParts(parts)).join('；') + '。';
}
export function describeCard(card){
  // 1. 取得原本的效果說明
  let desc = card.desc || describeEffects(card.effects);
  
  // 2. 如果有設定 preserveForest，就自動加上說明文字
  if (card.preserveForest) {
    // 移除結尾的句號，改用分號串接，看起來更自然
    if (desc.endsWith('。')) {
      desc = desc.slice(0, -1) + '；建造時保留森林。';
    } else {
      desc += '；建造時保留森林。';
    }
  }
  
  return desc;
}
