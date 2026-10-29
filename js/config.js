// ===== 版本（集中管理）=====
// VERSION      遊戲顯示版本，只需改這一處（標題、畫面左上角、頁尾都會自動更新）
// SAVE_VERSION 存檔資料格式版本；存檔結構有不相容的變動時才 +1，並到 save.js 的 migrateSave 補遷移
export const VERSION = '0.15.1';
export const SAVE_VERSION = 6;
export const SAVE_KEY = 'cardCitySave';
export const LEGACY_SAVE_KEYS = ['cardCitySaveV9'];

export const SIZE = 12;
export const MAX_TURNS = 30;
export const HAND_LIMIT = 10;

// 地形：描述地表形狀／水系；地貌：描述地表環境／覆蓋。
export const LANDFORM_NAMES = {
  plain:'平原',
  hill:'丘陵',
  mountain:'高山',
  water:'水域'
};
export const BIOME_NAMES = {
  grassland:'草原',
  forest:'森林',
  desert:'沙漠',
  snow:'雪地',
  water:'水域',				 
  wetland:'濕地'
};
// 相容少量仍以 TERRAIN_NAMES 命名的舊 UI 文字，內容只代表地形。
export const TERRAIN_NAMES = LANDFORM_NAMES;

// ===== 產出種類（OUTPUTS）=====
// 遊戲裡所有「數值」都是這張表裡的一種，建築效果的 output 只能填這裡有的 id。
//   group:'resource'  每回合累積的資源 / 點數（stateKey = 存放在 state 的哪個欄位）
//   group:'capacity'  常駐容量（如人口上限），不是每回合累加；隨建築等級倍增
//   group:'score'     最終分數：只在遊戲結束時結算，不能拿來花用
export const OUTPUTS = {
  gold:          { label:'金幣',     icon:'◈',  group:'resource', stateKey:'gold' },
  food:          { label:'糧食',     icon:'🌾', group:'resource', stateKey:'storedFood' },
  maxFood:       { label:'存糧上限', icon:'🍞', group:'capacity' },
  culturePoints: { label:'文化點',   icon:'🎭', group:'resource', stateKey:'culturePoints' },
  techPoints:    { label:'科技點',   icon:'🔬', group:'resource', stateKey:'techPoints' },
  faithPoints:   { label:'信仰點',   icon:'⛪', group:'resource', stateKey:'faith' },
  population:    { label:'人口上限', icon:'👤', group:'capacity' },
  buildingScore: { label:'建築分',   icon:'🏛️', group:'score' },
};
// 每回合的基礎產出（沒有任何建築也會有）
export const BASE_PER_TURN = { gold:5, culturePoints:2, techPoints:2, faithPoints:2 };

//建築的稀有度與抽牌權重
export const RARITY_CONFIG = {
  common:   { name: '普通', weight: 70, color: '#a0a0a0', score: 2 },
  rare:     { name: '稀有', weight: 18, color: '#3498db', score: 3 },
  epic:     { name: '罕見', weight: 8, color: '#9b59b6', score: 5 },
  legendary:{ name: '傳說', weight: 4,  color: '#f1c40f', score: 10 },
};

// ============================================================================
//  建築（CARDS）：新增一座建築 = 在下面加一筆資料，再把 id 加進最下方的 cardPool
// ============================================================================
//  id: {
//    name:'顯示名稱', emoji:'🏠', type:'分類標籤（只是文字）',
//    cost:{ gold:4, pop:0 },               // pop = 佔用人口（建築存在期間一直佔用，拆除後歸還）
//    upkeep: 0,                            // 建築的維護費
//    landforms:['plain','hill'],           // 可蓋的地形；省略代表不限
//    biomes:['grassland','forest'],        // 可蓋的地貌；省略代表不限
//    preserveForest: true,                 // True代表蓋上去後不會移除森林
//    requiresRiver:true,                   // 必須建在有河流經過的格子旁（河流位於格子邊界）																													
//	  upgradesTo: ['academy',],             // 升級後轉化成其他建築，沒有升級路線填 null 或留空
//    effects:[ ...效果... ],                // 見下表；每個效果都是 { type, output, amount, ...專用欄位 }
//    desc:'...'                            // （選填）不寫就由 effects 自動產生說明；寫了會覆蓋自動說明
//  }
//
//  效果固定格式：{ type:'規則', output:'產出種類', amount:數值, ...專用欄位 }
//    output 可填 OUTPUTS 的 id（見上方）。持續效果的 amount 會乘上建築等級 Lv1~3；onBuild 每升一級額外觸發一次。
//    target 可填：單一建築 id、建築 id 陣列、或 'any'（任何建築）。
//
//    type               專用欄位（* 必填）              意思
//    points             —                              每回合固定產出（output 用 resource / population）
//    finalScore         —                              最終分數加成（output 用 buildingScore）
//    adjacentBuilding   target*, cap                   每座「相鄰」(周圍 8 格) 的 target 建築 +amount
//    adjacentLandform   landform*, cap                 每格「相鄰」的該地形 +amount
//    adjacentBiome      biome*, cap                    每格「相鄰」的該地貌 +amount
//    adjacentRiver      cap                            每段流經本格邊界的河流 +amount																								 
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
// farm: {
//  name:'農田', emoji:'🌾', type:'生產',rarity: 'common', 
//  cost:{ gold:3, pop:1 }, upkeep: 0, landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
//	upgradesTo: ['house'],
//  effects:[
//    { type:'points',output:'food', amount:2 },
//  ]
// },
// ============================================================================
export const cardPool = [];

