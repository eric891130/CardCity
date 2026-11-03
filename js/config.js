// ===== 版本（集中管理）=====
// VERSION      遊戲顯示版本，只需改這一處（標題、畫面左上角、頁尾都會自動更新）
// 存檔不跨版本：存檔只有在 VERSION 與寫入時完全相同才讀得進來（見 save.js），所以不需要另外維護存檔格式版本。
export const VERSION = '0.16.0';
export const SAVE_KEY = 'cardCitySave';

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
  wonder:   { name: '奇觀', weight: 0,  color: '#ff7b54', score: 20 },
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
//    buildTurns:3,                         // 僅奇觀使用：需要幾個回合完成施工
//	  upgradesTo: ['academy',],             // 升級後轉化成其他建築，沒有升級路線填 null 或留空
//    effects:[ ...效果... ],                // 見下表；每個效果都是 { type, output, amount, ...專用欄位 }
//    desc:'...'                            // （選填）不寫就由 effects 自動產生說明；寫了會覆蓋自動說明
//  }
//
//  效果固定格式：{ type:'規則', output:'產出種類', amount:數值, ...專用欄位 }
//    output 可填 OUTPUTS 的 id（見上方）。持續效果的 amount 會乘上建築等級 Lv1~3；
//    onBuild 只在「新蓋出這座建築」或「改造成這座建築」時觸發一次；同卡升級（Lv1→Lv2→Lv3）不會再觸發。
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
//    adjacentAura       target*                        對每座「相鄰」的 target 建築提供 +amount（升級後加成提高）；amount 填負數 = 汙染
//    adjacentVariety    target, targetType, by, cap    相鄰建築裡每有一「種」不同的 +amount；by:'type' 改成以建築類型計算（多樣性鄰接）
//    adjacentSame       cap                            每座相鄰的「同類」建築 +amount；填負數 = 擁擠懲罰
//    adjacentEmpty      cap                            每格相鄰的空地（沒有建築的陸地）+amount（需要留白的建築）
//    onBuild            target, cap                    建造時一次性獲得（有 target：每座相鄰的 target 算一次）
//
//    cap = 最多算幾個。output 決定計入時機：資源 / 人口每回合結算，xxxScore 只在最終計分時結算。
//    amount 填負數 = 負面效果（只有鄰接 / 光環類可以；科技 / 文化 / 信仰點結算時最低扣到 0）。
//
//  【改造規則（由 js/balance.js 檢查）】
//    Lv.3 的建築可以改造成 upgradesTo 裡的建築。改造目標 Lv.1 的「基礎數值」必須 >= 來源 Lv.3 的 1.2 倍；
//    基礎數值 = 固定產出 + 最終分數 + 一次性效果攤提 − 維護費（條件效果不算）。
//    調整任何建築數值後，執行 node tools/check.mjs 就會列出不符合規則的路線。
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

  // ===== 生產與食物 =====
  farm: {
    name:'農田', emoji:'🌾', type:'生產', rarity:'common',
    cost:{ gold:2, pop:1 }, upkeep:0,
    landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
    upgradesTo:['greenhouse'],
    effects:[
      { type:'points', output:'food', amount:1 },
      { type:'adjacentLandform', landform:'water', output:'food', amount:1 },
      { type:'adjacentRiver', output:'food', amount:1 }
    ]
  },
  pasture: {
    name:'牧場', emoji:'🐮', type:'生產', rarity:'common',
    cost:{ gold:3, pop:1 }, upkeep:1,
    landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo:['vineyard','apiary'],
    effects:[
      { type:'points', output:'food', amount:1 },
      { type:'points', output:'gold', amount:1 },
      { type:'adjacentBiome', biome:'grassland', output:'food', amount:1 }
    ]
  },
  lumbermill: {
    name:'伐木場', emoji:'🪓', type:'生產', rarity:'common',
    cost:{ gold:3, pop:1 }, upkeep:1,
    landforms:['plain','hill','mountain'], biomes:['forest'], preserveForest:true,
    upgradesTo:['factory'],
    effects:[
      { type:'points', output:'gold', amount:2 },
      { type:'adjacentBiome', biome:'forest', output:'gold', amount:1 }
    ]
  },
  mine: {
    name:'礦場', emoji:'⛏️', type:'工業', rarity:'common',
    cost:{ gold:5, pop:1 }, upkeep:2,
    landforms:['hill','mountain'], biomes:['grassland','forest','snow','desert'],
    upgradesTo:['iron_mine'],
    effects:[
      { type:'points', output:'gold', amount:3 },
      { type:'adjacentLandform', landform:'mountain', output:'gold', amount:2 }
    ]
  },
  dock: {
    name:'碼頭', emoji:'🐟', type:'生產', rarity:'rare',
    cost:{ gold:3, pop:1 }, upkeep:2,
    landforms:['water'], biomes:['water'],
    upgradesTo:['port','shipyard'],
    effects:[
      { type:'points', output:'food', amount:2 },
      { type:'points', output:'gold', amount:2 }
    ]
  },
  port: {
    name:'港口', emoji:'⚓', type:'商業', rarity:'epic',
    cost:{ gold:5, pop:1 }, upkeep:3,
    landforms:['water'], biomes:['water'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'food', amount:5 },
      { type:'points', output:'gold', amount:5 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'radiusBuilding', target:'dock', radius:8, output:'food', amount:2 },
      { type:'radiusBuilding', target:'dock', radius:8, output:'gold', amount:2 }
    ]
  },
  // 負面鄰接（汙染）：工廠讓每座相鄰的住宅 -1 文化。
  factory: {
    name:'工廠', emoji:'🏭', type:'工業', rarity:'epic',
    cost:{ gold:7, pop:2 }, upkeep:5,
    landforms:['plain'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:9 },
      { type:'adjacentBuilding', target:'lumbermill', output:'gold', amount:1 },
      { type:'adjacentBuilding', target:'mine', output:'gold', amount:2 },
      { type:'adjacentBuilding', target:'iron_mine', output:'gold', amount:3 },
      { type:'adjacentAura', target:'house', output:'culturePoints', amount:-1 }
    ]
  },

  // ===== 人口與住宅 =====
  tent: {
    name:'營地', emoji:'⛺', type:'人口', rarity:'common',
    cost:{ gold:3, pop:0 }, upkeep:0,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:['house'],
    effects:[
      { type:'points', output:'population', amount:1 }
    ]
  },
  // 負面鄰接（擁擠）：每座相鄰的住宅 -1 金幣（最多 3 座），所以住宅不要堆成一團。
  house: {
    name:'住宅', emoji:'🏠', type:'人口', rarity:'common',
    cost:{ gold:5, pop:0 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:['hospital','clinic','school'],
    effects:[
      { type:'points', output:'population', amount:2 },
      { type:'points', output:'techPoints', amount:1 },
      { type:'points', output:'culturePoints', amount:1 },
      { type:'adjacentSame', output:'gold', amount:-1, cap:3 }
    ]
  },

  // ===== 環境、地標與行政 =====
  // 新增改造路線：公園 → 劇院（原本是節慶廣場 → 劇院；改成一階，避免節慶廣場之後的數值過高）。
  park: {
    name:'公園', emoji:'🌳', type:'環境', rarity:'rare',
    cost:{ gold:3, pop:0 }, upkeep:1,
    landforms:['plain','hill'], biomes:['grassland','forest'], preserveForest:true,
    upgradesTo:['townhall','festival','sculpture_garden','theater'],
    effects:[
      { type:'points', output:'culturePoints', amount:1 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'adjacentBuilding', target:'park', output:'culturePoints', amount:1 },
      { type:'adjacentBuilding', target:'park', output:'buildingScore', amount:2 }
    ]
  },

  // ===== 商業 =====
  // 多樣性鄰接：相鄰的建築每多一「種」不同的 +1 金幣（最多 4 種）；住宅加成降為 +1（最多 3 座）。
  market: {
    name:'市場', emoji:'🏪', type:'商業', rarity:'rare',
    cost:{ gold:5, pop:1 }, upkeep:0,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:['business_center','mint','guild_hall'],
    effects:[
      { type:'points', output:'gold', amount:2 },
      { type:'adjacentBuilding', target:'house', output:'gold', amount:1, cap:3 },
      { type:'adjacentVariety', output:'gold', amount:1, cap:4 }
    ]
  },
  well: {
    name:'水井', emoji:'💧', type:'設施', rarity:'rare',
    cost:{ gold:5, pop:0 }, upkeep:1,
    landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo:['watermill','aqueduct'],
    effects:[
      { type:'points', output:'food', amount:1 },
      { type:'points', output:'maxFood', amount:10 },
      { type:'adjacentAura', target:['farm','pasture','orchard'], output:'food', amount:1 }
    ]
  },
  warehouse: {
    name:'糧倉', emoji:'🛢️', type:'設施', rarity:'common',
    cost:{ gold:5, pop:0 }, upkeep:1,
    landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'maxFood', amount:15 },
      { type:'points', output:'food', amount:1 }
    ]
  },

  // ===== 文化、科技與信仰 =====
  // 聚落加成：每座相鄰的圖書館 +1 科技（最多 2 座），鼓勵蓋成「圖書館區」。
  library: {
    name:'圖書館', emoji:'📚', type:'文化', rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep:2,
    landforms:['plain','hill','mountain'], biomes:['grassland','forest','snow','desert','wetland'],
    upgradesTo:['academy','printing_press'],
    effects:[
      { type:'points', output:'techPoints', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:1 },
      { type:'buildingCount', target:'house', min:3, output:'techPoints', amount:1 },
      { type:'buildingCount', target:'house', min:3, output:'buildingScore', amount:2 },
      { type:'adjacentSame', output:'techPoints', amount:1, cap:2 }
    ]
  },
  // 空地加成：風車需要開闊的風，每格相鄰空地 +1 金幣（最多 3 格）。
  windmill: {
    name:'風車', emoji:'🌬️', type:'生產', rarity:'epic',
    cost:{ gold:6, pop:1 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','snow','desert','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:3 },
      { type:'points', output:'food', amount:1 },
      { type:'adjacentBuilding', target:'farm', output:'buildingScore', amount:2 },
      { type:'adjacentBuilding', target:'farm', output:'food', amount:1 },
      { type:'adjacentEmpty', output:'gold', amount:1, cap:3 }
    ]
  },
  // 維護費從 10 降到 2，並有固定產出：以前它只有一次性獎勵，卻要每回合付 10 維護費。
  monument: {
    name:'紀念碑', emoji:'🏛️', type:'地標', rarity:'legendary',
    cost:{ gold:10, pop:0 }, upkeep:2,
    landforms:['plain'], biomes:['grassland','forest','snow','desert','wetland'], preserveForest:true,
    upgradesTo:[],
    effects:[
      { type:'points', output:'culturePoints', amount:7 },
      { type:'points', output:'techPoints', amount:4 },
      { type:'finalScore', output:'buildingScore', amount:6 },
      { type:'onBuild', output:'buildingScore', amount:10 },
      { type:'onBuild', output:'culturePoints', amount:5 },
      { type:'onBuild', output:'techPoints', amount:5 }
    ]
  },
  shrine: {
    name:'祠堂', emoji:'⛪', type:'信仰', rarity:'rare',
    cost:{ gold:3, pop:1 }, upkeep:1,
    landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:['Temple'],
    effects:[
      { type:'points', output:'faithPoints', amount:2 },
      { type:'onBuild', output:'culturePoints', amount:1 }
    ]
  },
  // 空地加成：神殿需要肅穆的空間，每格相鄰空地 +1 信仰（最多 3 格）。
  Temple: {
    name:'神殿', emoji:'⛪', type:'信仰', rarity:'rare',
    cost:{ gold:5, pop:2 }, upkeep:3,
    landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:['monastery','cathedral'],
    effects:[
      { type:'points', output:'faithPoints', amount:4 },
      { type:'points', output:'culturePoints', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'adjacentBiome', biome:'forest', output:'faithPoints', amount:1 },
      { type:'adjacentEmpty', output:'faithPoints', amount:1, cap:3 }
    ]
  },
  academy: {
    name:'學院', emoji:'🎓', type:'科技', rarity:'epic',
    cost:{ gold:8, pop:2 }, upkeep:4,
    landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:['observatory','university'],
    effects:[
      { type:'points', output:'techPoints', amount:6 },
      { type:'radiusBuilding', target:'house', radius:2, output:'techPoints', amount:1 },
      { type:'radiusBuilding', target:'library', radius:3, output:'techPoints', amount:1 }
    ]
  },
  // 改造成節慶廣場時才會領到「建造時一次性獲得」；另外空地 / 多樣性鄰接讓它適合蓋在開闊、混搭的地方。
  festival: {
    name:'節慶廣場', emoji:'🎪', type:'地標', rarity:'legendary',
    cost:{ gold:8, pop:0 }, upkeep:0,
    landforms:['plain'], biomes:['grassland','forest','desert','snow','wetland'], preserveForest:true,
    upgradesTo:['monument'],
    effects:[
      { type:'points', output:'culturePoints', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'onBuild', output:'gold', amount:2 },
      { type:'onBuild', target:'any', output:'gold', amount:3 },
      { type:'onBuild', target:'any', output:'buildingScore', amount:3 },
      { type:'adjacentEmpty', output:'culturePoints', amount:1, cap:4 },
      { type:'adjacentVariety', by:'type', output:'gold', amount:1, cap:4 }
    ]
  },
  townhall: {
    name:'市政廳', emoji:'🏛️', type:'行政', rarity:'legendary',
    cost:{ gold:12, pop:3 }, upkeep:6,
    landforms:['plain','hill','mountain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'culturePoints', amount:4 },
      { type:'points', output:'techPoints', amount:3 },
      { type:'uniqueTypes', output:'culturePoints', amount:1, cap:8 },
      { type:'uniqueTypes', output:'techPoints', amount:1, cap:8 },
      { type:'uniqueTypes', output:'buildingScore', amount:1, cap:8 }
    ]
  },
  hospital: {
    name:'醫院', emoji:'🏥', type:'公共服務', rarity:'epic',
    cost:{ gold:9, pop:1 }, upkeep:3,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:7 },
      { type:'points', output:'population', amount:6 },
      { type:'finalScore', output:'buildingScore', amount:4 },
      { type:'radiusBuilding', target:['tent','house'], radius:2, output:'population', amount:1, cap:3 }
    ]
  },
  watermill: {
    name:'水力磨坊', emoji:'⚙️', type:'生產', rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep:2,
    landforms:['plain','hill','mountain','water'], biomes:['grassland','forest','desert','snow','wetland','water'], requiresRiver:true,
    upgradesTo:[],
    effects:[
      { type:'points', output:'food', amount:5 },
      { type:'points', output:'gold', amount:1 },
      { type:'adjacentAura', target:'farm', output:'food', amount:2 },
      { type:'adjacentAura', target:'farm', output:'gold', amount:1 }
    ]
  },
  // 負面鄰接（汙染）：鐵礦場讓每座相鄰的農田 -1 糧食。
  iron_mine: {
    name:'鐵礦場', emoji:'⛏️', type:'生產', rarity:'rare',
    cost:{ gold:8, pop:2 }, upkeep:3,
    landforms:['mountain'], biomes:['grassland','forest','snow','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:7 },
      { type:'adjacentBuilding', target:['mine','iron_mine'], output:'gold', amount:3 },
      { type:'adjacentAura', target:'farm', output:'food', amount:-1 }
    ]
  },
  business_center: {
    name:'商務中心', emoji:'🏢', type:'商業', rarity:'epic',
    cost:{ gold:10, pop:2 }, upkeep:4,
    landforms:['plain'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:8 },
      { type:'points', output:'techPoints', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'adjacentBuilding', target:['market','house'], output:'gold', amount:1 },
      { type:'adjacentVariety', by:'type', output:'gold', amount:1, cap:3 }
    ]
  },
  // 空地加成：溫室需要採光空間，每格相鄰空地 +1 糧食（最多 3 格）。
  greenhouse: {
    name:'溫室', emoji:'🪴', type:'生產', rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep:2,
    landforms:['plain'], biomes:['grassland','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'food', amount:5 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'adjacentRiver', output:'food', amount:1 },
      { type:'adjacentEmpty', output:'food', amount:1, cap:3 }
    ]
  },
  observatory: {
    name:'天文台', emoji:'🔭', type:'研究', rarity:'legendary',
    cost:{ gold:12, pop:2 }, upkeep:4,
    landforms:['mountain'], biomes:['snow','grassland','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'techPoints', amount:14 },
      { type:'finalScore', output:'buildingScore', amount:5 },
      { type:'adjacentLandform', landform:'mountain', output:'techPoints', amount:1, cap:3 }
    ]
  },
  aqueduct: {
    name:'引水渠', emoji:'🚰', type:'公共工程', rarity:'rare',
    cost:{ gold:8, pop:1 }, upkeep:3,
    landforms:['plain','hill'], biomes:['grassland','forest','wetland'], requiresRiver:true,
    upgradesTo:[],
    effects:[
      { type:'points', output:'population', amount:5 },
      { type:'points', output:'food', amount:2 },
      { type:'points', output:'gold', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'radiusBuilding', target:['tent','house'], radius:2, output:'population', amount:1, cap:3 }
    ]
  },
  printing_press: {
    name:'印刷所', emoji:'🖨️', type:'教育', rarity:'epic',
    cost:{ gold:8, pop:1 }, upkeep:3,
    landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'techPoints', amount:3 },
      { type:'points', output:'culturePoints', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'adjacentBuilding', target:'library', output:'culturePoints', amount:1 }
    ]
  },
  theater: {
    name:'劇院', emoji:'🎭', type:'文化', rarity:'epic',
    cost:{ gold:9, pop:1 }, upkeep:3,
    landforms:['plain','hill'], biomes:['grassland','forest','desert'],
    upgradesTo:['colosseum'],
    effects:[
      { type:'points', output:'culturePoints', amount:5 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'adjacentBuilding', target:'park', output:'culturePoints', amount:1 }
    ]
  },
  mint: {
    name:'鑄幣所', emoji:'🪙', type:'商業', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:9 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'adjacentBuilding', target:['market','guild_hall'], output:'gold', amount:1 }
    ]
  },
  guild_hall: {
    name:'行會會館', emoji:'🏛️', type:'商業', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:2,
    landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:4 },
      { type:'points', output:'culturePoints', amount:3 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'adjacentBuilding', target:['house','market'], output:'gold', amount:1 },
      { type:'adjacentVariety', by:'type', output:'culturePoints', amount:1, cap:4 }
    ]
  },
  clinic: {
    name:'診療所', emoji:'🩺', type:'公共服務', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'population', amount:4 },
      { type:'points', output:'gold', amount:5 },
      { type:'points', output:'techPoints', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'radiusBuilding', target:['tent','house'], radius:2, output:'population', amount:1, cap:2 }
    ]
  },
  vineyard: {
    name:'葡萄園', emoji:'🍇', type:'生產', rarity:'rare',
    cost:{ gold:5, pop:1 }, upkeep:1,
    landforms:['plain','hill'], biomes:['grassland','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'food', amount:3 },
      { type:'points', output:'gold', amount:2 },
      { type:'adjacentBiome', biome:'grassland', output:'gold', amount:1 }
    ]
  },
  orchard: {
    name:'果園', emoji:'🍎', type:'生產', rarity:'common',
    cost:{ gold:4, pop:1 }, upkeep:1,
    landforms:['plain','hill'], biomes:['grassland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'food', amount:2 },
      { type:'adjacentBiome', biome:'grassland', output:'food', amount:1 }
    ]
  },
  // 多樣性鄰接：相鄰的作物 / 牧場種類越多，授粉越好，每種 +1 糧食（最多 3 種）。
  apiary: {
    name:'蜂場', emoji:'🐝', type:'生產', rarity:'rare',
    cost:{ gold:5, pop:1 }, upkeep:1,
    landforms:['plain','hill'], biomes:['grassland','forest'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'food', amount:3 },
      { type:'points', output:'gold', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'adjacentBiome', biome:'forest', output:'food', amount:1 },
      { type:'adjacentVariety', target:['farm','pasture','orchard','vineyard','greenhouse'], output:'food', amount:1, cap:3 }
    ]
  },
  pottery: {
    name:'陶坊', emoji:'🏺', type:'工藝', rarity:'common',
    cost:{ gold:4, pop:1 }, upkeep:1,
    landforms:['plain','hill'], biomes:['grassland','desert'],
    upgradesTo:['glassworks'],
    effects:[
      { type:'points', output:'gold', amount:2 },
      { type:'adjacentBuilding', target:'market', output:'gold', amount:1 }
    ]
  },
  harbor: {
    name:'商港', emoji:'🛳️', type:'商業', rarity:'epic',
    cost:{ gold:9, pop:2 }, upkeep:4,
    landforms:['water'], biomes:['water'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:5 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'radiusBuilding', target:'dock', radius:4, output:'gold', amount:2 }
    ]
  },
  barracks: {
    name:'守備隊', emoji:'🛡️', type:'防衛', rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:4 }
    ]
  },
  bathhouse: {
    name:'公共浴場', emoji:'🛁', type:'公共服務', rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep:2,
    landforms:['plain'], biomes:['grassland','forest','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'culturePoints', amount:2 },
      { type:'points', output:'gold', amount:1 },
      { type:'radiusBuilding', target:['house','clinic'], radius:2, output:'population', amount:1, cap:2 }
    ]
  },
  university: {
    name:'大學', emoji:'🏫', type:'教育', rarity:'legendary',
    cost:{ gold:12, pop:2 }, upkeep:6,
    landforms:['plain','hill'], biomes:['grassland','forest','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'techPoints', amount:11 },
      { type:'points', output:'culturePoints', amount:5 },
      { type:'finalScore', output:'buildingScore', amount:4 },
      { type:'buildingCount', target:'library', min:2, output:'culturePoints', amount:2 }
    ]
  },
  courthouse: {
    name:'法院', emoji:'⚖️', type:'行政', rarity:'epic',
    cost:{ gold:9, pop:1 }, upkeep:3,
    landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:4 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'uniqueTypes', output:'culturePoints', amount:1, cap:8 }
    ]
  },
  sculpture_garden: {
    name:'雕塑公園', emoji:'🗿', type:'文化', rarity:'epic',
    cost:{ gold:8, pop:0 }, upkeep:1,
    landforms:['plain','hill'], biomes:['grassland','forest'], preserveForest:true,
    upgradesTo:[],
    effects:[
      { type:'points', output:'culturePoints', amount:3 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'adjacentBuilding', target:['park','theater'], output:'buildingScore', amount:2 },
      { type:'adjacentEmpty', output:'culturePoints', amount:1, cap:3 }
    ]
  },
  lighthouse: {
    name:'燈塔', emoji:'🗼', type:'設施', rarity:'epic',
    cost:{ gold:8, pop:1 }, upkeep:2,
    landforms:['water'], biomes:['water'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:3 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'adjacentRiver', output:'techPoints', amount:1 }
    ]
  },
  bank: {
    name:'銀行', emoji:'🏦', type:'商業', rarity:'legendary',
    cost:{ gold:12, pop:2 }, upkeep:4,
    landforms:['plain'], biomes:['grassland','forest','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:7 },
      { type:'finalScore', output:'buildingScore', amount:4 },
      { type:'adjacentBuilding', target:['market','mint','guild_hall'], output:'gold', amount:2 }
    ]
  },
  quarry: {
    name:'採石場', emoji:'🪨', type:'工業', rarity:'common',
    cost:{ gold:4, pop:1 }, upkeep:1,
    landforms:['hill','mountain'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:['stoneworks'],
    effects:[
      { type:'points', output:'gold', amount:2 },
      { type:'adjacentLandform', landform:'mountain', output:'gold', amount:1 }
    ]
  },
  // 負面鄰接（粉塵）：石材工坊讓每座相鄰的住宅 -1 文化。
  stoneworks: {
    name:'石材工坊', emoji:'🧱', type:'工業', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:6 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'adjacentBuilding', target:['quarry','mine'], output:'gold', amount:1 },
      { type:'adjacentAura', target:'house', output:'culturePoints', amount:-1 }
    ]
  },
  // 學校不再升級為大學：住宅 → 學校 → 大學會變成三段連續改造，依 1.2 倍規則大學的數值會高得不合理；大學改由學院改造取得。
  school: {
    name:'學校', emoji:'🏫', type:'教育', rarity:'rare',
    cost:{ gold:7, pop:1 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'techPoints', amount:4 },
      { type:'points', output:'culturePoints', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'radiusBuilding', target:'house', radius:2, output:'culturePoints', amount:1 }
    ]
  },
  // 工業聚落的支撐：自己產金，並讓相鄰的礦場 / 採石場 / 伐木場 / 鐵礦場多賺金幣；代價是吵到住宅，且不要蓋一堆鐵匠鋪。
  smithy: {
    name:'鐵匠鋪', emoji:'⚒️', type:'工業', rarity:'common',
    cost:{ gold:4, pop:1 }, upkeep:1,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:2 },
      { type:'adjacentAura', target:['mine','quarry','lumbermill','iron_mine'], output:'gold', amount:2 },
      { type:'adjacentAura', target:'house', output:'culturePoints', amount:-1 },
      { type:'adjacentSame', output:'gold', amount:-1, cap:2 }
    ]
  },
  // 商路節點：需要「路邊的空間」，並把市場與碼頭串起來；不鼓勵蓋成一排。
  caravanserai: {
    name:'商隊驛站', emoji:'🐪', type:'商業', rarity:'rare',
    cost:{ gold:6, pop:1 }, upkeep:1,
    landforms:['plain'], biomes:['grassland','desert','snow'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:3 },
      { type:'adjacentEmpty', output:'gold', amount:1, cap:4 },
      { type:'radiusBuilding', radius:3, target:['market','dock'], output:'gold', amount:1, cap:3 },
      { type:'adjacentSame', output:'gold', amount:-1, cap:2 }
    ]
  },
  // 陶坊的下一階：玻璃窗讓相鄰的住宅更宜居（正面光環），也賣給相鄰的市場。
  glassworks: {
    name:'玻璃工坊', emoji:'🪟', type:'工藝', rarity:'rare',
    cost:{ gold:5, pop:1 }, upkeep:2,
    landforms:['plain','hill'], biomes:['grassland','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:4 },
      { type:'points', output:'culturePoints', amount:1 },
      { type:'finalScore', output:'buildingScore', amount:2 },
      { type:'adjacentAura', target:'house', output:'culturePoints', amount:1 },
      { type:'adjacentBuilding', target:['market','guild_hall'], output:'gold', amount:1 }
    ]
  },
  // 碼頭的另一條路：偏重造船與運輸網；與碼頭 / 港口互相加成。
  shipyard: {
    name:'造船廠', emoji:'🛠️', type:'工業', rarity:'epic',
    cost:{ gold:8, pop:2 }, upkeep:3,
    landforms:['water'], biomes:['water'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:8 },
      { type:'points', output:'food', amount:2 },
      { type:'finalScore', output:'buildingScore', amount:3 },
      { type:'radiusBuilding', radius:6, target:['dock','port'], output:'gold', amount:1, cap:3 },
      { type:'adjacentAura', target:'dock', output:'gold', amount:1 }
    ]
  },
  // 神殿的科研路線：中世紀修道院抄寫與研究；需要清靜，離工業太近會被干擾（負面鄰接）。
  monastery: {
    name:'修道院', emoji:'🕯️', type:'信仰', rarity:'epic',
    cost:{ gold:9, pop:2 }, upkeep:3,
    landforms:['plain','hill','mountain'], biomes:['grassland','forest','snow','wetland'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'faithPoints', amount:5 },
      { type:'points', output:'techPoints', amount:6 },
      { type:'points', output:'culturePoints', amount:4 },
      { type:'finalScore', output:'buildingScore', amount:4 },
      { type:'adjacentEmpty', output:'faithPoints', amount:1, cap:3 },
      { type:'adjacentBuilding', target:['factory','smithy','barracks'], output:'techPoints', amount:-2 }
    ]
  },
  // 神殿的信仰 / 文化路線：城市地標；和住宅區互相加成，改造時一次性獲得大量信仰與分數。
  cathedral: {
    name:'大教堂', emoji:'⛪', type:'地標', rarity:'legendary',
    cost:{ gold:14, pop:3 }, upkeep:5,
    landforms:['plain','hill'], biomes:['grassland','forest','snow'],
    preserveForest:true,
    upgradesTo:[],
    effects:[
      { type:'points', output:'faithPoints', amount:8 },
      { type:'points', output:'culturePoints', amount:8 },
      { type:'finalScore', output:'buildingScore', amount:8 },
      { type:'onBuild', output:'faithPoints', amount:10 },
      { type:'onBuild', output:'buildingScore', amount:6 },
      { type:'adjacentBuilding', target:'house', output:'faithPoints', amount:1, cap:4 },
      { type:'adjacentEmpty', output:'culturePoints', amount:1, cap:3 }
    ]
  },
  // 劇院的下一階：羅馬式競技場，改造時一次性獲得大筆金幣與文化；多樣的鄰居讓它更賺，但不要蓋第二座。
  colosseum: {
    name:'競技場', emoji:'🏟️', type:'文化', rarity:'legendary',
    cost:{ gold:14, pop:2 }, upkeep:5,
    landforms:['plain','hill'], biomes:['grassland','forest','desert'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'culturePoints', amount:11 },
      { type:'points', output:'gold', amount:3 },
      { type:'finalScore', output:'buildingScore', amount:8 },
      { type:'onBuild', output:'gold', amount:15 },
      { type:'onBuild', output:'culturePoints', amount:10 },
      { type:'adjacentVariety', by:'type', output:'gold', amount:1, cap:4 },
      { type:'adjacentEmpty', output:'culturePoints', amount:1, cap:4 },
      { type:'adjacentSame', output:'gold', amount:-2, cap:2 }
    ]
  },
  // 近代交通樞紐：把工業、港口、礦場、市場連成網；需要空間，且噪音會影響住宅。
  railway_station: {
    name:'火車站', emoji:'🚉', type:'公共工程', rarity:'epic',
    cost:{ gold:12, pop:2 }, upkeep:4,
    landforms:['plain'], biomes:['grassland','desert','snow'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'gold', amount:6 },
      { type:'radiusBuilding', radius:6, target:['factory','port','mine','iron_mine','market'], output:'gold', amount:1, cap:5 },
      { type:'adjacentEmpty', output:'gold', amount:1, cap:3 },
      { type:'adjacentAura', target:'house', output:'culturePoints', amount:-1 }
    ]
  },
  
 
 //==========奇觀============//
  great_pyramid: {
    name:'大金字塔', emoji:'🔺', type:'奇觀', rarity:'wonder',
    cost:{ gold:220, pop:0 }, upkeep:0, buildTurns:5,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'],
    upgradesTo:[],
    effects:[
      { type:'points', output:'culturePoints', amount:6 },
      { type:'finalScore', output:'buildingScore', amount:12 },
      { type:'adjacentEmpty',output:'culturePoints', amount:1,cap:6 },
    ]
  },
  great_library: {
    name:'大圖書館', emoji:'📚', type:'奇觀', rarity:'wonder',
    cost:{ gold:280, pop:0 }, upkeep:0, buildTurns:6,
    landforms:['plain','hill'], biomes:['grassland','forest','desert','snow'], preserveForest:true,
    upgradesTo:[],
    effects:[
      { type:'points', output:'techPoints', amount:10 },
      { type:'points', output:'culturePoints', amount:6 },
      { type:'finalScore', output:'buildingScore', amount:16 },
      { type:'radiusBuilding', radius:4, target:['library','academy','university'], output:'techPoints', amount:1, cap:5 },
      { type:'adjacentEmpty', output:'culturePoints', amount:1, cap:3 }
    ]
  },
  hanging_gardens: {
    name:'空中花園', emoji:'🌿', type:'奇觀', rarity:'wonder',
    cost:{ gold:260, pop:0 }, upkeep:0, buildTurns:5,
    landforms:['plain','hill'], biomes:['grassland','forest','wetland'], requiresRiver:true, preserveForest:true,
    upgradesTo:[],
    effects:[
      { type:'points', output:'food', amount:5 },
      { type:'points', output:'culturePoints', amount:7 },
      { type:'points', output:'population', amount:3 },
      { type:'finalScore', output:'buildingScore', amount:14 },
      { type:'radiusBuilding', radius:4, target:['farm','orchard','greenhouse'], output:'food', amount:1, cap:5 },
      { type:'adjacentEmpty', output:'culturePoints', amount:1, cap:4 }
    ]
  },
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

  // ---------- 第 0 層（起始）----------
  farming: {
    name: '農業', icon: '🌾', cost: 0, requires: [],
    desc: '掌握耕作，建立穩定的糧食來源；開墾農地也讓伐木成為最早的產業。',
    unlocked: true,
    effects: [
      { type:'unlockBuilding', target:'farm', mode:'addPool' },
      { type:'unlockBuilding', target:'lumbermill', mode:'addPool' }
    ]
  },

  // ---------- 第 1 層 ----------
  Breeding: {
    name: '畜牧技術', icon: '🐑', cost: 5, requires: ['farming'],
    desc: '馴養牲畜並建立牧場。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'pasture', mode:'addPool' }
    ]
  },
  ceramics: {
    name: '陶器工藝', icon: '🏺', cost: 5, requires: ['farming'],
    desc: '解鎖陶坊，讓工藝品進入市場流通。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'pottery', mode:'addPool' }
    ]
  },
  irrigation: {
    name: '灌溉技術', icon: '🚰', cost: 5, requires: ['farming'],
    desc: '引水灌溉農地，提升農田產量並解鎖水井。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'well', mode:'addPool' },
      { type:'buildingBonus', target:'farm', output:'food', amount:1 }
    ]
  },

  // ---------- 第 2 層 ----------
  fishing: {
    name: '捕魚技術', icon: '🎣', cost: 12, requires: ['irrigation'],
    desc: '發展近海捕撈，解鎖碼頭。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'dock', mode:'addPool' }
    ]
  },
  store: {
    name: '儲存技術', icon: '📦', cost: 12, requires: ['ceramics'],
    desc: '建造糧倉，擴大城市的糧食儲存量。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'warehouse', mode:'addPool' }
    ]
  },
  irontool: {
    name: '金屬冶煉', icon: '🔨', cost: 12, requires: ['ceramics'],
    desc: '燒窯技術讓人們學會冶煉金屬，打造更鋒利的斧與鎬，開採礦石並提高伐木效率。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'mine', mode:'addPool' },
      { type:'buildingBonus', target:'lumbermill', output:'gold', amount:1 },
	  { type:'unlockBuilding', target:'smithy', mode:'addPool' }
    ]
  },

  // ---------- 第 3 層 ----------
  writing: {
    name: '文字', icon: '📜', cost: 19, requires: ['store'],
    desc: '記錄知識與交易，建立圖書館。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'library', mode:'addPool' },
	  { type:'unlockWonder', target:'great_library' },
    ]
  },
  masonry: {
    name: '石工技術', icon: '🧱', cost: 19, requires: ['irontool'],
    desc: '以採石與砌築技術建造耐久的石材工坊，並掌握建造大金字塔的技術。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'stoneworks', mode:'upgradeOnly' },
      { type:'unlockWonder', target:'great_pyramid' },
      { type:'unlockBuilding', target:'quarry', mode:'addPool' }
    ]
  },
  beekeeping: {
    name: '養蜂術', icon: '🐝', cost: 19, requires: ['Breeding','store'],
    desc: '發展蜂場，善用森林與草地資源。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'apiary', mode:'addPool' }
    ]
  },

  // ---------- 第 4 層 ----------
  jurisprudence: {
    name: '法制', icon: '⚖️', cost: 26, requires: ['writing'],
    desc: '建立法院與城市治理制度。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'courthouse', mode:'addPool' }
    ]
  },
  surveying: {
    name: '地籍測量', icon: '📏', cost: 26, requires: ['writing','masonry'],
    desc: '以測量丈量田地與礦脈，讓採礦與採石更有效率，也提升公共工程的規劃品質。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['aqueduct','warehouse'], output:'buildingScore', amount:1 },
      { type:'buildingBonus', target:['mine','quarry'], output:'gold', amount:1 }
    ]
  },
  iron_mining: {
    name: '冶鐵術', icon: '⚒️', cost: 26, requires: ['irontool','masonry'],
    desc: '掌握熔煉與礦石加工，讓礦場能進一步發展為鐵礦場。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'iron_mine', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'mine', output:'gold', amount:2 }
    ]
  },

  // ---------- 第 5 層 ----------
  Shipping: {
    name: '航運技術', icon: '🚢', cost: 33, requires: ['fishing','iron_mining'],
    desc: '鐵製工具與船釘造出遠洋船隻，拓展海上貿易：碼頭糧食產出更高，並解鎖港口與燈塔。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'port', mode:'addPool' },
      { type:'unlockBuilding', target:'lighthouse', mode:'addPool' },
      { type:'buildingBonus', target:'dock', output:'food', amount:1 }
    ]
  },
  horticulture: {
    name: '園藝學', icon: '🍎', cost: 33, requires: ['irrigation','surveying'],
    desc: '解鎖果園並提高農作產量。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'orchard', mode:'addPool' },
      { type:'buildingBonus', target:'farm', output:'food', amount:1 }
    ]
  },
  civic_commerce: {
    name: '貨幣鑄造', icon: '🪙', cost: 33, requires: ['jurisprudence'],
    desc: '以法律保障的官方鑄幣取代以物易物，使交易更有效率，並解鎖鑄幣所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'mint', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'market', output:'gold', amount:1 },
	  { type:'unlockBuilding', target:'caravanserai', mode:'addPool' }
    ]
  },

  // ---------- 第 6 層 ----------
  fortification: {
    name: '城防工事', icon: '🛡️', cost: 40, requires: ['masonry','civic_commerce'],
    desc: '建造守備隊以維護城市安全。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'barracks', mode:'addPool' }
    ]
  },
  education: {
    name: '高等教育', icon: '🎓', cost: 40, requires: ['writing','civic_commerce'],
    desc: '建立學院，讓知識研究成為城市發展的重要力量。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'academy', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'library', output:'techPoints', amount:1 }
    ]
  },
  astronomy: {
    name: '天文學', icon: '🔭', cost: 40, requires: ['surveying','Shipping'],
    desc: '以精密觀測研究天體，解鎖天文台。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'observatory', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'observatory', output:'techPoints', amount:2 }
    ]
  },

  // ---------- 第 7 層 ----------
  engineering: {
    name: '工程學', icon: '🛠️', cost: 47, requires: ['surveying','fortification'],
    desc: '運用機械與結構知識建造水力磨坊與風車，為工業化生產奠定基礎。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'windmill', mode:'addPool' },
      { type:'unlockBuilding', target:'watermill', mode:'addPool' },
      { type:'buildingBonus', target:'watermill', output:'gold', amount:2 }
    ]
  },
  urban_planning: {
    name: '都市規劃', icon: '📐', cost: 47, requires: ['fortification','jurisprudence'],
    desc: '以道路、用地與公共設施的整體規劃支援更密集的商業聚落。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'business_center', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'house', output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:'house', output:'buildingScore', amount:1 },
      { type:'buildingBonus', target:'market', output:'gold', amount:1 }
    ]
  },
  crop_rotation: {
    name: '輪作制度', icon: '🌱', cost: 47, requires: ['Breeding','astronomy'],
    desc: '輪替作物與牧草地，提升農業糧食產量，並讓農田能進一步發展為溫室。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['farm','pasture','greenhouse','vineyard'], output:'food', amount:1 },
      { type:'unlockBuilding', target:'greenhouse', mode:'upgradeOnly' }
    ]
  },

  // ---------- 第 8 層 ----------
  civil_engineering: {
    name: '土木工程', icon: '🏗️', cost: 54, requires: ['engineering','urban_planning'],
    desc: '以拱門與水道工程跨越地形引水，並建造公共浴場。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'aqueduct', mode:'upgradeOnly' },
      { type:'unlockBuilding', target:'bathhouse', mode:'addPool' },
      { type:'buildingBonus', target:'watermill', output:'food', amount:1 }
    ]
  },
  universities: {
    name: '大學制度', icon: '🏫', cost: 54, requires: ['education','urban_planning'],
    desc: '建立高等學府，集中發展研究與學術。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'university', mode:'addPool' }
    ]
  },
  banking: {
    name: '銀行制度', icon: '🏦', cost: 54, requires: ['civic_commerce','urban_planning'],
    desc: '建立銀行並促進商業聚落發展。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'bank', mode:'addPool' },
      { type:'buildingBonus', target:'mint', output:'gold', amount:1 }
    ]
  },

  // ---------- 第 9 層 ----------
  navigation: {
    name: '航海術', icon: '🧭', cost: 61, requires: ['astronomy','banking'],
    desc: '羅盤與星象讓遠洋航行更安全，資本充足的商人出資建造商港。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'harbor', mode:'addPool' },
      { type:'buildingBonus', target:['port','harbor'], output:'gold', amount:1 },
	  { type:'unlockBuilding', target:'shipyard', mode:'upgradeOnly' }
    ]
  },
  printing_technology: {
    name: '印刷技術', icon: '🖨️', cost: 61, requires: ['universities','writing'],
    desc: '讓知識更容易複製與傳播，解鎖印刷所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'printing_press', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'library', output:'culturePoints', amount:1 }
    ]
  },
  mechanization: {
    name: '機械化生產', icon: '⚙️', cost: 61, requires: ['civil_engineering','iron_mining'],
    desc: '以機械動力取代部分人力，提升礦業與工廠的生產效率。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'factory', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['factory','mine','iron_mine'], output:'gold', amount:1 }
    ]
  },

  // ---------- 第 10 層 ----------
  sanitation: {
    name: '衛生工程', icon: '🚿', cost: 68, requires: ['civil_engineering','mechanization'],
    desc: '現代給排水與下水道讓城市擺脫疫病，浴場與引水渠能容納更多居民。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['bathhouse','aqueduct'], output:'population', amount:1 }
    ]
  },
  public_health: {
    name: '公共衛生', icon: '🩺', cost: 68, requires: ['universities','printing_technology'],
    desc: '改善基礎醫療照護，解鎖診療所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'clinic', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'hospital', output:'population', amount:1 }
    ]
  },
    railway: {
    name: '鐵路', icon: '🚆', cost: 67, requires: ['mechanization','banking'],
    desc: '蒸汽機與資本讓鐵路連結礦場、工廠與港口，貨物流通速度大增。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'railway_station', mode:'addPool' },
      { type:'buildingBonus', target:['factory','port'], output:'gold', amount:1 }
    ]
  },
  electrification: {
    name: '電氣化', icon: '💡', cost: 78, requires: ['railway','public_health'],
    desc: '電力讓工廠、學府與車站全天候運轉，研究與生產都更有效率。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['library','university','observatory'], output:'techPoints', amount:2 },
      { type:'buildingBonus', target:['factory','railway_station'], output:'gold', amount:2 }
    ]
  },
};

