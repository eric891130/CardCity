// ============================================================================
//  科技 / 文化樹的排版（純計算，不碰 DOM）
// ============================================================================
//  目標：連線「只走在節點之間的空隙」，不會穿過任何節點。
//
//  做法（分層圖排版）：
//   1. 層級 = 節點深度（由 requires 算出），每一層是一欄。
//   2. 跨好幾層的連線，在中間每一欄各放一個「虛擬節點」，替那條線預留一條水平通道，
//      所以線經過中間欄時，是從節點與節點之間的縫隙穿過去的。
//   3. 欄內順序用「重心法」反覆調整，並做相鄰交換，減少連線交叉。
//   4. 垂直位置用最小平方誤差（保序）把每個節點盡量對齊它連到的節點，讓線盡量平直。
//
//  layoutTree(tree) 回傳：
//    { width, height, nodes: { id: {x,y,w,h,layer} }, edges: [{ from, to, points }] }
//    points：沿途的轉折點 [{x,y,curve}]；curve:true 表示「從上一點用平滑 S 形曲線過來」，
//            curve:false 表示「從上一點直線過來」（通過虛擬通道時）。
//  edgePath(points) 把 points 轉成 SVG path 字串。
// ============================================================================

const DEFAULTS = {
  nodeW: 176, nodeH: 54,   // 節點大小
  gapX: 84,                // 欄與欄之間（S 形曲線所在的空間）
  rowGap: 22,              // 同欄兩個節點之間的最小空隙
  laneH: 12, laneGap: 12,  // 預留給穿越連線的通道：高度、與鄰近節點的距離
  pad: 28
};

