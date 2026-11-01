// 科技樹 / 文化樹的共用邏輯：兩棵樹只有「資料來源、點數種類、文案」不同，
// 繪製、節點視窗、解鎖流程全部共用同一份程式碼。
import { state, message, playSound } from './state.js';
import { updateDynamicTreeCosts,TECH_TREE, CULTURE_TREE } from './config.js';
import { availableCardPool} from './game.js';
import { describeTreeNode } from './effects.js';
import { layoutTree, edgePath } from './treeLayout.js';

const $ = id => document.getElementById(id);

// prefix 對應 index.html 內的元素 id：${prefix}ModalTitle、${prefix}ModalDesc ...
export const TREES = {
  tech: {
    tree: TECH_TREE, prefix: 'tech', icon: '🔬',
    containerId: 'techTreeContainer', pointsStatId: 'techPointsStat',
    pointsKey: 'techPoints', unlockedKey: 'unlockedTechs',
    costLabel: '研發消耗', doneText: '已研發', readyText: '可研發',
    shortText: '科技點不足', successText: '成功解鎖科技'
  },
  culture: {
    tree: CULTURE_TREE, prefix: 'culture', icon: '🎭',
    containerId: 'cultureTreeContainer', pointsStatId: 'culturePointsStat',
    pointsKey: 'culturePoints', unlockedKey: 'unlockedCultures',
    costLabel: '解鎖消耗', doneText: '已解鎖', readyText: '可解鎖',
    shortText: '文化點不足', successText: '成功解鎖文化'
  }
};


const selectedNode = { tech: null, culture: null };

function requirementsMet(meta, node) {
  return node.requires.every(req => meta.tree[req].unlocked);
}

// ---------- 繪製 ----------
// 排版交給 treeLayout.js（分層圖排版）：節點用絕對座標擺放，連線只走在節點之間的空隙，
// 跨很多層的連線會沿著中間欄預留的水平通道穿過去，不會壓到任何節點。
// 座標是用資料算出來的（不量 DOM），所以分頁還沒顯示出來時也能正確繪製。
export function renderTree(kind, onNodeClick) {
  const meta = TREES[kind], tree = meta.tree, p = meta.prefix;
  const el = $(meta.containerId);
  if(!el) return;
  el.innerHTML = '';
  $(meta.pointsStatId).textContent = `${meta.icon} ${state[meta.pointsKey]} 點`;

  const layout = layoutTree(tree);

  const scroller = document.createElement('div');
  scroller.style.cssText = 'width:100%; overflow-x:auto; overflow-y:hidden;';

  const wrapper = document.createElement('div');
  wrapper.className = 'tech-tree-wrapper';
  wrapper.style.cssText = `position:relative; display:block; padding:0; gap:0; width:${layout.width}px; height:${layout.height}px; margin:0 auto; box-sizing:content-box;`;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', layout.width);
  svg.setAttribute('height', layout.height);
  svg.style.cssText = 'position:absolute; left:0; top:0; pointer-events:none; z-index:1;';

  // 兩種箭頭：未解鎖（灰）與已解鎖（金）。不用 context-stroke，避免舊版瀏覽器顯示成黑色。
  const defs = document.createElementNS(svgNS, 'defs');
  const makeMarker = (id, color) => {
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const markerPath = document.createElementNS(svgNS, 'path');
    markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    markerPath.setAttribute('fill', color);
    marker.appendChild(markerPath);
    defs.appendChild(marker);
  };
  const markerOff = `${p}-arrow`, markerOn = `${p}-arrow-on`;
  makeMarker(markerOff, 'var(--line, #555)');
  makeMarker(markerOn, 'var(--gold, #f1c40f)');
  svg.appendChild(defs);

  // 連線：已解鎖的畫在最上層，這樣金色的線不會被灰色的線蓋住
  const edges = [...layout.edges].sort((a, b) => (tree[a.to].unlocked ? 1 : 0) - (tree[b.to].unlocked ? 1 : 0));
  for(const edge of edges) {
    const unlocked = tree[edge.to].unlocked;
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', edgePath(edge.points));
    path.setAttribute('stroke', unlocked ? 'var(--gold, #f1c40f)' : 'var(--line, #444)');
    path.setAttribute('stroke-width', unlocked ? '2.5' : '1.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', `url(#${unlocked ? markerOn : markerOff})`);
    svg.appendChild(path);
  }
  wrapper.appendChild(svg);

  for(const id in tree) {
    const node = tree[id], pos = layout.nodes[id];
    const canUnlock = state[meta.pointsKey] >= node.cost && requirementsMet(meta, node);
    const statusClass = node.unlocked ? 'unlocked' : (canUnlock ? 'available' : 'locked');
    const div = document.createElement('div');
    div.id = `${p}-node-${id}`;
    div.className = `tech-node ${statusClass}`;
    div.style.cssText = `position:absolute; left:${pos.x}px; top:${pos.y}px; width:${pos.w}px; height:${pos.h}px; box-sizing:border-box; padding:0 12px; z-index:2; white-space:nowrap;`;
    div.innerHTML = `<span class="tech-icon">${node.icon}</span><span class="tech-name">${node.name}</span>`;
    div.addEventListener('click', () => { if(onNodeClick) onNodeClick(id); });
    wrapper.appendChild(div);
  }

  scroller.appendChild(wrapper);
  el.appendChild(scroller);
}

