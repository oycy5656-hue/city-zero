# 曼哈顿 / MANHATTAN

真实纽约建筑轮廓 + 真实街道中心线，叠加城市运营 / 模拟 / 战术原型。

![曼哈顿真实城市地图](docs/preview.png)

## 当前版本

地图不再是程序化假纽约，而是接入 **NYC Open Data** 的曼哈顿真实数据切片：

- **范围**：曼哈顿下城至中央公园 / 上西区南缘
- **31.42 km²** 真实陆地
- **27,845 栋真实建筑轮廓**
- **5,433 段真实街道中心线**
- **246 个真实公园 / 开放空间**
- 建筑带 BIN / BBL / 建造年份 / 层数 / 屋顶高度
- 街道带真实英文路名
- 高缩放级别显示真实街名
- 六区是游戏性覆盖层；建筑、街道、公园形状来自真实纽约数据

## 数据来源与许可

本项目的城市几何来自纽约市公开数据（NYC Open Data / Department of City Planning / OTiS）：

- [Building Footprints](https://data.cityofnewyork.us/City-Government/BUILDING/5zhs-2jue)
- [Street Centerline (LION)](https://data.cityofnewyork.us/City-Government/Centerline/inkn-q76z)
- [Borough Boundaries](https://data.cityofnewyork.us/City-Government/Borough-Boundaries/gthc-hcne)
- NYC DOT Base Map / Parks & Open Space

数据切片边界：`-74.02, 40.70, -73.96, 40.80`（WGS84），访问时间 2026-11-18。

建筑高度优先使用 `HEIGHT_ROOF`（英尺 → 米），缺失时用 `NUM_FLOORS × 3.2m`。建筑材质根据建造年份与高度推断，不是官方分类。

游戏中的城区名、势力、事件和经营数值是虚构覆盖层，不代表真实纽约行政或政治实体。

## 功能

- **地图**：真实曼哈顿轮廓、东河 / 哈德逊河、中央公园、真实街区与建筑
- **自由缩放**：滚轮 / 双指缩放、拖拽平移、双击放大、缩放按钮、小地图定位
- **LOD**：远看真实建筑肌理与路网，近看独立建筑轮廓、屋顶设备、真实街名
- **六区**：旧港、锈带、霓虹巷、中枢、外野、环城
- **真实地标**：帝国大厦、时报广场、世界贸易中心、华尔街、中央车站、布鲁克林大桥等
- **搜索**：按城区或地点搜索并聚焦
- **经营**：六区税率、治安预算、基建预算、日结算
- **模拟**：日期 / 时间推进、暂停 / 1× / 2× / 4× 速度
- **战术**：事件列表、行动单位、战术选择、成功率结算、城区控制度与威胁变化
- **档案**：城区、势力与城市历史

## 数据管线

```bash
node tools/fetch-nyc.mjs   # 从 NYC ArcGIS 拉取建筑 / 街道 / 公园 / 边界
node tools/build-nyc.mjs   # 投影、简化、压缩为 src/data/nyc-*.json
```

拉取脚本使用 NYC DOT Base Map 的公开 ArcGIS 服务；原始 GeoJSON 不入库，仓库只保留生成后的精简数据。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5188/city-zero/
npm run build
npm run preview
```

要求 Node.js 20+。

## 结构

```text
src/
├─ App.jsx                 游戏外壳、状态、经营与战术逻辑
├─ styles.css              HUD / 面板 / 移动端样式
├─ data/
│  ├─ city.js              对外数据入口、势力、事件、战术
│  ├─ nyc.js               真实地图数据入口
│  ├─ nyc-map.json         陆地、六区、公园、地标
│  ├─ nyc-buildings.json   27,845 栋真实建筑轮廓
│  └─ nyc-roads.json       5,433 段真实街道
├─ map/
│  ├─ generator.js         真实数据加载 + 空间索引
│  ├─ renderer.js          Canvas 地图、真实多边形建筑、街名
│  └─ MapCanvas.jsx        缩放 / 平移 / 点选 / 小地图
└─ components/
   ├─ TopBar.jsx
   ├─ DistrictRail.jsx
   ├─ DistrictInspector.jsx
   └─ CommandPanels.jsx
```

## 性能

- 建筑按 500m 网格建立空间索引
- 建筑使用真实多边形轮廓，屏幕空间挤出，不逐个 Canvas transform
- 远看平铺建筑肌理，近看才显示屋顶细节
- 真实街名只在 1.0 以上缩放显示，每种街名只出现一次
- 1920×1080 桌面端与 390px 手机端均无横向溢出

## 说明

建筑轮廓、街道中心线与公园边界来自纽约市公开数据；游戏城区划分、经营数值、事件与势力为虚构创作。