export const CULTURE_TREE = {

  // ---------- 第 0 層（起始）----------
  tradition: {
    name: '傳統文化', icon: '🪶', cost: 0, requires: [],
    desc: '保存部落傳承與生活技藝，開啟定居發展。',
    unlocked: true,
    effects: [
      { type:'unlockBuilding', target:'tent', mode:'addPool' }
    ]
  },

  // ---------- 第 1 層 ----------
  settle: {
    name: '定居', icon: '🏘️', cost: 5, requires: ['tradition'],
    desc: '從季節性營地轉向長期聚落，形成穩定的住宅與社區。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'house', mode:'addPool' }
    ]
  },
  Belief: {
    name: '信仰', icon: '🙏', cost: 5, requires: ['tradition'],
    desc: '共同儀式與信念凝聚社群，並形成固定的祭祀場所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'shrine', mode:'addPool' }
    ]
  },

  // ---------- 第 2 層 ----------
  arts: {
    name: '藝術', icon: '🎨', cost: 12, requires: ['settle'],
    desc: '發展表演、工藝與記錄傳統，豐富城市的文化生活。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:'library', output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:'library', output:'buildingScore', amount:1 }
    ]
  },
  trading: {
    name: '貿易', icon: '🪙', cost: 12, requires: ['settle'],
    desc: '以物易物與定期市集連結聚落，促進專業分工。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'market', mode:'addPool' }
    ]
  },
  religion: {
    name: '宗教', icon: '⛪', cost: 12, requires: ['Belief'],
    desc: '儀式制度化後，信仰中心逐漸發展為規模更大的神殿。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'Temple', mode:'upgradeOnly' }
    ]
  },

  // ---------- 第 3 層 ----------
  viticulture: {
    name: '葡萄栽培', icon: '🍇', cost: 19, requires: ['trading'],
    desc: '發展葡萄栽培與釀造傳統，解鎖葡萄園。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'vineyard', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'vineyard', output:'culturePoints', amount:1 }
    ]
  },
  artisan_crafts: {
    name: '工藝傳承', icon: '🧶', cost: 19, requires: ['trading'],
    desc: '城市中的工匠世代相傳，陶器與公共浴場成為社交與文化生活的中心。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['pottery','bathhouse'], output:'culturePoints', amount:1 },
	  { type:'unlockBuilding', target:'glassworks', mode:'upgradeOnly' }
    ]
  },
  public_gardens: {
    name: '公共事務', icon: '🌷', cost: 19, requires: ['arts','religion'],
    desc: '規劃公共綠地與共同空間，讓居民有交流和休憩的場所。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'park', mode:'addPool' },
      { type:'unlockBuilding', target:'townhall', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['park','hospital'], output:'culturePoints', amount:1 },
      { type:'buildingBonus', target:['park','hospital'], output:'buildingScore', amount:1 }
    ]
  },

  // ---------- 第 4 層 ----------
  maritime_tradition: {
    name: '海洋傳統', icon: '⚓', cost: 26, requires: ['artisan_crafts'],
    desc: '發展港灣文化，提升港口聚落的文化價值。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['harbor','lighthouse'], output:'culturePoints', amount:1 }
    ]
  },
  civic_pride: {
    name: '城市認同', icon: '🏙️', cost: 26, requires: ['public_gardens'],
    desc: '共同的城市認同促進公共建設、行政組織與大型集會。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'festival', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['townhall','festival'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['townhall','festival'], output:'buildingScore', amount:2 }
    ]
  },
  philosophy: {
    name: '哲學思想', icon: '🏛️', cost: 26, requires: ['public_gardens'],
    desc: '支持思想交流與知識辯論，提升學術與信仰機構的文化影響。',
    unlocked: false,
    effects: [
	  { type:'unlockWonder', target:'hanging_gardens' },
      { type:'buildingBonus', target:['library','shrine'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['library','shrine'], output:'buildingScore', amount:2 }
    ]
  },

  // ---------- 第 5 層 ----------
  civic_law: {
    name: '城市法規', icon: '⚖️', cost: 33, requires: ['civic_pride'],
    desc: '以共同法規與市民守望維護城市秩序，提升法院與守備隊的文化價值。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['courthouse','barracks'], output:'culturePoints', amount:1 }
    ]
  },
  civic_festivals: {
    name: '市民節慶', icon: '🎉', cost: 33, requires: ['philosophy','civic_pride'],
    desc: '以公共慶典凝聚居民，建立劇院文化。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'theater', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'theater', output:'culturePoints', amount:1 }
    ]
  },
  Medical: {
    name: '醫療保健', icon: '🩺', cost: 33, requires: ['philosophy'],
    desc: '累積醫療知識與照護制度，讓住宅或公共綠地可發展為醫療設施。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'hospital', mode:'upgradeOnly' }
    ]
  },

  // ---------- 第 6 層 ----------
  public_works: {
    name: '公共建設', icon: '🏗️', cost: 40, requires: ['civic_law'],
    desc: '以公共資源改善民生設施，強化引水渠與診療所。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['aqueduct','clinic'], output:'population', amount:1 },
      { type:'buildingBonus', target:['aqueduct','clinic'], output:'buildingScore', amount:1 }
    ]
  },
  horticultural_festivals: {
    name: '園藝節慶', icon: '🌼', cost: 40, requires: ['viticulture','mercantile_trust'],
    desc: '以園藝、釀酒與蜂蜜慶典凝聚居民，提升果園、葡萄園與蜂場的文化價值。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['orchard','vineyard','apiary'], output:'culturePoints', amount:1 }
    ]
  },
  guilds: {
    name: '工匠行會', icon: '🧵', cost: 40, requires: ['civic_law','artisan_crafts'],
    desc: '組織商人與工匠互助，解鎖行會會館。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'guild_hall', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['market','guild_hall'], output:'gold', amount:1 }
    ]
  },

  // ---------- 第 7 層 ----------
  scholarship: {
    name: '學術社群', icon: '📖', cost: 47, requires:['monasticism','guilds'],
    desc: '資助學術研究與知識交流，提升大學的文化產出。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:'university', output:'culturePoints', amount:1 }
    ]
  },
  mercantile_trust: {
    name: '商業信譽', icon: '🤝', cost: 47, requires: ['guilds','maritime_tradition'],
    desc: '以信用與互信支持金融機構，提升銀行與鑄幣所的文化產出。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['bank','mint'], output:'culturePoints', amount:1 }
    ]
  },

  // ---------- 第 8 層 ----------
  patronage: {
    name: '藝術贊助', icon: '🎨', cost: 54, requires: ['mercantile_trust','civic_festivals'],
    desc: '由城市與商會支持藝文創作，提升劇院與圖書館的文化產出。',
    unlocked: false,
    effects: [
      { type:'buildingBonus', target:['theater','library'], output:'culturePoints', amount:2 },
      { type:'buildingBonus', target:['theater','library'], output:'buildingScore', amount:1 }
    ]
  },
  public_art: {
    name: '公共藝術', icon: '🗿', cost: 54, requires: ['scholarship','civic_festivals'],
    desc: '將藝術帶入公共空間，解鎖雕塑公園。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'sculpture_garden', mode:'addPool' }
    ]
  },

  // ---------- 第 9 層 ----------
  public_education: {
    name: '公共教育', icon: '📖', cost: 61, requires: ['public_art','scholarship'],
    desc: '由社群支持基礎教育，建立學校並培養更多識字與研究人才。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'school', mode:'addPool' },
      { type:'buildingBonus', target:'library', output:'techPoints', amount:1 }
    ]
  },
    monasticism: {
    name: '修道制度', icon: '🕯️', cost: 29, requires: ['Medical','religion'],
    desc: '僧侶集體修行並抄寫典籍，修道院成為保存與傳播知識的據點。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'monastery', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'Temple', output:'faithPoints', amount:1 }
    ]
  },
  public_spectacle: {
    name: '公共競技', icon: '🏟️', cost: 37, requires: ['public_works','civic_festivals'],
    desc: '國家出資舉辦大型競技與表演，以娛樂凝聚龐大的城市人口。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'colosseum', mode:'upgradeOnly' },
      { type:'buildingBonus', target:'theater', output:'culturePoints', amount:1 }
    ]
  },
  gothic_architecture: {
    name: '哥德式建築', icon: '🏰', cost: 56, requires: ['patronage','monasticism'],
    desc: '尖拱與飛扶壁讓教堂蓋得更高更亮，成為整座城市的精神地標。',
    unlocked: false,
    effects: [
      { type:'unlockBuilding', target:'cathedral', mode:'upgradeOnly' },
      { type:'buildingBonus', target:['Temple','cathedral'], output:'buildingScore', amount:1 }
    ]
  },
};

// ===== 點數消耗動態生成與研發折扣系統 =====//
// 文化樹的節點比科技樹少，所以每個節點的消耗乘上這個係數，兩棵樹才會差不多「長」。
const CULTURE_COST_SCALE = 1.3;

// 點數消耗計算函數：
function calculateLevelCost(level) {
  if (level === 0) return 0;
  
  // 前期便宜、後期越來越陡：第 1~10 層約為 4、7、11、16、22、29、37、46、56、67
  const baseCost = 4;   // 第 1 層的基礎消耗點數
  const stepCost = 3;   // 第 1→2 層增加的點數
  const accel = 1;      // 之後每一層「增加量」再多 +1（越往後越陡）
  
  return baseCost + (level - 1) * stepCost + accel * ((level - 1) * (level - 2)) / 2;
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
    const baseCost = Math.round(calculateLevelCost(lvl) * (tree === CULTURE_TREE ? CULTURE_COST_SCALE : 1));
    
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
