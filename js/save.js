// 存檔讀寫。
// 存檔格式：{ gameVersion, state, techTree, cultureTree }
//   gameVersion → 寫入存檔當下的遊戲版本（VERSION）。
// 【存檔不跨版本】只有「同一個遊戲版本」寫的存檔才讀得進來；版本不同一律不讀、也不遷移，
// 請玩家開新的一局。這樣改規則、改數值、改資料結構時都不必再顧慮舊存檔。
import { state, setState } from './state.js';
import { TECH_TREE, CULTURE_TREE, SHOP_ITEMS, SIZE, VERSION, SAVE_KEY, CARDS, LANDFORM_NAMES, BIOME_NAMES, updateDynamicTreeCosts } from './config.js';
import { getRandomMissions } from './game.js';

export function writeSave() {
  const saveData = { gameVersion: VERSION, state, techTree: {}, cultureTree: {} };
  for(const id in TECH_TREE) saveData.techTree[id] = TECH_TREE[id].unlocked;
  for(const id in CULTURE_TREE) saveData.cultureTree[id] = CULTURE_TREE[id].unlocked;
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

// 回傳 { data } 或 { error }，不會丟出例外
export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return { error: '找不到任何存檔。' };

    let data;
    try { data = JSON.parse(raw); }
    catch(e) { return { error: '存檔已損毀，無法讀取。' }; }

    // 版本不同一律不讀（不遷移）。先檢查版本，這樣舊存檔會得到清楚的說明，而不是「格式不正確」。
    if(!data || typeof data !== 'object' || data.gameVersion !== VERSION) {
      const from = data && typeof data === 'object' && data.gameVersion ? `v${data.gameVersion}` : '舊版';
      return { error: `此存檔來自 ${from}，與目前的 v${VERSION} 不相容，無法讀取。請開始新的一局。` };
    }
    if(!data.state || !Array.isArray(data.state.board) || data.state.board.length !== SIZE * SIZE) {
      return { error: '存檔格式不正確，無法讀取。' };
    }
    const validationError = validateSaveData(data);
    if(validationError) return { error: validationError };
    return { data };
  } catch(e) {
    return { error: '讀取存檔失敗，資料可能已損毀或瀏覽器儲存空間無法使用。' };
  }
}

function validateSaveData(data) {
  const s = data.state;
  const requiredNumbers = ['turn', 'gold', 'faith', 'currentPopulation', 'storedFood'];
  if(requiredNumbers.some(key => !Number.isFinite(s[key]))) return '存檔格式不正確：資源或回合資料缺失。';
  if(!s.board.every((cell, index) => {
    const x = index % SIZE, y = Math.floor(index / SIZE);
    return cell && typeof cell === 'object' && cell.x === x && cell.y === y &&
      Object.hasOwn(LANDFORM_NAMES, cell.landform) && Object.hasOwn(BIOME_NAMES, cell.biome) &&
      (cell.building == null || Object.hasOwn(CARDS, cell.building)) &&
      (cell.construction === undefined || (cell.building == null && Object.hasOwn(CARDS, cell.construction.wonderId) && CARDS[cell.construction.wonderId].rarity === 'wonder' && Number.isInteger(cell.construction.turnsRemaining) && cell.construction.turnsRemaining > 0)) &&
      (cell.riverEdges === undefined || (Array.isArray(cell.riverEdges) && cell.riverEdges.every(dir => ['N', 'E', 'S', 'W'].includes(dir))));
  })) return '存檔格式不正確：棋盤資料包含無效地形或建築。';
  if(s.hand !== undefined && (!Array.isArray(s.hand) || s.hand.some(card => !card || !Object.hasOwn(CARDS, card.type)))) {
    return '存檔格式不正確：手牌資料無效。';
  }
  if(s.shop !== undefined && (!Array.isArray(s.shop) || s.shop.some(item => !item || !SHOP_ITEMS.some(shopItem => shopItem.id === item.id)))) {
    return '存檔格式不正確：商店資料無效。';
  }
  return null;
}

// 把（已通過 readSave 驗證的）存檔套用到遊戲
export function applySave(data) {
  setState(data.state);
  // 先全部重置，避免殘留上一局的解鎖狀態
  for(const id in TECH_TREE) TECH_TREE[id].unlocked = !!(data.techTree && data.techTree[id]);
  for(const id in CULTURE_TREE) CULTURE_TREE[id].unlocked = !!(data.cultureTree && data.cultureTree[id]);
  state.unlockedTechs = Object.keys(TECH_TREE).filter(id => TECH_TREE[id].unlocked);
  state.unlockedCultures = Object.keys(CULTURE_TREE).filter(id => CULTURE_TREE[id].unlocked);
  updateDynamicTreeCosts(TECH_TREE, state.unlockedTechs || []);
  updateDynamicTreeCosts(CULTURE_TREE, state.unlockedCultures || []);
  if(!state.activeMissions) state.activeMissions = getRandomMissions(3);
  state.selected = null;
  state.selectedWonder = null;
}
