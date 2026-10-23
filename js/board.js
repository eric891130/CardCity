// 棋盤查詢：相鄰、範圍、計數。只負責「問棋盤問題」，不修改任何東西。
//   相鄰 = 周圍 8 格（含斜角）
//   範圍 = 以自己為中心的正方形（棋盤距離 <= radius），不含自己
import { state } from './state.js';
import { SIZE } from './config.js';

// target 可以是：單一建築 id、建築 id 陣列、或 'any'（任何建築）
export function targetList(target){
  return target === undefined ? [] : Array.isArray(target) ? target : [target];
}
export function matchesTarget(buildingId, target){
  return !!buildingId && (target === 'any' || targetList(target).includes(buildingId));
}

export function neighbors(cell){
  const out = [];
  for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++){
    if(!dx && !dy) continue;
    const x = cell.x + dx, y = cell.y + dy;
    if(x>=0 && x<SIZE && y>=0 && y<SIZE) out.push(state.board[y*SIZE + x]);
  }
  return out;
}

export function distance(a, b){ return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y)); }

// 範圍內「有建築」的格子（不含自己）
export function buildingsWithin(cell, radius){
  return state.board.filter(o => o.building && o !== cell && distance(cell, o) <= radius);
}

export function countBuilding(type){
  if(!state || !state.board) return 0;
  return state.board.filter(c => c.building === type).length;
}
// 全城符合 target 的建築總數（target 可為 id / 陣列 / 'any'）
export function countMatching(target){
  if(!state || !state.board) return 0;
  return state.board.filter(c => matchesTarget(c.building, target)).length;
}
export function uniqueBuildingTypes(){
  if(!state || !state.board) return 0;
  return new Set(state.board.filter(c => c.building).map(c => c.building)).size;
}
// 河流以棋盤格邊界表示；riverEdges 儲存 N/E/S/W 方向。
export function riverEdgeCount(cell){
  return Array.isArray(cell?.riverEdges) ? cell.riverEdges.length : 0;
}
export function hasRiver(cell){ return riverEdgeCount(cell) > 0; }