export const CARDS = {
  farm: {
    name:'農田', emoji:'🌾', type:'生產',rarity: 'common', 
    cost:{ gold:2, pop:1 }, upkeep: 0, landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
	upgradesTo: ['greenhouse'],
    effects:[
      { type:'points',        output:'food', amount:1 },
	  { type:'adjacentLandform', landform:'water', output:'food', amount:1 },
      { type:'adjacentRiver', output:'food', amount:1 }
    ]
  },
  pasture: {
    name:'牧場', emoji:'🐮', type:'生產',rarity: 'common', 
    cost:{ gold:3, pop:1 }, upkeep: 1, landforms:['plain'], biomes:['grassland','forest','wetland'],
	upgradesTo: ['vineyard','apiary'],
    effects:[
      { type:'points',        output:'food', amount:1 },
	  { type:'adjacentBiome', biome:'grassland', output:'food', amount:1 },
	  { type:'adjacentBiome', biome:'grassland', output:'gold', amount:1 },
    ]
  },
  lumbermill: {
    name:'伐木場', emoji:'🪓', type:'生產',rarity: 'common', 
    cost:{ gold:3, pop:1 }, upkeep: 1, landforms:['plain','hill','mountain'], biomes:['forest'],
	upgradesTo: ['factory'], preserveForest: true,
    effects:[
      { type:'points',        output:'gold', amount:3 },
	  { type:'adjacentBiome', biome:'forest', output:'gold', amount:1 },
    ]
  },
   mine: {
    name:'礦場', emoji:'⛏️', type:'工業',rarity: 'common',
    cost:{ gold:5, pop:1 }, upkeep: 2, landforms:['hill','mountain'], biomes:['grassland','forest','snow','desert'],
    upgradesTo: ['iron_mine'],
	effects:[
      { type:'points',          output:'gold', amount:3 },
      { type:'adjacentLandform', landform:'mountain', output:'gold', amount:2 }
    ]
  },
  dock: {
    name:'碼頭', emoji:'🐟', type:'生產',rarity: 'rare',
    cost:{ gold:3, pop:1 }, upkeep: 2, landforms:['water'], biomes:['water'],
    upgradesTo: ['port'],
	effects:[
      { type:'points', output:'food', amount:2 },
	  { type:'points', output:'gold', amount:2 },
    ]
  }, 
  port : {
    name:'港口', emoji:'⚓', type:'商業',rarity: 'epic',
    cost:{ gold:5, pop:1 }, upkeep: 3, landforms:['water'], biomes:['water'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'food', amount:3 },
	  { type:'points', output:'gold', amount:3 },
	  { type:'radiusBuilding', radius:8, target:'dock' , output:'food', amount:3 },
	  { type:'radiusBuilding', radius:8, target:'dock' , output:'gold', amount:3 },
    ]
  },     
  factory: {
    name:'工廠', emoji:'🏭', type:'工業',rarity: 'epic',
    cost:{ gold:7, pop:2 }, upkeep: 5, landforms:['plain'], biomes:['grassland','forest','desert','snow'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'gold', amount:8 },
	  { type:'adjacentBuilding', target:'lumbermill', output:'gold', amount:1 },
	  { type:'adjacentBuilding', target:'mine', output:'gold', amount:2 },
	  { type:'adjacentBuilding', target:'iron_mine', output:'gold', amount:3 },
    ]
  },  
  tent: {
    name:'營地', emoji:'⛺', type:'人口',rarity: 'common',
    cost:{ gold:3, pop:0 }, upkeep: 0, landforms:['plain','hill'], biomes:['grassland','forest','desert','snow','wetland'],
	upgradesTo: ['house'],
    effects:[
      { type:'points', output:'population', amount:1 },
    ]
  },
  house: {
    name:'住宅', emoji:'🏠', type:'人口',rarity: 'common',
    cost:{ gold:5, pop:0 }, upkeep: 1, landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo: ['hospital','clinic','school'],
    effects:[
      { type:'points', output:'population', amount:3 },
	  { type:'points', output:'techPoints', amount:1 },
      { type:'points', output:'culturePoints', amount:1 },
    ]
  },
  park: {
    name:'公園', emoji:'🌳', type:'環境',rarity: 'rare',
    cost:{ gold:3, pop:0 }, upkeep: 1, landforms:['plain','hill'], biomes:['grassland','forest'],	
    upgradesTo: ['townhall','festival','sculpture_garden'],preserveForest: true,
    effects:[
		{ type:'finalScore',    output:'buildingScore',     amount:2 },
		{ type:'adjacentBuilding', target:'park', output:'culturePoints', amount:1 },
        { type:'adjacentBuilding', target:'park', output:'buildingScore', amount:2 }
	]
  },
  market: {
    name:'市場', emoji:'🏪', type:'商業',rarity: 'rare',
    cost:{ gold:5, pop:1 }, upkeep: 0, landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo: ['business_center','mint','guild_hall'],
	effects:[
      { type:'points',           output:'gold', amount:2 },
      { type:'adjacentBuilding', target:'house', output:'gold', amount:2 }
    ]
  },
  well: {
    name:'水井', emoji:'💧', type:'設施',rarity: 'rare',
    cost:{ gold:5, pop:0 }, upkeep: 3, landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo: ['watermill','aqueduct'],
	effects:[
      { type:'adjacentAura', target:['farm','pasture'], output:'food', amount:1 }
    ]
  },
  warehouse: {
    name:'糧倉', emoji:'🛢️', type:'設施',rarity: 'common',
    cost:{ gold:5, pop:0 }, upkeep: 2, landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'maxFood', amount:10 },
    ]
  },
  library: {
    name:'圖書館', emoji:'📚', type:'文化',rarity: 'rare',
    cost:{ gold:6, pop:1 }, upkeep: 3, landforms:['plain','hill','mountain'], biomes:['grassland','forest','snow','desert','wetland'],
    upgradesTo: ['academy','printing_press'],
	effects:[
      { type:'points',        output:'techPoints',    amount:2 },
      { type:'finalScore',    output:'buildingScore',     amount:1 },
      { type:'buildingCount', target:'house', min:3, output:'techPoints', amount:3 },
      { type:'buildingCount', target:'house', min:3, output:'buildingScore',  amount:3 }
    ]
  },
  windmill: {
    name:'風車', emoji:'🌬️', type:'生產',rarity: 'epic',
    cost:{ gold:6, pop:1 }, upkeep: 2, landforms:['plain','hill'], biomes:['grassland','snow','desert','wetland'],
    upgradesTo: [],
	effects:[
      { type:'points',          output:'gold', amount:2 },
      { type:'adjacentBuilding', target:'farm', output:'buildingScore', amount:2 },
	  { type:'adjacentBuilding', target:'farm', output:'food', amount:1 }
    ]
  },
  monument: {
    name:'紀念碑', emoji:'🏛️', type:'地標',rarity:'legendary',
    cost:{ gold:10, pop:0 }, upkeep: 10, landforms:['plain'], biomes:['grassland','forest','snow','desert','wetland'],
    upgradesTo: [],preserveForest: true,
	effects:[
	  { type:'onBuild', output:'buildingScore', amount:10 },
      { type:'onBuild', output:'culturePoints', amount:5 },
      { type:'onBuild', output:'techPoints',   amount:5 }
    ]
  },
  shrine: {
    name:'祠堂', emoji:'⛪', type:'信仰',rarity: 'rare',
    cost:{ gold:3, pop:1 }, upkeep: 3, landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo: ['Temple'],
	effects:[
      { type:'points',     output:'faithPoints', amount:2 },
	  { type:'onBuild', output:'culturePoints', amount:1 },
    ]
  },
  Temple: {
    name:'神殿', emoji:'⛪', type:'信仰',rarity: 'rare',
    cost:{ gold:5, pop:2 }, upkeep: 5, landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo: [],
	effects:[
      { type:'points',     output:'faithPoints', amount:4 },
	  { type:'points',     output:'culturePoints', amount:2 },
	  { type:'adjacentBiome', biome:'forest', output:'faithPoints', amount:1 },
      { type:'finalScore', output:'buildingScore',  amount:3 }
    ]
  },
  academy: {
    name:'學院', emoji:'🎓', type:'科技',rarity: 'epic',
    cost:{ gold:8, pop:2 }, upkeep: 8, landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo: ['observatory','university'],
	effects:[
		{ type:'points', output:'techPoints',    amount:3 },
		{ type:'radiusBuilding', radius:2, target:'house', output:'techPoints', amount:1 },
		{ type:'radiusBuilding', radius:3, target:'library', output:'techPoints', amount:1 },
    ]
  },
  festival: {
    name:'節慶廣場', emoji:'🎪', type:'地標',rarity:'legendary',
    cost:{ gold:8, pop:0 }, upkeep: 0, landforms:['plain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo: ['monument','theater'],preserveForest: true,
	effects:[
      { type:'onBuild', output:'gold', amount:2 },
	  { type:'onBuild', target:'any', output:'gold',          amount:3 },
      { type:'onBuild', target:'any', output:'buildingScore', amount:3 }
    ]
  },
  townhall: {
    name:'市政廳', emoji:'🏛️', type:'行政',rarity:'legendary',
    cost:{ gold:12, pop:3 }, upkeep: 10, landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo: [],
	effects:[
      { type:'uniqueTypes',    output:'culturePoints', amount:1 },
	  { type:'uniqueTypes',    output:'techPoints', amount:1 },
	  { type:'uniqueTypes',    output:'buildingScore', amount:1 },
    ]
  },
  hospital: {
    name:'醫院', emoji:'🏥', type:'公共服務',rarity:'epic',
    cost:{ gold:9, pop:1 }, upkeep: 5, landforms:['plain','hill'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'gold',       amount:2 },
	  { type:'points', output:'population', amount:3 },
      { type:'finalScore',     output:'buildingScore',  amount:2 },
      { type:'radiusBuilding', radius:2, target:['tent','house'], output:'population', amount:1, cap:3 }
    ]
  },
  watermill: {
    name:'水力磨坊', emoji:'⚙️', type:'生產',rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep: 2, landforms:['plain','hill','mountain','water'], biomes:['grassland','forest','desert','snow','wetland','water'], requiresRiver:true,
    upgradesTo: [],
	effects:[
      { type:'points', output:'food', amount:3 },
	  { type:'adjacentAura', target:['farm'], output:'food', amount:2 },
	  { type:'adjacentAura', target:['farm'], output:'gold', amount:1 },
    ]
  },
  iron_mine: {
    name:'鐵礦場', emoji:'⛏️', type:'生產',rarity:'rare',
    cost:{ gold:8, pop:2 }, upkeep: 3, landforms:['mountain'], biomes:['grassland','forest','snow','desert'],
    upgradesTo: [],
	effects:[
      { type:'points', output:'gold', amount:5 },
	  { type:'adjacentBuilding', target:['mine','iron_mine'], output:'gold', amount:3 },
    ]
  },
  business_center: {
    name:'商務中心', emoji:'🏢', type:'商業',rarity:'epic',
    cost:{ gold:10, pop:2 }, upkeep: 5, landforms:['plain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo: [],
	effects:[
      { type:'points',     output:'gold',       amount:6 },
      { type:'points',     output:'techPoints', amount:2 },
	  { type:'adjacentBuilding', target:['market','house'], output:'gold', amount:2 },
      { type:'finalScore', output:'buildingScore',  amount:3 }
    ]
  },
  greenhouse: {
    name:'溫室', emoji:'🪴', type:'生產', rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep:2, landforms:['plain'], biomes:['grassland','wetland'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'food', amount:3 },
      { type:'adjacentRiver', output:'food', amount:1 },
      { type:'finalScore', output:'buildingScore', amount:2 }
    ]
  },
  observatory: {
    name:'天文台', emoji:'🔭', type:'研究', rarity:'legendary',
    cost:{ gold:12, pop:2 }, upkeep:5, landforms:['mountain'], biomes:['snow','grassland','desert'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'techPoints', amount:4 },
      { type:'adjacentLandform', landform:'mountain', output:'techPoints', amount:1, cap:3 },
      { type:'finalScore', output:'buildingScore', amount:5 }
    ]
  },
  aqueduct: {
    name:'引水渠', emoji:'🚰', type:'公共工程', rarity:'rare',
    cost:{ gold:8, pop:1 }, upkeep:3, landforms:['plain','hill'], biomes:['grassland','forest','wetland'], requiresRiver:true,
    upgradesTo: [],
    effects:[
      { type:'points', output:'population', amount:2 },
      { type:'radiusBuilding', radius:2, target:['tent','house'], output:'population', amount:1, cap:3 },
      { type:'finalScore', output:'buildingScore', amount:2 }
    ]
  },
  printing_press: {
    name:'印刷所', emoji:'🖨️', type:'教育', rarity:'epic',
    cost:{ gold:8, pop:1 }, upkeep:3, landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'techPoints', amount:2 },
      { type:'points', output:'culturePoints', amount:1 },
      { type:'adjacentBuilding', target:'library', output:'culturePoints', amount:1 },
      { type:'finalScore', output:'buildingScore', amount:2 }
    ]
  },
  theater: {
    name:'劇院', emoji:'🎭', type:'文化', rarity:'epic',
    cost:{ gold:9, pop:1 }, upkeep:3, landforms:['plain','hill'], biomes:['grassland','forest','desert'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'culturePoints', amount:3 },
      { type:'adjacentBuilding', target:'park', output:'culturePoints', amount:1 },
      { type:'finalScore', output:'buildingScore', amount:3 }
    ]
  },
  mint: {
    name:'鑄幣所', emoji:'🪙', type:'商業', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:2, landforms:['plain','hill'], biomes:['grassland','desert'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'gold', amount:4 },
      { type:'adjacentBuilding', target:['market','guild_hall'], output:'gold', amount:1 },
      { type:'finalScore', output:'buildingScore', amount:2 }
    ]
  },
  guild_hall: {
    name:'行會會館', emoji:'🏛️', type:'商業', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:2, landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'gold', amount:2 },
      { type:'points', output:'culturePoints', amount:2 },
      { type:'adjacentBuilding', target:['house','market'], output:'gold', amount:1 },
      { type:'finalScore', output:'buildingScore', amount:2 }
    ]
  },
  clinic: {
    name:'診療所', emoji:'🩺', type:'公共服務', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:3, landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'population', amount:1 },
      { type:'radiusBuilding', radius:2, target:['tent','house'], output:'population', amount:1, cap:2 },
      { type:'finalScore', output:'buildingScore', amount:2 }
    ]
  },
  vineyard: {
    name:'葡萄園', emoji:'🍇', type:'生產', rarity:'rare',
    cost:{ gold:5, pop:1 }, upkeep:1, landforms:['plain','hill'], biomes:['grassland','desert'],
    upgradesTo: [],
    effects:[
      { type:'points', output:'food', amount:2 },
      { type:'points', output:'gold', amount:1 },
      { type:'adjacentBiome', biome:'grassland', output:'gold', amount:1 }
    ]
  },
  orchard: { name:'果園', emoji:'🍎', type:'生產', rarity:'common', cost:{gold:4,pop:1}, upkeep:1, landforms:['plain','hill'], biomes:['grassland'], upgradesTo:[], effects:[{type:'points',output:'food',amount:2},{type:'adjacentBiome',biome:'grassland',output:'food',amount:1}] },
  apiary: { name:'蜂場', emoji:'🐝', type:'生產', rarity:'rare', cost:{gold:5,pop:1}, upkeep:1, landforms:['plain','hill'], biomes:['grassland','forest'], upgradesTo:[], effects:[{type:'points',output:'food',amount:1},{type:'adjacentBiome',biome:'forest',output:'food',amount:1},{type:'finalScore',output:'buildingScore',amount:1}] },
  pottery: { name:'陶坊', emoji:'🏺', type:'工藝', rarity:'common', cost:{gold:4,pop:1}, upkeep:1, landforms:['plain','hill'], biomes:['grassland','desert'], upgradesTo:[], effects:[{type:'points',output:'gold',amount:2},{type:'adjacentBuilding',target:'market',output:'gold',amount:1}] },
  harbor: { name:'商港', emoji:'🛳️', type:'商業', rarity:'epic', cost:{gold:9,pop:2}, upkeep:4, landforms:['water'], biomes:['water'], upgradesTo:[], effects:[{type:'points',output:'gold',amount:5},{type:'radiusBuilding',radius:4,target:'dock',output:'gold',amount:2},{type:'finalScore',output:'buildingScore',amount:3}] },
  barracks: { name:'守備隊', emoji:'🛡️', type:'防衛', rarity:'rare', cost:{gold:6,pop:1}, upkeep:2, landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'], upgradesTo:[], effects:[{type:'points',output:'gold',amount:1},{type:'finalScore',output:'buildingScore',amount:3}] },
  bathhouse: { name:'公共浴場', emoji:'🛁', type:'公共服務', rarity:'rare', cost:{gold:6,pop:1}, upkeep:3, landforms:['plain'], biomes:['grassland','forest','wetland'], upgradesTo:[], effects:[{type:'points',output:'culturePoints',amount:2},{type:'radiusBuilding',radius:2,target:['house','clinic'],output:'population',amount:1,cap:2}] },
  university: { name:'大學', emoji:'🏫', type:'教育', rarity:'legendary', cost:{gold:12,pop:2}, upkeep:6, landforms:['plain','hill'], biomes:['grassland','forest','wetland'], upgradesTo:[], effects:[{type:'points',output:'techPoints',amount:4},{type:'buildingCount',target:'library',min:2,output:'culturePoints',amount:2},{type:'finalScore',output:'buildingScore',amount:4}] },
  courthouse: { name:'法院', emoji:'⚖️', type:'行政', rarity:'epic', cost:{gold:9,pop:1}, upkeep:4, landforms:['plain'], biomes:['grassland','forest','desert'], upgradesTo:[], effects:[{type:'points',output:'gold',amount:3},{type:'uniqueTypes',output:'culturePoints',amount:1},{type:'finalScore',output:'buildingScore',amount:2}] },
  sculpture_garden: { name:'雕塑公園', emoji:'🗿', type:'文化', rarity:'epic', cost:{gold:8,pop:0}, upkeep:2, landforms:['plain','hill'], biomes:['grassland','forest'], preserveForest:true, upgradesTo:[], effects:[{type:'points',output:'culturePoints',amount:2},{type:'adjacentBuilding',target:['park','theater'],output:'buildingScore',amount:2}] },
  lighthouse: { name:'燈塔', emoji:'🗼', type:'設施', rarity:'epic', cost:{gold:8,pop:1}, upkeep:3, landforms:['water'], biomes:['water'], upgradesTo:[], effects:[{type:'points',output:'gold',amount:2},{type:'adjacentRiver',output:'techPoints',amount:1},{type:'finalScore',output:'buildingScore',amount:2}] },
  bank: { name:'銀行', emoji:'🏦', type:'商業', rarity:'legendary', cost:{gold:12,pop:2}, upkeep:5, landforms:['plain'], biomes:['grassland','forest','desert'], upgradesTo:[], effects:[{type:'points',output:'gold',amount:5},{type:'adjacentBuilding',target:['market','mint','guild_hall'],output:'gold',amount:2},{type:'finalScore',output:'buildingScore',amount:4}] },
  quarry: { name:'採石場', emoji:'🪨', type:'工業', rarity:'common', cost:{gold:4,pop:1}, upkeep:1, landforms:['hill','mountain'], biomes:['grassland','forest','desert','snow'], upgradesTo:['stoneworks'], effects:[{type:'points',output:'gold',amount:2},{type:'adjacentLandform',landform:'mountain',output:'gold',amount:1}] },
  stoneworks: { name:'石材工坊', emoji:'🧱', type:'工業', rarity:'rare', cost:{gold:7,pop:1}, upkeep:2, landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'], upgradesTo:[], effects:[{type:'points',output:'gold',amount:4},{type:'adjacentBuilding',target:['quarry','mine'],output:'gold',amount:1},{type:'finalScore',output:'buildingScore',amount:2}] },
  school: { name:'學校', emoji:'🏫', type:'教育', rarity:'rare', cost:{gold:7,pop:1}, upkeep:3, landforms:['plain','hill'], biomes:['grassland','forest','desert','snow','wetland'], upgradesTo:['university'], effects:[{type:'points',output:'techPoints',amount:2},{type:'radiusBuilding',radius:2,target:'house',output:'culturePoints',amount:1}] }
  
};

// ============================================================================
//  科技樹 / 文化樹：每個節點的 effects 同樣使用固定格式
//    unlockBuilding  { type, target, mode }                         解鎖一座建築（加入卡池）
//    buildingBonus   { type, target, output, amount }               指定建築每回合固定 +amount（依建築等級倍增）
//    effectBoost     { type, target, effectType, amount }           某建築的某種效果，每單位 amount 再 +amount（例：道路的 adjacentAura 加成 +1）
//                                                                   
//	  unlockBuilding的mode:
//	  upgradeOnly ：解鎖後不加入卡池抽牌，只能由基礎建築升級改造轉職而來
//	  addPool ：解鎖後加入卡池，作為可直接從手牌打出的新建築
//	  replacePool ：解鎖後將卡池中的指定舊建築替換掉，須配合 replaces 來指定替換哪些建築
//   
//    desc: 備註欄，主要用於風味化描述 
// ============================================================================
export const TECH_TREE = {
  farming: {
    name: '農業', icon: '🌾', cost: 0, requires: [],
    desc: '掌握耕作，建立穩定的糧食來源。',
    unlocked: true,
    effects: [
      { type:'unlockBuilding', target:'farm' , mode:'addPool' },	  
    ]
  },
  fishing: {
    name: '捕魚技術', icon: '🎣', cost: 5, requires: ['farming'],
    desc: '發展近海捕撈，解鎖碼頭。',
    unlocked: false,
    effects: [	
      { type:'unlockBuilding', target:'dock' , mode:'addPool' },
    ]
  },
  Shipping: {
    name: '航運技術', icon: '🚢', cost: 15, requires: ['fishing'],
    desc: '拓展海上貿易，讓碼頭的糧食產出更高並解鎖港口。',
    unlocked: false,
    effects: [	
      { type:'unlockBuilding', target:'port' , mode:'addPool' },
	  { type:'buildingBonus',  target:'dock',  output:'food', amount:1 },	  
    ]
  },
  Breeding: {
    name: '畜牧技術', icon: '🐑', cost: 5, requires: ['farming'],
    desc: '馴養牲畜並建立牧場。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'pasture' , mode:'addPool' },
    ]
  },
  irontool: {
    name: '鐵製工具', icon: '🔨', cost: 5, requires: ['farming'],
    desc: '使用金屬工具開採礦石並加工木材。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'mine' , mode:'addPool' },
	  { type:'unlockBuilding', target:'lumbermill' , mode:'addPool' },
    ]
  },  
  writing: {
    name: '文字', icon: '📜', cost: 8, requires: ['farming'],
    desc: '記錄知識與交易，建立圖書館。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'library' , mode:'addPool' },
    ]
  },
  irrigation: {
    name: '灌溉技術', icon: '🚰', cost: 8, requires: ['farming'],
    desc: '引水灌溉農地，提升農田產量並解鎖水利設施與溫室。',
    unlocked: false,
    effects: [	  
      { type:'unlockBuilding', target:'watermill' , mode:'addPool' },
	  { type:'unlockBuilding', target:'well' , mode:'addPool' },
	  { type:'unlockBuilding', target:'greenhouse', mode:'upgradeOnly' },
      { type:'buildingBonus',  target:'farm', output:'food', amount:1 }
    ]
  },
  store: {
    name: '儲存技術', icon: '📦', cost: 12, requires: ['irrigation'],
    desc: '建造糧倉，擴大城市的糧食儲存量。',
    unlocked: false,
    effects: [	  
      { type:'unlockBuilding', target:'warehouse' , mode:'addPool' },
    ]
  },
  iron_mining: {
    name: '冶鐵術', icon: '⚒️', cost: 12, requires: ['irontool'],
    desc: '掌握熔煉與礦石加工，讓礦場能進一步發展為鐵礦場。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'iron_mine', mode:'upgradeOnly' },
      { type:'buildingBonus',  target:'mine', output:'gold', amount:2 }
    ]
  },
  urban_planning: {
    name: '都市規劃', icon: '📐', cost: 12, requires: ['engineering'],
    desc: '以道路、用地與公共設施的整體規劃支援更密集的商業聚落。',
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
    desc: '運用機械與結構知識改善水力設備，為工業化生產奠定基礎。',
    unlocked: false,
    effects: [
	  { type:'unlockBuilding', target:'windmill' , mode:'addPool' },
      { type:'buildingBonus', target:'watermill', output:'gold', amount:2 },
    ]
  },
  mechanization: {
    name: '機械化生產', icon: '⚙️', cost: 20, requires: ['engineering'],
    desc: '以機械動力取代部分人力，提升礦業與工廠的生產效率。',
    unlocked: false,
    effects: [
	  { type:'unlockBuilding', target:'factory', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['factory','mine','iron_mine'], output:'gold', amount:1 }
    ]
  },
  education: {
    name: '高等教育', icon: '🎓', cost: 22, requires: ['writing'],
    desc: '建立學院，讓知識研究成為城市發展的重要力量。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'academy', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'library', output:'techPoints', amount:1 }
    ]
  },
  astronomy: {
    name: '天文學', icon: '🔭', cost: 26, requires: ['education'],
    desc: '以精密觀測研究天體，解鎖天文台。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'observatory', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'observatory', output:'techPoints', amount:2 }
    ]
  },
  civil_engineering: {
    name: '土木工程', icon: '🏗️', cost: 22, requires: ['engineering'],
    desc: '以工程技術跨越地形引水，解鎖引水渠。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'aqueduct', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'watermill', output:'food', amount:1 }
    ]
  },
  printing_technology: {
    name: '印刷技術', icon: '🖨️', cost: 24, requires: ['education'],
    desc: '讓知識更容易複製與傳播，解鎖印刷所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'printing_press', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'library', output:'culturePoints', amount:1 }
    ]
  },
  civic_commerce: {
    name: '城市金融', icon: '🪙', cost: 24, requires: ['urban_planning'],
    desc: '建立穩定的貨幣制度，解鎖鑄幣所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'mint', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'market', output:'gold', amount:1 }
    ]
  },
  public_health: {
    name: '公共衛生', icon: '🩺', cost: 24, requires: ['education'],
    desc: '改善基礎醫療照護，解鎖診療所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'clinic', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'hospital', output:'population', amount:1 }
    ]
  },
  crop_rotation: {
    name: '輪作制度', icon: '🌱', cost: 20, requires: ['Breeding'],
    desc: '輪替作物與牧草地，提升農業糧食產量。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['farm','pasture','greenhouse','vineyard'], output:'food', amount:1 }
    ]
  },
  horticulture: {
    name: '園藝學', icon: '🍎', cost: 18, requires: ['Breeding'],
    desc: '解鎖果園並提高農作產量。', unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'orchard', mode:'addPool' },
      { type:'buildingBonus', target:'farm', output:'food', amount:1 }
    ]
  },
  beekeeping: {
    name: '養蜂術', icon: '🐝', cost: 18, requires: ['crop_rotation'],
    desc: '發展蜂場，善用森林與草地資源。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'apiary', mode:'addPool' }]
  },
  ceramics: {
    name: '陶器工藝', icon: '🏺', cost: 18, requires: ['farming'],
    desc: '解鎖陶坊，讓工藝品進入市場流通。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'pottery', mode:'addPool' }]
  },
  navigation: {
    name: '航海術', icon: '🧭', cost: 22, requires: ['Shipping'],
    desc: '改良航海技術，解鎖商港與燈塔。', unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'harbor', mode:'addPool' },
      { type:'unlockBuilding', target:'lighthouse', mode:'addPool' }
    ]
  },
  fortification: {
    name: '城防工事', icon: '🛡️', cost: 20, requires: ['writing'],
    desc: '建造守備隊以維護城市安全。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'barracks', mode:'addPool' }]
  },
  sanitation: {
    name: '公共衛生制度', icon: '🛁', cost: 22, requires: ['public_health'],
    desc: '改善城市衛生，建造公共浴場。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'bathhouse', mode:'addPool' }]
  },
  universities: {
    name: '大學制度', icon: '🏫', cost: 28, requires: ['printing_technology'],
    desc: '建立高等學府，集中發展研究與學術。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'university', mode:'addPool' }]
  },
  jurisprudence: {
    name: '法制', icon: '⚖️', cost: 22, requires: ['writing'],
    desc: '建立法院與城市治理制度。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'courthouse', mode:'addPool' }]
  },
  surveying: {
    name: '地籍測量', icon: '📏', cost: 22, requires: ['civil_engineering'],
    desc: '精確測繪城市土地，提升公共工程效率。', unlocked: false,
    effects: [{ type:'buildingBonus', target:['aqueduct','warehouse'], output:'buildingScore', amount:1 }]
  },
  banking: {
    name: '銀行制度', icon: '🏦', cost: 28, requires: ['civic_commerce'],
    desc: '建立銀行並促進商業聚落發展。', unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'bank', mode:'addPool' },
      { type:'buildingBonus', target:'mint', output:'gold', amount:1 }
    ]
  },
  masonry: {
    name: '石工技術', icon: '🧱', cost: 20, requires: ['engineering'],
    desc: '以採石與砌築技術建造耐久的石材工坊。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'stoneworks', mode:'upgradeOnly' }, { type:'unlockBuilding', target:'quarry', mode:'addPool' }]
  }
  
};

