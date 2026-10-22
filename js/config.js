// ===== 版本（集中管理）=====
// VERSION      遊戲顯示版本，只需改這一處（標題、畫面左上角、頁尾都會自動更新）
// SAVE_VERSION 存檔資料格式版本；存檔結構有不相容的變動時才 +1，並到 save.js 的 migrateSave 補遷移
export const VERSION = '0.12.0';
export const SAVE_VERSION = 3;
export const SAVE_KEY = 'cardCitySave';
export const LEGACY_SAVE_KEYS = ['cardCitySaveV9'];

export const SIZE = 8;
export const MAX_TURNS = 30;
export const HAND_LIMIT = 10;

// 地形：描述地表形狀／水系；地貌：描述地表環境／覆蓋。
export const LANDFORM_NAMES = {
  plain:'平原',
  hill:'丘陵',
  mountain:'山地',
  river:'河流'
};
export const BIOME_NAMES = {
  grassland:'草原',
  forest:'森林',
  desert:'沙漠',
  snow:'雪地',
  wetland:'濕地'
};
// 相容少量仍以 TERRAIN_NAMES 命名的舊 UI 文字，內容只代表地形。
export const TERRAIN_NAMES = LANDFORM_NAMES;

// ===== 產出種類（OUTPUTS）=====
// 遊戲裡所有「數值」都是這張表裡的一種，建築效果的 output 只能填這裡有的 id。
//   group:'resource'  每回合累積的資源 / 點數（stateKey = 存放在 state 的哪個欄位）
//   group:'capacity'  常駐的容量（人口上限），不是每回合累加，也不隨建築等級成長
//   group:'score'     最終分數：只在遊戲結束時結算，不能拿來花用
export const OUTPUTS = {
  gold:          { label:'金幣',     icon:'◈',  group:'resource', stateKey:'gold' },
  food:          { label:'糧食',     icon:'🍞', group:'resource', stateKey:'storedFood' },
  culturePoints: { label:'文化點',   icon:'🎭', group:'resource', stateKey:'culturePoints' },
  techPoints:    { label:'科技點',   icon:'🔬', group:'resource', stateKey:'techPoints' },
  faithPoints:   { label:'信仰點',   icon:'⛪', group:'resource', stateKey:'faith' },
  population:    { label:'人口上限', icon:'👤', group:'capacity' },
  buildingScore: { label:'建築分',   icon:'🏛️', group:'score' },
};
// 每回合的基礎產出（沒有任何建築也會有）
export const BASE_PER_TURN = { gold:5, culturePoints:2, techPoints:2, faithPoints:2 };

//建築的稀有度與初始張數
export const RARITY_CONFIG = {
  common:   { name: '普通', count: 4, color: '#a0a0a0' },
  rare:     { name: '稀有', count: 3, color: '#3498db' },
  epic:     { name: '罕見', count: 2, color: '#9b59b6' },
  legendary:{ name: '傳說', count: 1, color: '#f1c40f' }
};

