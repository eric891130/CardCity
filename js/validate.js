// 設定檢查器：啟動時掃過 CARDS / cardPool / 科技樹 / 文化樹，把「寫錯」的地方用白話講出來，
// 而不是讓建築「安靜地沒有效果」。回傳問題清單（空陣列 = 沒問題）。
// 規則來源是 effects.js 的登記表，所以新增效果類型時，這裡不用改。
import { CARDS, OUTPUTS, TERRAIN_NAMES, TECH_TREE, CULTURE_TREE, cardPool } from './config.js';
import { EFFECT_TYPES, TREE_EFFECT_TYPES } from './effects.js';
import { targetList } from './board.js';

// 舊格式欄位 → 新格式欄位的對照（貼舊程式碼進來時，直接告訴你怎麼改）
const LEGACY_EFFECT_FIELDS = { kind: 'type', key: 'output', category: 'output', value: 'amount' };

export function validateCards(cards = CARDS, pool = cardPool, trees = { tech: TECH_TREE, culture: CULTURE_TREE }) {
  const problems = [];
  const bad = (where, text) => problems.push(`[${where}] ${text}`);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const terrains = Object.keys(TERRAIN_NAMES);
  const outputList = Object.keys(OUTPUTS).join(' / ');
  const typeList = Object.keys(EFFECT_TYPES).join(' / ');

  // target 可以是單一 id、id 陣列、或 'any'
  const checkTarget = (w, target) => {
    if (target === 'any') return;
    const list = targetList(target);
    if (!list.length) bad(w, 'target 不能是空的。');
    for (const t of list) if (!(t in cards)) bad(w, `target "${t}" 不是任何建築的 id。`);
  };
  const checkOutput = (w, output, allowedGroups, typeName) => {
    if (!(output in OUTPUTS)) { bad(w, `output ${output === undefined ? '沒有填' : `"${output}" 不存在`}（可用：${outputList}）。`); return; }
    if (allowedGroups && !allowedGroups.includes(OUTPUTS[output].group)) {
      const ok = Object.keys(OUTPUTS).filter(id => allowedGroups.includes(OUTPUTS[id].group)).join(' / ');
      bad(w, `${typeName} 的 output 不能是 "${output}"（${OUTPUTS[output].label}屬於 ${OUTPUTS[output].group} 類）。可用：${ok}。`);
    }
  };

  const CARD_FIELDS = ['name', 'emoji', 'type', 'cost', 'terrain', 'effects', 'desc'];
  for (const id in cards) {
    const c = cards[id], at = `CARDS.${id}`;
    if (typeof c.name !== 'string' || !c.name) bad(at, '缺少 name（顯示名稱）。');
    if (typeof c.emoji !== 'string' || !c.emoji) bad(at, '缺少 emoji。');
    if (!c.cost || !isNum(c.cost.gold) || !isNum(c.cost.pop)) bad(at, 'cost 必須寫成 {gold:數字, pop:數字}（不佔人口就寫 pop:0）。');
    if (!Array.isArray(c.terrain) || !c.terrain.length) bad(at, `terrain 必須是非空陣列，例如 ['plain','forest']。`);
    else for (const t of c.terrain) if (!terrains.includes(t)) bad(at, `terrain 裡的 "${t}" 不是有效地形（可用：${terrains.join(' / ')}）。`);
    if ('production' in c) bad(at, '"production" 已移除：固定產出改寫成 effects 裡的 {type:\'points\', output:\'gold\', amount:2}（人口寫 output:\'population\'）。');
    for (const k in c) if (!CARD_FIELDS.includes(k) && k !== 'production') bad(at, `未知的欄位 "${k}"（可用：${CARD_FIELDS.join(' / ')}）。`);
    if (c.effects !== undefined && !Array.isArray(c.effects)) { bad(at, 'effects 必須是陣列。'); continue; }

    (c.effects || []).forEach((e, i) => {
      const w = `${at}.effects[${i}]`;
      let legacy = false;
      for (const old in LEGACY_EFFECT_FIELDS) if (old in e) { legacy = true; bad(w, `舊格式欄位 "${old}" 已改名為 "${LEGACY_EFFECT_FIELDS[old]}"。`); }
      if (legacy) return;
      const spec = EFFECT_TYPES[e.type];
      if (!spec) { bad(w, `type ${e.type === undefined ? '沒有填' : `"${e.type}" 不存在`}（可用：${typeList}）。`); return; }
      for (const k in e) if (!['type', 'output', 'amount', ...spec.needs, ...spec.optional].includes(k)) bad(w, `${e.type} 沒有 "${k}" 這個欄位（可用：${['type', 'output', 'amount', ...spec.needs, ...spec.optional].join(' / ')}）。`);
      if (!isNum(e.amount)) bad(w, 'amount 必須是數字。');
      for (const f of spec.needs) if (e[f] === undefined) bad(w, `${e.type} 需要欄位 "${f}"。`);
      checkOutput(w, e.output, spec.outputs, e.type);
      if (e.target !== undefined) checkTarget(w, e.target);
      if (e.terrain !== undefined && !terrains.includes(e.terrain)) bad(w, `terrain "${e.terrain}" 不是有效地形（可用：${terrains.join(' / ')}）。`);
      for (const f of ['radius', 'min', 'cap']) if (e[f] !== undefined && !isNum(e[f])) bad(w, `${f} 必須是數字。`);
    });
  }

  // 科技 / 文化樹
  const unlockable = new Set();
  const TREE_FIELDS = ['name', 'icon', 'cost', 'requires', 'desc', 'unlocked', 'effects'];
  for (const treeName in trees) {
    const tree = trees[treeName];
    for (const id in tree) {
      const n = tree[id], at = `${treeName === 'tech' ? 'TECH_TREE' : 'CULTURE_TREE'}.${id}`;
      if (typeof n.name !== 'string' || !n.name) bad(at, '缺少 name。');
      if (!isNum(n.cost)) bad(at, 'cost 必須是數字。');
      if (!Array.isArray(n.requires)) bad(at, 'requires 必須是陣列（沒有前置就寫 []）。');
      else for (const r of n.requires) if (!(r in tree)) bad(at, `requires 裡的 "${r}" 不是這棵樹的節點 id。`);
      if ('effect' in n) bad(at, '"effect" 已改為 "effects"（陣列），例如 effects:[{type:\'unlockBuilding\', target:\'watermill\'}]。');
      if ('modifyCell' in n) bad(at, '"modifyCell" 函式已移除：請改用 effects 裡的 buildingBonus / effectBoost（見 config.js 說明）。');
      for (const k in n) if (!TREE_FIELDS.includes(k) && k !== 'effect' && k !== 'modifyCell') bad(at, `未知的欄位 "${k}"（可用：${TREE_FIELDS.join(' / ')}）。`);
      if (n.effects !== undefined && !Array.isArray(n.effects)) { bad(at, 'effects 必須是陣列。'); continue; }

      (n.effects || []).forEach((e, i) => {
        const w = `${at}.effects[${i}]`, spec = TREE_EFFECT_TYPES[e.type];
        if (!spec) { bad(w, `type ${e.type === undefined ? '沒有填' : `"${e.type}" 不存在`}（可用：${Object.keys(TREE_EFFECT_TYPES).join(' / ')}）。`); return; }
        const allowed = ['type', ...spec.needs, ...spec.optional];
        for (const k in e) if (!allowed.includes(k)) bad(w, `${e.type} 沒有 "${k}" 這個欄位（可用：${allowed.join(' / ')}）。`);
        for (const f of spec.needs) if (e[f] === undefined) bad(w, `${e.type} 需要欄位 "${f}"。`);
        if (e.target !== undefined) checkTarget(w, e.target);
        if (e.type === 'unlockBuilding') { if (typeof e.target === 'string') unlockable.add(e.target); if (Array.isArray(e.target) || e.target === 'any') bad(w, 'unlockBuilding 的 target 必須是單一建築 id。'); }
        if (e.type === 'buildingBonus') { checkOutput(w, e.output, ['resource', 'capacity', 'score'], e.type); if (!isNum(e.amount)) bad(w, 'amount 必須是數字。'); }
        if (e.type === 'effectBoost') {
          if (!isNum(e.amount)) bad(w, 'amount 必須是數字。');
          if (!(e.effectType in EFFECT_TYPES)) bad(w, `effectType ${e.effectType === undefined ? '沒有填' : `"${e.effectType}" 不存在`}（可用：${typeList}）。`);
          else if (typeof e.target === 'string' && cards[e.target] && !(cards[e.target].effects || []).some(x => x.type === e.effectType))
            bad(w, `${cards[e.target].name} 沒有任何 ${e.effectType} 效果，這個強化不會有作用。`);
          if (typeof e.target !== 'string' || e.target === 'any') bad(w, 'effectBoost 的 target 必須是單一建築 id。');
        }
      });
    }
  }

  // 卡池與解鎖：每座建築都必須「抽得到」
  pool.forEach(id => { if (!(id in cards)) bad('cardPool', `"${id}" 不是任何建築的 id。`); });
  new Set(pool.filter((id, i) => pool.indexOf(id) !== i)).forEach(id => bad('cardPool', `"${id}" 重複出現了。`));
  for (const id in cards) if (!pool.includes(id) && !unlockable.has(id)) bad(`CARDS.${id}`, '沒有加進 cardPool，也沒有被任何科技解鎖，所以永遠抽不到。');

  return problems;
}