// ---------- 節點視窗 ----------
export function openTreeModal(kind, id) {
  const meta = TREES[kind], node = meta.tree[id], p = meta.prefix;
  selectedNode[kind] = id;
  $(`${p}ModalTitle`).textContent = `${node.icon} ${node.name}`;
  $(`${p}ModalDesc`).innerHTML = describeTreeNode(node);
  $(`${p}ModalCost`).textContent = `${meta.costLabel}：${node.cost} ${meta.icon}`;

  const statusEl = $(`${p}ModalStatus`);
  const btn = $(`${p}ModalResearchBtn`);
  
  const flavorEl = $(`${p}ModalFlavor`);
  if (flavorEl) {
    if (node.desc) {
      flavorEl.textContent = node.desc;
      flavorEl.style.display = 'block';
    } else {
      flavorEl.style.display = 'none';
    }
  }
  
  if(node.unlocked) {
    statusEl.textContent = `狀態：${meta.doneText} ✓`;
    statusEl.style.color = 'var(--green)';
    btn.style.display = 'none';
  } else {
    btn.style.display = 'inline-block';
    if(!requirementsMet(meta, node)) {
      const reqNames = node.requires.map(r => meta.tree[r].name).join('、');
      statusEl.textContent = `狀態：需先解鎖 [${reqNames}]`;
      statusEl.style.color = 'var(--red)';
      btn.disabled = true;
    } else if(state[meta.pointsKey] < node.cost) {
      statusEl.textContent = `狀態：${meta.shortText}`;
      statusEl.style.color = 'var(--orange)';
      btn.disabled = true;
    } else {
      statusEl.textContent = `狀態：${meta.readyText}`;
      statusEl.style.color = 'var(--gold)';
      btn.disabled = state.gameOver;
    }
  }
  $(`${p}ModalBackdrop`).classList.add('show');
}

export function closeTreeModal(kind) {
  $(`${TREES[kind].prefix}ModalBackdrop`).classList.remove('show');
}

export function hasResearchableNodes(kind) {
  const meta = TREES[kind];
  if(!meta || !meta.tree) return false;
  for(const id in meta.tree) {
    const node = meta.tree[id];
    if(!node.unlocked && requirementsMet(meta, node) && state[meta.pointsKey] >= node.cost) {
      return true;
    }
  }
  return false;
}

// ---------- 解鎖 ----------
export function unlockSelectedNode(kind, onDone) {
  const meta = TREES[kind], id = selectedNode[kind];
  if(!id || state.gameOver) return;
  const node = meta.tree[id];
  if(node.unlocked) return;
  if(!requirementsMet(meta, node)) return;
  if(state[meta.pointsKey] < node.cost) return;

  state[meta.pointsKey] -= node.cost;
  node.unlocked = true;
  state[meta.unlockedKey].push(id);

  // 處理該節點帶有的解鎖效果
  (node.effects || []).forEach(e => {
    if (e.type === 'unlockBuilding') {
      if (e.mode === 'replacePool' && e.replaces) {
        // 1. 將現有手牌 (state.hand) 裡的舊牌替換成新牌（已無實體牌庫，故只需處理手牌或直接略過）
        state.hand = state.hand.map(card => {
          const cType = (typeof card === 'object' && card !== null) ? card.type : card;
          if (cType === e.replaces) {
            return typeof card === 'object' ? { ...card, type: e.target } : e.target;
          }
          return card;
        });
      }
    }
  });

  updateDynamicTreeCosts(TECH_TREE, state.unlockedTechs);
  updateDynamicTreeCosts(CULTURE_TREE, state.unlockedCultures);

  playSound('win');
  message(`${meta.successText}：${node.name}！`, false, true);
  closeTreeModal(kind);
  if(onDone) onDone();
}