// ============================================================================
//  建築（CARDS）：新增一座建築 = 在下面加一筆資料，再把 id 加進最下方的 cardPool
// ============================================================================
//  id: {
//    name:'顯示名稱', emoji:'🏠', type:'分類標籤（只是文字）',
//    cost:{ gold:4, pop:0 },               // pop = 佔用人口（建築存在期間一直佔用，拆除後歸還）
//    landforms:['plain','hill'],           // 可蓋的地形；省略代表不限
//    biomes:['grassland','forest'],        // 可蓋的地貌；省略代表不限
//	  upgradesTo: ['academy',],                // 升級後轉化成其他建築，沒有升級路線填 null 或留空
//    effects:[ ...效果... ],               // 見下表；每個效果都是 { type, output, amount, ...專用欄位 }
//    desc:'...'                            // （選填）不寫就由 effects 自動產生說明；寫了會覆蓋自動說明
//  }
//
//  效果固定格式：{ type:'規則', output:'產出種類', amount:數值, ...專用欄位 }
//    output 可填 OUTPUTS 的 id（見上方）。amount 會乘上建築等級 Lv1~3（人口上限與 onBuild 除外）。
//    target 可填：單一建築 id、建築 id 陣列、或 'any'（任何建築）。
//
//    type               專用欄位（* 必填）              意思
//    points             —                              每回合固定產出（output 用 resource / population）
//    finalScore         —                              最終分數加成（output 用 buildingScore）
//    adjacentBuilding   target*, cap                   每座「相鄰」(周圍 8 格) 的 target 建築 +amount
//    adjacentLandform   landform*, cap                每格「相鄰」的該地形 +amount
//    adjacentBiome      biome*, cap                   每格「相鄰」的該地貌 +amount
//    radiusBuilding     radius*, target*, cap          半徑 radius 格(正方形)內每座 target 建築 +amount
//    buildingCount      target*, min*                  全城 target 建築 >= min 座時，+amount（只加一次）
//    uniqueTypes        cap                            城市裡每一種不同的建築 +amount
//    adjacentAura       target*                        對每座「相鄰」的 target 建築提供 +amount（升級後加成提高）
//    onBuild            target, cap                    建造時一次性獲得（有 target：每座相鄰的 target 算一次）
//
//    cap = 最多算幾個。output 決定計入時機：資源 / 人口每回合結算，xxxScore 只在最終計分時結算。
//
//  【目前的文化 / 科技 / 信仰效果都是「成對」的】
//    例如住宅同時有 points:culturePoints 與 finalScore:buildingScore。這是為了讓拆分機制後的數值
//    與舊版完全一致；想讓某個效果「只給點數」或「只給分數」，刪掉其中一條即可。
// ============================================================================
export const CARDS = {
  farm: {
    name:'農田', emoji:'🌾', type:'生產',rarity: 'common', 
    cost:{ gold:3, pop:1 }, landforms:['plain','hill'], biomes:['grassland','forest'],
	upgradesTo: ['house','hospital'],
    effects:[
      { type:'points',          output:'food', amount:2 },
      { type:'adjacentLandform', landform:'river', output:'food', amount:2 }
    ]
  },
  house: {
    name:'住宅', emoji:'🏠', type:'人口',rarity: 'common',
    cost:{ gold:4, pop:0 }, landforms:['plain','hill'], biomes:['grassland','forest'],
	upgradesTo: [],
    effects:[
      { type:'points',           output:'population',    amount:3 },
      { type:'points',           output:'culturePoints', amount:2 },
      { type:'finalScore',       output:'buildingScore',  amount:2 },
      { type:'adjacentBuilding', target:'park', output:'culturePoints', amount:2 },
      { type:'adjacentBuilding', target:'park', output:'buildingScore',  amount:2 }
    ]
  },
  park: {
    name:'公園', emoji:'🌳', type:'環境',rarity: 'rare',
    cost:{ gold:3, pop:1 }, landforms:['plain','hill'], biomes:['grassland','forest'],
	upgradesTo: [],
    effects:[
		{ type:'finalScore',    output:'buildingScore',     amount:2 },
	]
  },
  factory: {
    name:'工廠', emoji:'🏭', type:'工業',rarity: 'epic',
    cost:{ gold:7, pop:2 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'gold', amount:4 }
    ]
  },
  market: {
    name:'市場', emoji:'🏪', type:'商業',rarity: 'rare',
    cost:{ gold:6, pop:1 }, landforms:['plain','hill'], biomes:['grassland','forest'],
    upgradesTo: ['business_center'],
	effects:[
      { type:'points',           output:'gold', amount:2 },
      { type:'adjacentBuilding', target:'farm', output:'gold', amount:1 }
    ]
  },
  road: {
    name:'道路', emoji:'🛣️', type:'設施',rarity: 'common',
    cost:{ gold:2, pop:0 }, landforms:['plain','hill'], biomes:['grassland','forest'],
	upgradesTo: [],
    effects:[
      { type:'adjacentAura', target:['market','factory'], output:'gold', amount:1 }
    ]
  },
  well: {
    name:'水井', emoji:'⛲', type:'設施',rarity: 'rare',
    cost:{ gold:5, pop:1 }, landforms:['plain','hill'], biomes:['grassland','forest'],
    upgradesTo: [],
	effects:[
      { type:'points',           output:'gold', amount:1 },
      { type:'adjacentBuilding', target:'farm', output:'food', amount:1 }
    ]
  },
  library: {
    name:'圖書館', emoji:'📚', type:'文化',rarity: 'rare',
    cost:{ gold:8, pop:1 }, landforms:['plain','hill'], biomes:['grassland','forest'],
    upgradesTo: ['academy'],
	effects:[
      { type:'points',        output:'culturePoints', amount:2 },
      { type:'points',        output:'techPoints',    amount:2 },
      { type:'finalScore',    output:'buildingScore',     amount:2 },
      { type:'buildingCount', target:'house', min:3, output:'techPoints', amount:3 },
      { type:'buildingCount', target:'house', min:3, output:'buildingScore',  amount:3 }
    ]
  },
  windmill: {
    name:'風車', emoji:'🌬️', type:'生產',rarity: 'epic',
    cost:{ gold:6, pop:1 }, landforms:['plain','hill'], biomes:['grassland','forest'],
    upgradesTo: ['watermill'],
	effects:[
      { type:'points',          output:'gold', amount:2 },
      { type:'adjacentLandform', landform:'mountain', output:'gold', amount:2 }
    ]
  },
  monument: {
    name:'紀念碑', emoji:'🏛️', type:'地標',rarity:'legendary',
    cost:{ gold:10, pop:2 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'onBuild', output:'culturePoints', amount:5 },
      { type:'onBuild', output:'techPoints',   amount:5 }
    ]
  },
  mine: {
    name:'礦場', emoji:'⛏️', type:'工業',rarity: 'rare',
    cost:{ gold:6, pop:1 }, landforms:['mountain'], biomes:['grassland','forest','snow'],
    upgradesTo: ['iron_mine'],
	effects:[
      { type:'points',          output:'gold', amount:3 },
      { type:'adjacentLandform', landform:'mountain', output:'gold', amount:2 }
    ]
  },
  church: {
    name:'教堂', emoji:'⛪', type:'信仰',rarity: 'rare',
    cost:{ gold:8, pop:1 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'points',     output:'faithPoints', amount:3 },
      { type:'finalScore', output:'buildingScore',  amount:3 }
    ]
  },
  bakery: {
    name:'麵包坊', emoji:'🥐', type:'商業',rarity: 'rare',
    cost:{ gold:5, pop:1 }, landforms:['plain','hill'], biomes:['grassland','forest'],
    upgradesTo: [],
	effects:[
      { type:'points',  output:'gold', amount:1 },
      { type:'onBuild', target:'farm', output:'gold', amount:3 }
    ]
  },
  academy: {
    name:'學院', emoji:'🎓', type:'科技',rarity: 'epic',
    cost:{ gold:9, pop:1 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'uniqueTypes', output:'techPoints', amount:1, cap:6 },
      { type:'uniqueTypes', output:'buildingScore',  amount:1, cap:6 }
    ]
  },
  festival: {
    name:'節慶廣場', emoji:'🎪', type:'地標',rarity:'legendary',
    cost:{ gold:8, pop:1 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'onBuild', output:'gold', amount:2 },
      { type:'onBuild', target:'any', output:'buildingScore', amount:2 }
    ]
  },
  townhall: {
    name:'市政廳', emoji:'🏛️', type:'行政',rarity:'legendary',
    cost:{ gold:12, pop:2 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'points',         output:'culturePoints', amount:4 },
      { type:'finalScore',     output:'buildingScore',  amount:4 },
      { type:'radiusBuilding', radius:2, target:'house', output:'culturePoints', amount:1 },
      { type:'radiusBuilding', radius:2, target:'house', output:'buildingScore',  amount:1 }
    ]
  },
  hospital: {
    name:'醫院', emoji:'🏥', type:'公共服務',rarity:'epic',
    cost:{ gold:9, pop:1 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'points',         output:'culturePoints', amount:2 },
      { type:'finalScore',     output:'buildingScore',  amount:2 },
      { type:'radiusBuilding', radius:2, target:'house', output:'population', amount:1, cap:3 }
    ]
  },
  watermill: {
    name:'水力磨坊', emoji:'⚙️', type:'科技解鎖',rarity:'rare',
    cost:{ gold:6, pop:1 }, landforms:['river'], biomes:['wetland'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'food', amount:3 },
      { type:'points', output:'gold', amount:2 }
    ]
  },
  iron_mine: {
    name:'鐵礦場', emoji:'⛏️', type:'科技解鎖',rarity:'rare',
    cost:{ gold:8, pop:2 }, landforms:['mountain'], biomes:['grassland','forest','snow'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'gold', amount:5 }
    ]
  },
  business_center: {
    name:'商務中心', emoji:'🏢', type:'科技解鎖',rarity:'epic',
    cost:{ gold:10, pop:2 }, landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
	effects:[
      { type:'points',     output:'gold',          amount:6 },
      { type:'points',     output:'culturePoints', amount:2 },
      { type:'finalScore', output:'buildingScore',  amount:2 }
    ]
  }
};

