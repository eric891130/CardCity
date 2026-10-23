// 科技樹 / 文化樹的共用邏輯：兩棵樹只有「資料來源、點數種類、文案」不同，
// 繪製、節點視窗、解鎖流程全部共用同一份程式碼。
import { state, message, playSound } from './state.js';
import { TECH_TREE, CULTURE_TREE } from './config.js';
import { availableCardPool, addCardsToDeck } from './game.js';

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

  // 外層負責橫向捲動：層級變多、寬度超過面板時不會被裁掉。
  // 連線的 SVG 畫在 wrapper 裡、跟節點一起捲動，所以量到的座標永遠正確。
  const scroller = document.createElement('div');
  scroller.style.cssText = 'width:100%; overflow-x:auto; overflow-y:hidden;';

  const wrapper = document.createElement('div');
  wrapper.className = 'tech-tree-wrapper';
  // 蓋過 CSS 裡縱向排版用的 flex column：寬度由內容撐開，但至少填滿整個面板
  wrapper.style.cssText = 'position:relative; display:block; width:max-content; min-width:100%; box-sizing:border-box;';

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:1;';

  const markerId = `${p}-arrow`;
  const defs = document.createElementNS(svgNS, 'defs');
  const marker = document.createElementNS(svgNS, 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const markerPath = document.createElementNS(svgNS, 'path');
  markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  markerPath.setAttribute('fill', 'var(--muted)');
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  svg.appendChild(defs);
  wrapper.appendChild(svg);

  // 依「前置節點的最深層級 + 1」決定每個節點在第幾欄
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

  const maxLevel = Math.max(...Object.keys(tierMap).map(Number));
  // 所有欄由左到右排成一列；欄與欄之間留出空間給連線與箭頭。align-items:center → 節點比較少的欄會垂直置中
  const columns = document.createElement('div');
  columns.style.cssText = 'display:flex; flex-direction:row; align-items:center; justify-content:center; gap:80px; position:relative; z-index:2;';

  for(let lvl = 0; lvl <= maxLevel; lvl++) {
    const col = document.createElement('div');
    col.className = 'tech-col';
    col.style.cssText = 'display:flex; flex-direction:column; justify-content:center; gap:24px;';
    tierMap[lvl].forEach(id => {
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

  // 節點排版完成後，量測位置再畫出前置關係的連線：左節點右側中點 → 右節點左側中點（水平的 S 形曲線）
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
        const midX = (x1 + x2) / 2;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
        path.setAttribute('stroke', 'var(--line)');
        path.setAttribute('stroke-width', '2');
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
  $(`${p}ModalDesc`).textContent = node.desc;
  $(`${p}ModalCost`).textContent = `${meta.costLabel}：${node.cost} ${meta.icon}`;

  const statusEl = $(`${p}ModalStatus`);
  const btn = $(`${p}ModalResearchBtn`);

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
        // 1. 將現有牌庫 (state.deck) 裡的舊牌替換成新牌
        state.deck = state.deck.map(card => {
          const cType = (typeof card === 'object' && card !== null) ? card.type : card;
          if (cType === e.replaces) {
            return typeof card === 'object' ? { ...card, type: e.target } : e.target;
          }
          return card;
        });
        // 2. 將現有手牌 (state.hand) 裡的舊牌也替換成新牌
        state.hand = state.hand.map(card => {
          const cType = (typeof card === 'object' && card !== null) ? card.type : card;
          if (cType === e.replaces) {
            return typeof card === 'object' ? { ...card, type: e.target } : e.target;
          }
          return card;
        });
      } else if (e.mode !== 'upgradeOnly') {
        // 一般解鎖：加入卡池與牌庫
          addCardsToDeck(e.target);
      }
    }
  });

  playSound('win');
  message(`${meta.successText}：${node.name}！`, false, true);
  closeTreeModal(kind);
  if(onDone) onDone();
}