export const CULTURE_TREE = {
  tradition: {
    name: '傳統文化', icon: '🪶', cost: 0, requires: [],
    desc: '保存部落傳承與生活技藝，開啟定居發展。',
    unlocked: true,
    effects: [
        { type:'unlockBuilding', target:'tent' , mode:'addPool' },
    ]
  },
  settle: {
    name: '定居', icon: '🏘️', cost: 5, requires: ['tradition'],
    desc: '從季節性營地轉向長期聚落，形成穩定的住宅與社區。',
    unlocked: false,
    effects: [
        { type:'unlockBuilding', target:'house' , mode:'addPool' },
    ]
  },
  trading: {
    name: '貿易', icon: '🪙', cost: 8, requires: ['settle'],
    desc: '以物易物與定期市集連結聚落，促進專業分工。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'market' , mode:'addPool' },
    ]
  },
  Belief: {
    name: '信仰', icon: '🙏', cost: 8, requires: ['settle'],
    desc: '共同儀式與信念凝聚社群，並形成固定的祭祀場所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'shrine' , mode:'addPool' },
    ]
  },
  arts: {
    name: '藝術', icon: '🎨', cost: 15, requires: ['settle'],
    desc: '發展表演、工藝與記錄傳統，豐富城市的文化生活。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:'library', output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:'library', output:'buildingScore',  amount:1 }
    ]
  },
  religion: {
    name: '宗教', icon: '⛪', cost: 20, requires: ['Belief'],
    desc: '儀式制度化後，信仰中心逐漸發展為規模更大的神殿。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'Temple' , mode:'upgradeOnly' },
    ]
  },
  philosophy: {
    name: '哲學思想', icon: '🏛️', cost: 20, requires: ['arts'],
    desc: '支持思想交流與知識辯論，提升學術與信仰機構的文化影響。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['library','shrine'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['library','shrine'], output:'buildingScore',  amount:2 }
    ]
  },  
  public_gardens: {
    name: '公共事務', icon: '🌷', cost: 20, requires: ['settle'],
    desc: '規劃公共綠地與共同空間，讓居民有交流和休憩的場所。',
    unlocked: false,
    effects: [
	  { type:'unlockBuilding', target:'park' , mode:'addPool' },
	  { type:'unlockBuilding', target:'townhall' , mode:'upgradeOnly' },
      { type:'buildingBonus', target:['park','hospital'], output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:['park','hospital'], output:'buildingScore',  amount:1 }
    ]
  },
  civic_pride: {
    name: '城市認同', icon: '🏙️', cost: 20, requires: ['public_gardens'],
    desc: '共同的城市認同促進公共建設、行政組織與大型集會。',
    unlocked: false,
    effects: [
	  { type:'unlockBuilding', target:'festival', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['townhall','festival'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['townhall','festival'], output:'buildingScore',  amount:2 }
    ]
  },
  Medical: {
    name: '醫療保健', icon: '🩺', cost: 18, requires: ['religion'],
    desc: '累積醫療知識與照護制度，讓住宅或公共綠地可發展為醫療設施。',
    unlocked: false,
    effects: [
	  { type:'unlockBuilding', target:'hospital', mode:'upgradeOnly' },
    ]
  },
  civic_festivals: {
    name: '市民節慶', icon: '🎉', cost: 22, requires: ['public_gardens'],
    desc: '以公共慶典凝聚居民，建立劇院文化。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'theater', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'theater', output:'culturePoints', amount:1 }
    ]
  },
  guilds: {
    name: '工匠行會', icon: '🧵', cost: 22, requires: ['trading'],
    desc: '組織商人與工匠互助，解鎖行會會館。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'guild_hall', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['market','guild_hall'], output:'gold', amount:1 }
    ]
  },
  viticulture: {
    name: '葡萄栽培', icon: '🍇', cost: 18, requires: ['trading'],
    desc: '發展葡萄栽培與釀造傳統，解鎖葡萄園。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'vineyard', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'vineyard', output:'culturePoints', amount:1 }
    ]
  },
  patronage: {
    name: '藝術贊助', icon: '🎨', cost: 24, requires: ['civic_festivals'],
    desc: '由城市與商會支持藝文創作，提升劇院與圖書館的文化產出。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['theater','library'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['theater','library'], output:'buildingScore', amount:1 }
    ]
  },
  public_works: {
    name: '公共建設', icon: '🏗️', cost: 24, requires: ['civic_pride'],
    desc: '以公共資源改善民生設施，強化引水渠與診療所。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['aqueduct','clinic'], output:'population', amount:1 },
      { type:'buildingBonus', target:['aqueduct','clinic'], output:'buildingScore', amount:1 }
    ]
  },
  horticultural_festivals: {
    name: '園藝節慶', icon: '🌼', cost: 20, requires: ['viticulture'],
    desc: '以園藝與農產慶典凝聚居民。', unlocked: false,
    effects: [{ type:'buildingBonus', target:['orchard','vineyard'], output:'culturePoints', amount:1 }]
  },
  apiculture: {
    name: '蜂蜜文化', icon: '🍯', cost: 20, requires: ['horticultural_festivals'],
    desc: '蜂蜜成為城市飲食與節慶的一部分，提升蜂場的文化價值。', unlocked: false,
    effects: [{ type:'buildingBonus', target:'apiary', output:'culturePoints', amount:1 }]
  },
  artisan_crafts: {
    name: '工藝傳承', icon: '🧶', cost: 18, requires: ['guilds'],
    desc: '扶植陶工與工匠，提升陶坊的文化價值。', unlocked: false,
    effects: [{ type:'buildingBonus', target:'pottery', output:'culturePoints', amount:1 }]
  },
  maritime_tradition: {
    name: '海洋傳統', icon: '⚓', cost: 20, requires: ['trading'],
    desc: '發展港灣文化，提升港口聚落的文化價值。', unlocked: false,
    effects: [{ type:'buildingBonus', target:['harbor','lighthouse'], output:'culturePoints', amount:1 }]
  },
  civic_guard: {
    name: '市民守望', icon: '🛡️', cost: 20, requires: ['civic_pride'],
    desc: '居民共同維護城市秩序，提升守備隊的城市認同。', unlocked: false,
    effects: [{ type:'buildingBonus', target:'barracks', output:'culturePoints', amount:1 }]
  },
  bathing_culture: {
    name: '沐浴文化', icon: '🛁', cost: 20, requires: ['civic_pride'],
    desc: '公共浴場成為城市社交與文化生活中心。', unlocked: false,
    effects: [{ type:'buildingBonus', target:'bathhouse', output:'culturePoints', amount:1 }]
  },
  scholarship: {
    name: '學術社群', icon: '📖', cost: 22, requires: ['patronage'],
    desc: '資助學術研究與知識交流，提升大學的文化產出。', unlocked: false,
    effects: [{ type:'buildingBonus', target:'university', output:'culturePoints', amount:1 }]
  },
  public_art: {
    name: '公共藝術', icon: '🗿', cost: 22, requires: ['patronage'],
    desc: '將藝術帶入公共空間，解鎖雕塑公園。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'sculpture_garden', mode:'addPool' }]
  },
  civic_law: {
    name: '城市法規', icon: '⚖️', cost: 20, requires: ['civic_pride'],
    desc: '以共同法規保障交易與公共生活。', unlocked: false,
    effects: [{ type:'buildingBonus', target:'courthouse', output:'culturePoints', amount:1 }]
  },
  mercantile_trust: {
    name: '商業信譽', icon: '🤝', cost: 24, requires: ['guilds'],
    desc: '以信用與互信支持金融機構，提升銀行與鑄幣所的文化產出。', unlocked: false,
    effects: [{ type:'buildingBonus', target:['bank','mint'], output:'culturePoints', amount:1 }]
  },
  public_education: {
    name: '公共教育', icon: '📖', cost: 22, requires: ['arts'],
    desc: '由社群支持基礎教育，建立學校並培養更多識字與研究人才。', unlocked: false,
    effects: [{ type:'unlockBuilding', target:'school', mode:'addPool' }, { type:'buildingBonus', target:'library', output:'techPoints', amount:1 }]
  }
  
  
};