// ============================================================================
//  科技樹 / 文化樹：每個節點的 effects 同樣使用固定格式
//    unlockBuilding  { type, target, mode }                         解鎖一座建築（加入卡池）
//    buildingBonus   { type, target, output, amount }               指定建築每回合固定 +amount（不隨等級成長）
//    effectBoost     { type, target, effectType, amount }           某建築的某種效果，每單位 amount 再 +amount（例：道路的 adjacentAura 加成 +1）
//                                                                   
//	  unlockBuilding的mode:
//	  upgradeOnly ：解鎖後不加入卡池抽牌，只能由基礎建築升級改造轉職而來
//	  addPool ：解鎖後加入卡池，作為可直接從手牌打出的新建築
//	  replacePool ：解鎖後將卡池中的指定舊建築替換掉，須配合 replaces 來指定替換哪些建築
//   
//
// ============================================================================
export const TECH_TREE = {
  irrigation: {
    name: '灌溉技術', icon: '💧', cost: 8, requires: [],
    desc: '解鎖【水力磨坊】；所有農田每回合額外產出 1 糧食。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'watermill' , mode:'addPool' },
      { type:'buildingBonus',  target:'farm', output:'food', amount:1 }
    ]
  },
  iron_mining: {
    name: '冶鐵術', icon: '⚒️', cost: 12, requires: ['irrigation'],
    desc: '解鎖【鐵礦場】；所有礦場每回合額外產出 2 金幣。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'iron_mine', mode:'upgradeOnly' },
      { type:'buildingBonus',  target:'mine', output:'gold', amount:2 }
    ]
  },
  urban_planning: {
    name: '都市規劃', icon: '📐', cost: 12, requires: ['irrigation'],
    desc: '解鎖【商務中心】；所有住宅每回合額外 +1 文化點、最終文化分 +1，市場每回合額外 +1 金幣。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'business_center', mode:'upgradeOnly' },
      { type:'buildingBonus',  target:'house',  output:'culturePoints', amount:1 },
      { type:'buildingBonus',  target:'house',  output:'buildingScore',  amount:1 },
      { type:'buildingBonus',  target:'market', output:'gold',          amount:1 }
    ]
  },
  engineering: {
    name: '工程學', icon: '🛠️', cost: 16, requires: ['iron_mining'],
    desc: '工廠每回合額外產出 2 金幣；道路對相鄰市場與工廠的加成提高至每條道路 +2 金幣。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:'factory', output:'gold', amount:2 },
      { type:'effectBoost',   target:'road', effectType:'adjacentAura', amount:1 }
    ]
  },
  mechanization: {
    name: '機械化生產', icon: '⚙️', cost: 20, requires: ['iron_mining', 'urban_planning'],
    desc: '所有工廠與礦場每回合額外產出 1 金幣。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['factory','mine','iron_mine'], output:'gold', amount:1 }
    ]
  }
};

