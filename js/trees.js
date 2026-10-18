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
export function renderTree(kind, onNodeClick) {
  const meta = TREES[kind], tree = meta.tree, p = meta.prefix;
  const el = $(meta.containerId);
  if(!el) return;
  el.innerHTML = '';
  $(meta.pointsStatId).textContent = `${meta.icon} ${state[meta.pointsKey]} 點`;

  const wrapper = document.createElement('div');
  wrapper.className = 'tech-tree-wrapper';
  wrapper.style.position = 'relative';

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

  // 依「前置節點的最深層級 + 1」決定每個節點在第幾列
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
  const rowsContainer = document.createElement('div');
  rowsContainer.style.cssText = 'display:flex; flex-direction:column; gap:40px; width:100%; z-index:2; position:relative;';

  for(let lvl = 0; lvl <= maxLevel; lvl++) {
    const row = document.createElement('div');
    row.className = 'tech-row';
    tierMap[lvl].forEach(id => {
      const node = tree[id];
      const canUnlock = state[meta.pointsKey] >= node.cost && requirementsMet(meta, node);
      const statusClass = node.unlocked ? 'unlocked' : (canUnlock ? 'available' : 'locked');
      const div = document.createElement('div');
      div.id = `${p}-node-${id}`;
      div.className = `tech-node ${statusClass}`;
      div.innerHTML = `<span class="tech-icon">${node.icon}</span><span class="tech-name">${node.name}</span>`;
      div.addEventListener('click', () => { if(onNodeClick) onNodeClick(id); });
      row.appendChild(div);
    });
    rowsContainer.appendChild(row);
  }
  wrapper.appendChild(rowsContainer);
  el.appendChild(wrapper);

  // 節點排版完成後，量測位置再畫出前置關係的連線
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
        const x1 = pRect.left + pRect.width / 2 - wrapperRect.left;
        const y1 = pRect.bottom - wrapperRect.top;
        const x2 = cRect.left + cRect.width / 2 - wrapperRect.left;
        const y2 = cRect.top - wrapperRect.top;
        const midY = (y1 + y2) / 2;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
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

// ---------- 解鎖 ----------
export function unlockSelectedNode(kind, onDone) {
  const meta = TREES[kind], id = selectedNode[kind];
  if(!id || state.gameOver) return;
  const node = meta.tree[id];
  if(node.unlocked) return;
  if(!requirementsMet(meta, node)) return;
  if(state[meta.pointsKey] < node.cost) return;

  // 若這個節點解鎖了新建築，且卡池原本沒有 → 直接把 2 張新卡放進目前牌堆
  // 這個節點解鎖的建築裡，目前卡池還沒有的 → 研發後直接各放 2 張進牌堆
  const newBuildings = (node.effects || []).filter(e => e.type === 'unlockBuilding').map(e => e.target)
    .filter(b => !availableCardPool().includes(b));

  state[meta.pointsKey] -= node.cost;
  node.unlocked = true;
  state[meta.unlockedKey].push(id);
  for(const b of newBuildings) addCardsToDeck(b, 2);

  playSound('win');
  message(`${meta.successText}：${node.name}！`, false, true);
  closeTreeModal(kind);
  if(onDone) onDone();
}
