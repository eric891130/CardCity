# 卡牌城市建造遊戲（Card City）

一款結合卡牌、空間規劃與城市經營的瀏覽器遊戲。

## 遊戲特色
- 使用卡牌規劃並建造自己的城市
- 思考建築配置與鄰接加成
- 管理資金並推進回合
- 面對城市事件與不同的建設選擇

## 如何遊玩
直接使用瀏覽器開啟下方網址即可，不需要下載或安裝遊戲。

**遊戲網址：** https://eric891130.github.io/CardCity/

## 開發狀態
目前仍在持續開發中，歡迎試玩並提供意見回饋。


## 地圖資料：地形與地貌

每個棋盤格使用 `landform`（地形）與 `biome`（地貌）兩個欄位。地形 ID：`plain`、`hill`、`mountain`、`river`；地貌 ID：`grassland`、`forest`、`desert`、`snow`、`wetland`。建築可用 `landforms` 與 `biomes` 限制放置位置，省略任一欄位表示該維度不限。效果可使用 `adjacentLandform` 或 `adjacentBiome`。