// ===== 點數消耗動態生成與研發折扣系統 =====//
// 點數消耗計算函數：
function calculateLevelCost(level) {
  if (level === 0) return 0;
  
  const baseCost = 5;   // 第 1 層的基礎消耗點數
  const stepCost = 7;   // 每往後升一級增加的點數
  
  return baseCost + (level - 1) * stepCost;
}

// 動態計算整棵樹的階級消耗與研發折扣
export function updateDynamicTreeCosts(tree, unlockedIds = []) {
  const levels = {};
  
  // 遞迴計算每個節點的深度層級 (Level)
  const getLevel = (id) => {
    if (levels[id] !== undefined) return levels[id];
    const node = tree[id];
    if (!node || !node.requires || node.requires.length === 0) return (levels[id] = 0);
    return (levels[id] = Math.max(...node.requires.map(r => getLevel(r))) + 1);
  };
  
  const unlockedCount = unlockedIds.length;
  const discountPerNode = 0.02; // 每解鎖 1 個科技/文化之折扣
  const maxDiscount = 0.60;     // 最大折扣上限
  
  let totalDiscountRate = Math.max(0, Math.min(maxDiscount, (unlockedCount - 1) * discountPerNode));
  // 套用公式與動態折扣到每個節點
  for (const id in tree) {
    const lvl = getLevel(id);
    const baseCost = calculateLevelCost(lvl);
    
    // 如果該節點尚未解鎖，套用根據解鎖數計算的折扣；已解鎖的維持原樣
    if (!tree[id].unlocked && !unlockedIds.includes(id)) {
      tree[id].cost = Math.max(1, Math.round(baseCost * (1 - totalDiscountRate)));
    } else {
      tree[id].cost = baseCost;
    }
  }
}

