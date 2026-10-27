// 科技樹 / 文化樹的共用邏輯：兩棵樹只有「資料來源、點數種類、文案」不同，
// 繪製、節點視窗、解鎖流程全部共用同一份程式碼。
import { state, message, playSound } from './state.js';
import { TECH_TREE, CULTURE_TREE } from './config.js';
import { availableCardPool} from './game.js';
import { describeTreeNode } from './effects.js';

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
// 橫向排版：依「層級」由左到右排成一欄一欄（第 0 層在最左邊），
// 前置關係的連線從左邊節點的「右側」連到右邊節點的「左側」。
export function renderTree(kind, onNodeClick) {
  const meta = TREES[kind], tree = meta.tree, p = meta.prefix;
  const el = $(meta.containerId);
  if(!el) return;
  el.innerHTML = '';
  $(meta.pointsStatId).textContent = `${meta.icon} ${state[meta.pointsKey]} 點`;

  const scroller = document.createElement('div');
  scroller.style.cssText = 'width:100%; overflow-x:auto; overflow-y:hidden;';

  const wrapper = document.createElement('div');
  wrapper.className = 'tech-tree-wrapper';
  wrapper.style.cssText = 'position:relative; display:block; width:max-content; min-width:100%; box-sizing:border-box;';

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:1;';

  const markerId = `${p}-arrow`;
  const defs = document.createElementNS(svgNS, 'defs');
  const marker = document.createElementNS(svgNS, 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const markerPath = document.createElementNS(svgNS, 'path');
  markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  markerPath.setAttribute('fill', 'var(--line, #555)');
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  svg.appendChild(defs);
  wrapper.appendChild(svg);

  // 1. 計算每個節點的深度層級 (Level)
  const levels = {};
  const getLevel = id => {
    if(levels[id] !== undefined) return levels[id];
    const node = tree[id];
    if(!node.requires || node.requires.length === 0) return (levels[id] = 0);
    return (levels[id] = Math.max(...node.requires.map(getLevel)) + 1);
  };
  for(const id in tree) getLevel(id);

  const tierMap = {};
  for(const id in tree) (tierMap[levels[id]] = tierMap[levels[id]] || []).push(id);

  // 💡 【優化點 1】：對每一欄內部的節點排序，儘量讓連線來源靠近的節點排在相近的高度的上/下位置，減少線條交叉
  for (const lvl in tierMap) {
    tierMap[lvl].sort((a, b) => {
      const reqA = tree[a].requires || [];
      const reqB = tree[b].requires || [];
      if (reqA.length && reqB.length) {
        return reqA[0].localeCompare(reqB[0]);
      }
      return 0;
    });
  }

  const maxLevel = Math.max(...Object.keys(tierMap).map(Number));
  const columns = document.createElement('div');
  columns.style.cssText = 'display:flex; flex-direction:row; align-items:center; justify-content:center; gap:90px; position:relative; z-index:2; padding:20px;';

  for(let lvl = 0; lvl <= maxLevel; lvl++) {
    const col = document.createElement('div');
    col.className = 'tech-col';
    col.style.cssText = 'display:flex; flex-direction:column; justify-content:center; gap:28px;';
    (tierMap[lvl] || []).forEach(id => {
      const node = tree[id];
      const canUnlock = state[meta.pointsKey] >= node.cost && requirementsMet(meta, node);
      const statusClass = node.unlocked ? 'unlocked' : (canUnlock ? 'available' : 'locked');
      const div = document.createElement('div');
      div.id = `${p}-node-${id}`;
      div.className = `tech-node ${statusClass}`;
      div.innerHTML = `<span class="tech-icon">${node.icon}</span><span class="tech-name">${node.name}</span>`;
      div.addEventListener('click', () => { if(onNodeClick) onNodeClick(id); });
      col.appendChild(div);
    });
    columns.appendChild(col);
  }
  wrapper.appendChild(columns);
  scroller.appendChild(wrapper);
  el.appendChild(scroller);

  // 💡 【優化點 2】：改進平滑平行的 SVG 連線演算法，避免打結與過度拉扭
  requestAnimationFrame(() => {
    const wrapperRect = wrapper.getBoundingClientRect();
    for(const id in tree) {
      const node = tree[id];
      if(!node.requires || node.requires.length === 0) continue;
      const childEl = document.getElementById(`${p}-node-${id}`);
      
      node.requires.forEach(reqId => {
        const parentEl = document.getElementById(`${p}-node-${reqId}`);
        if(!parentEl || !childEl) return;
        const pRect = parentEl.getBoundingClientRect();
        const cRect = childEl.getBoundingClientRect();

        const x1 = pRect.right - wrapperRect.left;
        const y1 = pRect.top + pRect.height / 2 - wrapperRect.top;
        const x2 = cRect.left - wrapperRect.left;
        const y2 = cRect.top + cRect.height / 2 - wrapperRect.top;

        // 計算兩點之間的水平距離，以此動態調節 Control Point Offset，避免打結
        const deltaX = Math.abs(x2 - x1);
        const controlOffset = Math.min(Math.max(deltaX * 0.5, 30), 80);

        const path = document.createElementNS(svgNS, 'path');
        // 使用動態控制點：C (x1 + controlOffset, y1) (x2 - controlOffset, y2) (x2, y2)
        path.setAttribute('d', `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`);
        path.setAttribute('stroke', node.unlocked ? 'var(--gold, #f1c40f)' : 'var(--line, #444)');
        path.setAttribute('stroke-width', node.unlocked ? '2.5' : '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', `url(#${markerId})`);
        svg.appendChild(path);
      });
    }
  });
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

  playSound('win');
  message(`${meta.successText}：${node.name}！`, false, true);
  closeTreeModal(kind);
  if(onDone) onDone();
}