export function layoutTree(tree, options = {}) {
  const o = { ...DEFAULTS, ...options };

  // ---- 1. 層級 ----
  const level = {};
  const getLevel = id => level[id] ??= (tree[id].requires && tree[id].requires.length ? Math.max(...tree[id].requires.map(getLevel)) + 1 : 0);
  for (const id in tree) getLevel(id);
  const maxLevel = Math.max(0, ...Object.values(level));

  // ---- 2. 建立節點與虛擬通道 ----
  const layers = Array.from({ length: maxLevel + 1 }, () => []);
  const items = {};
  const addItem = (key, layer, lane) => {
    const it = { key, layer, lane, h: lane ? o.laneH : o.nodeH, up: [], down: [], idx: 0, y: 0 };
    items[key] = it; layers[layer].push(it); return it;
  };
  for (const id in tree) addItem(id, level[id], false);
  const chains = [];
  for (const id in tree) {
    for (const from of tree[id].requires || []) {
      const chain = [from];
      for (let l = level[from] + 1; l < level[id]; l++) { const k = `${from}>${id}@${l}`; addItem(k, l, true); chain.push(k); }
      chain.push(id);
      for (let i = 0; i < chain.length - 1; i++) { items[chain[i]].down.push(items[chain[i + 1]]); items[chain[i + 1]].up.push(items[chain[i]]); }
      chains.push({ from, to: id, chain });
    }
  }

  // ---- 3. 欄內排序：重心法 + 相鄰交換 ----
  const reindex = () => layers.forEach(L => L.forEach((it, i) => { it.idx = i; }));
  const crossings = () => {
    let total = 0;
    for (let l = 0; l < maxLevel; l++) {
      const segs = [];
      for (const it of layers[l]) for (const d of it.down) segs.push([it.idx, d.idx]);
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
        if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) total++;
      }
    }
    return total;
  };
  const bary = (it, nbrs) => nbrs.length ? nbrs.reduce((s, n) => s + n.idx, 0) / nbrs.length : it.idx;
  const sweep = () => {
    for (let pass = 0; pass < 24; pass++) {
      const down = pass % 2 === 0;
      const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
      for (const L of order) {
        const keyed = L.map(it => ({ it, b: bary(it, down ? it.up : it.down) }));
        keyed.sort((a, b) => a.b - b.b || a.it.idx - b.it.idx);
        keyed.forEach((k, i) => { L[i] = k.it; });
        reindex();
      }
    }
  };
  const transpose = () => {
    let improved = true, guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      for (const L of layers) for (let i = 0; i < L.length - 1; i++) {
        const before = crossings();
        [L[i], L[i + 1]] = [L[i + 1], L[i]]; reindex();
        if (crossings() < before) improved = true;
        else { [L[i], L[i + 1]] = [L[i + 1], L[i]]; reindex(); }
      }
    }
  };
  reindex();
  // 以資料順序、反向順序各試一次，取交叉較少者（兩者都是確定性的）
  const snapshot = () => layers.map(L => L.map(it => it.key));
  const restore = snap => { snap.forEach((keys, l) => { layers[l] = keys.map(k => items[k]); }); reindex(); };
  const start = snapshot();
  sweep(); transpose();
  let best = { c: crossings(), snap: snapshot() };
  restore(start.map(keys => [...keys].reverse()));
  sweep(); transpose();
  const c2 = crossings();
  if (c2 < best.c) best = { c: c2, snap: snapshot() };
  restore(best.snap);

  // ---- 4. 垂直位置 ----
  const sep = (a, b) => (a.h + b.h) / 2 + ((a.lane || b.lane) ? o.laneGap : o.rowGap);
  // 在「保持順序、保持最小間距」下，讓每個項目盡量靠近目標位置（最小平方誤差，池相鄰違規者演算法）
  const placeLayer = (L, target) => {
    const off = [0];
    for (let i = 1; i < L.length; i++) off[i] = off[i - 1] + sep(L[i - 1], L[i]);
    const blocks = [];
    for (let i = 0; i < L.length; i++) {
      blocks.push({ sum: target[i] - off[i], n: 1, start: i });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.n <= b.sum / b.n) break;
        blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, n: a.n + b.n, start: a.start });
      }
    }
    for (const b of blocks) { const z = b.sum / b.n; for (let i = b.start; i < b.start + b.n; i++) L[i].y = z + off[i]; }
  };
  layers.forEach(L => placeLayer(L, L.map((_, i) => i * (o.nodeH + o.rowGap))));
  const meanY = (list, fallback) => list.length ? list.reduce((s, n) => s + n.y, 0) / list.length : fallback;
  for (let pass = 0; pass < 16; pass++) {
    if (pass % 2 === 0) for (let l = 1; l <= maxLevel; l++) placeLayer(layers[l], layers[l].map(it => meanY(it.up, it.y)));
    else for (let l = maxLevel - 1; l >= 0; l--) placeLayer(layers[l], layers[l].map(it => meanY(it.down, it.y)));
  }
  // 最後一次同時參考上下游，讓連線更平均
  for (let l = 0; l <= maxLevel; l++) placeLayer(layers[l], layers[l].map(it => meanY([...it.up, ...it.down], it.y)));

  let top = Infinity, bottom = -Infinity;
  for (const L of layers) for (const it of L) { top = Math.min(top, it.y - it.h / 2); bottom = Math.max(bottom, it.y + it.h / 2); }
  const shift = o.pad - top;
  for (const L of layers) for (const it of L) it.y += shift;

  // ---- 5. 座標輸出 ----
  const colLeft = l => o.pad + l * (o.nodeW + o.gapX);
  const nodes = {};
  for (const id in tree) {
    const it = items[id];
    nodes[id] = { x: colLeft(it.layer), y: it.y - o.nodeH / 2, w: o.nodeW, h: o.nodeH, layer: it.layer, cy: it.y };
  }
  const edges = chains.map(({ from, to, chain }) => {
    const f = nodes[from], t = nodes[to];
    const points = [{ x: f.x + f.w, y: f.cy, curve: false }];
    for (const key of chain.slice(1, -1)) {
      const it = items[key];
      points.push({ x: colLeft(it.layer), y: it.y, curve: true });                 // 從上一點以 S 形曲線進入通道
      points.push({ x: colLeft(it.layer) + o.nodeW, y: it.y, curve: false });      // 在通道裡走直線穿過這一欄
    }
    points.push({ x: t.x, y: t.cy, curve: true });
    return { from, to, points };
  });

  return {
    width: colLeft(maxLevel) + o.nodeW + o.pad,
    height: bottom + shift + o.pad,
    nodes, edges, crossings: best.c, options: o
  };
}

// points → SVG path：curve 的段落畫水平出入的 S 形曲線，其餘畫直線
export function edgePath(points) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (b.curve) { const k = (b.x - a.x) / 2; d += ` C ${a.x + k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`; }
    else d += ` L ${b.x} ${b.y}`;
  }
  return d;
}

// 沿著連線取樣（供測試用）：回傳一串 {x,y}
export function samplePath(points, stepsPerCurve = 24) {
  const out = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (b.curve) {
      const k = (b.x - a.x) / 2, c1 = { x: a.x + k, y: a.y }, c2 = { x: b.x - k, y: b.y };
      for (let s = 1; s <= stepsPerCurve; s++) {
        const t = s / stepsPerCurve, u = 1 - t;
        out.push({
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y
        });
      }
    } else {
      for (let s = 1; s <= stepsPerCurve; s++) { const t = s / stepsPerCurve; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    }
  }
  return out;
}