const initialTechs = Object.keys(TECH_TREE).filter(id => TECH_TREE[id].unlocked);
const initialCultures = Object.keys(CULTURE_TREE).filter(id => CULTURE_TREE[id].unlocked);

updateDynamicTreeCosts(TECH_TREE, initialTechs);
updateDynamicTreeCosts(CULTURE_TREE, initialCultures);

export const SHOP_ITEMS = [
  { id: 'blessing', name: '豐收祈福', emoji: '🍞', cost: 15, desc: '立即獲得 8 點存糧與 10 金幣。', effect: (state) => { state.storedFood += 8; state.gold += 10; } },
  { id: 'inspiration', name: '靈感湧現', emoji: '🔬', cost: 20, desc: '立即獲得 15 點科技點與 15 點文化點。', effect: (state) => { state.techPoints += 15; state.culturePoints += 15; } },
  { id: 'growth', name: '人口增長', emoji: '👤', cost: 25, desc: '永久增加 2 點人口上限。', effect: (state) => { state.bonusPopulation = (Number(state.bonusPopulation) || 0) + 2; } },
  { id: 'golden_age', name: '黃金盛世', emoji: '✨', cost: 30, desc: '立即獲得 30 金幣。', effect: (state) => { state.gold += 30; } }
];

export const MISSION_POOL = [
  {id:'farm2', title:'糧食保障', desc:'建造 2 座農田。', target:2, reward:6, building:'farm'},
  {id:'park2', title:'綠意盎然', desc:'建造 2 座公園。', target:2, reward:6, building:'park'},
  {id:'homes3', title:'新興社區', desc:'建造 3 座住宅。', target:3, reward:8, building:'house'},
  {id:'market2', title:'商業聚落', desc:'建造 2 座市場。', target:2, reward:7, building:'market'},
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

// ===== 遊戲失敗門檻設定 =====
// 每 10 回合檢查一次中期分數；最終回合不作為中期淘汰門檻。
export function getRequiredScoreForTurn(turn) {
  if (!Number.isInteger(turn) || turn <= 0 || turn >= MAX_TURNS || turn % 10 !== 0) return null;
  if (turn <= 20) return 20 * turn - 100;
  return 500 + (turn - 20) * 15;
}
