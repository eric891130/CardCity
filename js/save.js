// 存檔讀寫與版本遷移。
// 存檔格式：{ version, gameVersion, state, techTree, cultureTree }
//   version     → 存檔「資料格式」版本（SAVE_VERSION），格式有不相容變動時才加 1，並在 migrateSave 補一段遷移
//   gameVersion → 遊戲顯示版本（VERSION），僅供除錯參考
import { state, setState } from './state.js';
import { TECH_TREE, CULTURE_TREE, SHOP_ITEMS, SIZE, VERSION, SAVE_VERSION, SAVE_KEY, LEGACY_SAVE_KEYS } from './config.js';
import { getRandomMissions, generateRiverEdges } from './game.js';

export function writeSave() {
  const saveData = { version: SAVE_VERSION, gameVersion: VERSION, state, techTree: {}, cultureTree: {} };
  for(const id in TECH_TREE) saveData.techTree[id] = TECH_TREE[id].unlocked;
  for(const id in CULTURE_TREE) saveData.cultureTree[id] = CULTURE_TREE[id].unlocked;
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

// 回傳 { data } 或 { error }，不會丟出例外
export function readSave() {
  let raw = localStorage.getItem(SAVE_KEY);
  if(!raw) {
    // 找不到新 key → 嘗試舊版 key（舊存檔沒有 version 欄位，視為 version 0）
    for(const key of LEGACY_SAVE_KEYS) {
      raw = localStorage.getItem(key);
      if(raw) break;
    }
  }
  if(!raw) return { error: '找不到任何存檔。' };

  let data;
  try { data = JSON.parse(raw); }
  catch(e) { return { error: '存檔已損毀，無法讀取。' }; }

  if(!data || typeof data !== 'object' || !data.state || !Array.isArray(data.state.board) || data.state.board.length !== SIZE * SIZE) {
    return { error: '存檔格式不正確，無法讀取。' };
  }
  if((data.version || 0) > SAVE_VERSION) {
    return { error: '此存檔來自較新的遊戲版本，無法讀取。' };
  }
  return { data: migrateSave(data) };
}

function migrateSave(data) {
  const s = data.state;
  const v = data.version || 0;

  if(v < 1) {
    // v0 → v1
    // 1. 商店改為只存 {id, locked}（函式無法序列化）
    s.shop = (s.shop || []).filter(e => SHOP_ITEMS.some(item => item.id === e.id)).map(e => ({ id: e.id, locked: !!e.locked }));
    // 2. 補上 assets.tech；移除已廢止的環境分
    s.assets = Object.assign({ culture: 0, tech: 0, faith: 0 }, s.assets);
  }
  if(v < 2) {
    // v1 → v2：產出改以 OUTPUTS 的 id 命名，並拆成「每回合資源」與「最終分數」兩套
    s.bonusScore = { cultureScore: s.bonusCulture || 0, techScore: 0, faithScore: 0 };
    s.scores = { cultureScore: 0, techScore: 0, faithScore: 0 };
    s.perTurn = {};
    for(const k of ['bonusCulture', 'assets', 'income', 'food', 'turnTechIncome', 'turnCultureIncome', 'turnFaithIncome']) delete s[k];
  }
  if(v < 3) {
    // v2 → v3：舊 terrain 拆成 landform + biome。
    // 舊 plain → 平原草原；forest → 平原森林；water → 河流濕地；mountain → 山地雪地。
    const legacy = {
      plain: { landform:'plain', biome:'grassland' },
      forest: { landform:'plain', biome:'forest' },
      water: { landform:'river', biome:'wetland' },
      mountain: { landform:'mountain', biome:'snow' }
    };
    for(const cell of s.board || []) {
      if(!cell.landform || !cell.biome) {
        const converted = legacy[cell.terrain] || { landform:'plain', biome:'grassland' };
        cell.landform = cell.landform || converted.landform;
        cell.biome = cell.biome || converted.biome;
      }
      delete cell.terrain;
    }
  }

  if(v < 4) {
    // v3 → v4：河流改為格子邊界上的河段；舊版「河流＋濕地」格轉為「水域＋水域」。
    for(const cell of s.board || []) {
      if(cell.landform === 'river') {
        cell.landform = 'water';
        cell.biome = 'water';
      }
      if(!Array.isArray(cell.riverEdges)) cell.riverEdges = [];
    }
    // 舊存檔沒有河段資料，為了讓新規則可用，遷移時補生成一條河流。
    generateRiverEdges(s.board || []);
  }

  if(v < 5) {
    // v4 → v5：新增實際人口。舊版的 maxPopulation 曾用於糧食消耗，
    // 因此以舊人口容量作為遷移後的初始實際人口。
    if(!Number.isFinite(s.currentPopulation)) {
      s.currentPopulation = Math.max(1, Number(s.maxPopulation) || Number(s.basePopulation) || 1);
    }
    if(!Number.isFinite(s.basePopulation)) s.basePopulation = 1;
    if(!Number.isFinite(s.storedFood)) s.storedFood = 5;
    if(!Number.isFinite(s.lostPopulation)) s.lostPopulation = 0;
  }

  data.version = SAVE_VERSION;
  return data;
}

// 把（已通過 readSave 驗證與遷移的）存檔套用到遊戲
export function applySave(data) {
  setState(data.state);
  // 先全部重置，避免殘留上一局的解鎖狀態
  for(const id in TECH_TREE) TECH_TREE[id].unlocked = !!(data.techTree && data.techTree[id]);
  for(const id in CULTURE_TREE) CULTURE_TREE[id].unlocked = !!(data.cultureTree && data.cultureTree[id]);
  if(!state.activeMissions) state.activeMissions = getRandomMissions(3);
  state.selected = null;
}