export const CULTURE_TREE = {
  tradition: {
    name: '傳統文化', icon: '📜', cost: 10, requires: [],
    desc: '所有住宅每回合額外 +1 文化點、最終文化分 +1。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:'house', output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:'house', output:'buildingScore',  amount:1 }
    ]
  },
  arts: {
    name: '文藝復興', icon: '🎨', cost: 15, requires: ['tradition'],
    desc: '所有公園每回合額外 +1 文化點、最終文化分 +1。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:'park', output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:'park', output:'buildingScore',  amount:1 }
    ]
  },
  philosophy: {
    name: '哲學思想', icon: '🏛️', cost: 20, requires: ['tradition'],
    desc: '所有圖書館與教堂每回合額外 +2 文化點、最終文化分 +2。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['library','church'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['library','church'], output:'buildingScore',  amount:2 }
    ]
  },
  public_gardens: {
    name: '公共花園', icon: '🌷', cost: 18, requires: ['arts'],
    desc: '所有公園與醫院每回合額外 +1 文化點、最終文化分 +1。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['park','hospital'], output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:['park','hospital'], output:'buildingScore',  amount:1 }
    ]
  },
  civic_pride: {
    name: '城市認同', icon: '🏙️', cost: 16, requires: ['tradition'],
    desc: '市政廳與節慶廣場每回合額外 +2 文化點、最終文化分 +2。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['townhall','festival'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['townhall','festival'], output:'buildingScore',  amount:2 }
    ]
  }
};

export const SHOP_ITEMS = [
  { id: 'blessing', name: '豐收祈福', emoji: '🍞', cost: 15, desc: '立即獲得 8 點存糧與 10 金幣。', effect: (state) => { state.storedFood += 8; state.gold += 10; } },
  { id: 'inspiration', name: '靈感湧現', emoji: '🔬', cost: 20, desc: '立即獲得 15 點科技點與 15 點文化點。', effect: (state) => { state.techPoints += 15; state.culturePoints += 15; } },
  { id: 'growth', name: '人口增長', emoji: '👤', cost: 25, desc: '永久增加 2 點人口上限。', effect: (state) => { state.basePopulation += 2; } },
  { id: 'golden_age', name: '黃金盛世', emoji: '✨', cost: 30, desc: '立即獲得 30 金幣。', effect: (state) => { state.gold += 30; } }
];

export const MISSION_POOL = [
  {id:'farm2', title:'糧食保障', desc:'建造 2 座農田。', target:2, reward:6, building:'farm'},
  {id:'park2', title:'綠意盎然', desc:'建造 2 座公園。', target:2, reward:6, building:'park'},
  {id:'homes3', title:'新興社區', desc:'建造 3 座住宅。', target:3, reward:8, building:'house'},
  {id:'market2', title:'商業聚落', desc:'建造 2 座市場。', target:2, reward:7, building:'market'},
  {id:'road3', title:'四通八達', desc:'建造 3 條道路。', target:3, reward:5, building:'road'},
  {id:'factory1', title:'工業起步', desc:'建造 1 座工廠。', target:1, reward:10, building:'factory'},
  {id:'mine2', title:'開採資源', desc:'建造 2 座礦場。', target:2, reward:9, building:'mine'},
  {id:'variety5', title:'多元城市', desc:'建造至少 5 種不同類型的建築。', target:5, reward:10, building:'__variety__'}
];

export const EVENT_POOL = [
  { id: 'harvest', title: '豐收祭', desc: '今年風調雨順，民心歡欣！獲得 10 金幣與 5 點存糧。', effect: (s) => { s.gold += 10; s.storedFood += 5; } },
  { id: 'drought', title: '大旱災', desc: '氣候乾旱導致水源吃緊，存糧消耗 5 點。', effect: (s) => { s.storedFood = Math.max(0, s.storedFood - 5); } },
  { id: 'boom', title: '貿易繁榮', desc: '商隊帶來了遠方的特產與資金，獲得 15 金幣。', effect: (s) => { s.gold += 15; } },
  { id: 'storm', title: '暴風雨', desc: '強風吹襲城市，修繕設施花費了 8 金幣。', effect: (s) => { s.gold = Math.max(0, s.gold - 8); } }
];

export const cardPool = ['farm','house','park','factory','market','road','well','library','windmill','monument','mine','church','bakery','academy','festival','townhall','hospital'];

// ===== 遊戲失敗門檻設定 =====
export const TURN_SCORE_MILESTONES = {
  10: 200,   // 第 10 回合結束時
  20: 500  
};