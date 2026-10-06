export interface Strategy {
  id: string;
  name: string;
  nameEn: string;
  group: string;
  tags: string[];
  concept: string;
  scenarios: string[];
  synergies: string[];
  synergyNote?: string;
}

export interface StrategyGroup {
  id: string;
  name: string;
  nameEn: string;
}

export const strategyGroups: StrategyGroup[] = [
  { id: 'green', name: '绿色低碳', nameEn: 'Low Carbon' },
  { id: 'space', name: '空间原型', nameEn: 'Spatial Prototype' },
  { id: 'context', name: '在地文脉', nameEn: 'Local Context' },
  { id: 'mixed', name: '复合业态', nameEn: 'Mixed Use' },
  { id: 'efficiency', name: '建造效率', nameEn: 'Efficiency' },
  { id: 'urban', name: '城市关系', nameEn: 'Urban Relation' },
];

export const strategies: Strategy[] = [
  // ---------- 绿色低碳 ----------
  {
    id: 'passive-design',
    name: '被动式设计优先',
    nameEn: 'Passive Design First',
    group: 'green',
    tags: ['绿色低碳', '低能耗', '热舒适'],
    concept:
      '在动用任何机电设备之前，先以朝向、体形、蓄热与自然通风获得舒适。建筑本身即一套调节微气候的系统，把能耗需求降到最低。',
    scenarios: ['严寒/寒冷/夏热冬冷地区', '对运营能耗敏感的公共建筑', '绿色星级认证目标项目'],
    synergies: ['vertical-greenery', 'wind-corridor', 'light-build', 'climate-form'],
    synergyNote: '被动策略打底后，绿化遮阳与自然通风的边际节能效益显著放大。',
  },
  {
    id: 'vertical-greenery',
    name: '立体绿化系统',
    nameEn: 'Vertical Greenery System',
    group: 'green',
    tags: ['绿色低碳', '遮阳降温', '生态'],
    concept:
      '把绿化从地面延伸至立面、退台与屋顶，形成立体的遮阳、蒸腾降温与雨水滞留层。同时柔化高密度环境，带来可感知的生态效益。',
    scenarios: ['高密度城市塔楼', '热带亚热带建筑', '需要改善微气候与景观品质的项目'],
    synergies: ['sponge-city', 'terrace-step', 'bipv', 'passive-design'],
    synergyNote: '与退台跌落结合时，绿化获得可停留的水平平台，存活率与使用性兼得。',
  },
  {
    id: 'sponge-city',
    name: '海绵校园 / 社区',
    nameEn: 'Sponge City',
    group: 'green',
    tags: ['绿色低碳', '雨洪管理', '景观'],
    concept:
      '以湿地、雨水花园、透水铺装与调蓄水体就地消纳雨水，削峰减排、净化初雨。雨洪基础设施同时成为富有公共性的开放空间。',
    scenarios: ['校园与大型社区', '内涝频发场地', '滨水生态修复项目'],
    synergies: ['vertical-greenery', 'micro-weave', 'urban-public-space'],
    synergyNote: '海绵设施与公共地景叠合，让调蓄容积在晴天也能被高频使用。',
  },
  {
    id: 'bipv',
    name: '光伏建筑一体化',
    nameEn: 'Building Integrated PV',
    group: 'green',
    tags: ['绿色低碳', '产能', '双碳'],
    concept:
      '将光伏作为屋面、遮阳、立面的有机组成而非外加设备，使建筑从能源消费者转向生产者。结合储能与正能设计可实现年净零能耗。',
    scenarios: ['屋顶资源充足的低层与大跨建筑', '双碳/近零能耗目标', '日照条件良好场地'],
    synergies: ['light-build', 'passive-design', 'structure-space'],
    synergyNote: '轻建造降低隐含碳，光伏补偿运行碳，构成全生命周期减碳闭环。',
  },
  {
    id: 'wind-corridor',
    name: '自然通风廊道',
    nameEn: 'Natural Ventilation Corridor',
    group: 'green',
    tags: ['绿色低碳', '通风', '空气品质'],
    concept:
      '顺应主导风向组织贯穿建筑与场地的风道，借热压与风压差实现高效自然通风。中庭、拔风井与开口形成有组织的进排风路径。',
    scenarios: ['过渡季长的地区', '大进深公共建筑', '对室内空气品质要求高的场所'],
    synergies: ['passive-design', 'atrium-core', 'courtyard-embed'],
    synergyNote: '中庭作为拔风核，与廊道协同形成稳定的热压通风回路。',
  },
  {
    id: 'light-build',
    name: '双碳导向的轻建造',
    nameEn: 'Low-Carbon Light Construction',
    group: 'green',
    tags: ['绿色低碳', '隐含碳', '可回收'],
    concept:
      '选用轻质、低碳、可回收或再生材料，减少建造与拆除阶段的隐含碳与废弃物。纸、木、轻钢等轻系统同时带来快速施工与抗震优势。',
    scenarios: ['应急与临时建筑', '隐含碳约束严格项目', '可拆卸重复利用的展陈场馆'],
    synergies: ['bipv', 'modular-build', 'prefab', 'local-material'],
    synergyNote: '轻量构件天然适配模块化与工厂预制，建造速度与减碳同步提升。',
  },

  // ---------- 空间原型 ----------
  {
    id: 'courtyard-embed',
    name: '庭院嵌入',
    nameEn: 'Embedded Courtyard',
    group: 'space',
    tags: ['空间原型', '采光通风', '场所感'],
    concept:
      '在建筑体量中嵌入一个或多个庭院，把光、空气与自然引入大进深内部。庭院既是环境核心，也是组织流线与归属感的场所中心。',
    scenarios: ['大进深或高密度地块', '需要静谧氛围的文化与教育建筑', '传统院落文化地区'],
    synergies: ['gray-space', 'pilotis', 'climate-form', 'wind-corridor'],
    synergyNote: '庭院与灰空间檐口相连，形成室内外逐级过渡的气候缓冲层。',
  },
  {
    id: 'pilotis',
    name: '底层架空',
    nameEn: 'Pilotis / Elevated Ground',
    group: 'space',
    tags: ['空间原型', '释放地面', '通透'],
    concept:
      '以柱墩将建筑主体抬离地面，把首层还给城市：通行、绿化、活动与视线得以穿越。架空层同时应对潮湿、洪涝与局促场地。',
    scenarios: ['高密度街区', '滨水或易涝场地', '需要连续公共穿行的地块'],
    synergies: ['shared-floor', 'boundary-penetrate', 'gray-space'],
    synergyNote: '架空与边界渗透共同让建筑底层成为连续的城市公共层。',
  },
  {
    id: 'gray-space',
    name: '灰空间界面',
    nameEn: 'Gray Space Interface',
    group: 'space',
    tags: ['空间原型', '半室外', '过渡'],
    concept:
      '以挑檐、柱廊、骑楼等半室外空间模糊内外边界，提供遮阴避雨又连通城市的过渡地带。灰空间是最具日常性的停留与相遇场所。',
    scenarios: ['多雨或强日照地区', '沿街商业与文化建筑', '需要缓冲人流的公共建筑'],
    synergies: ['courtyard-embed', 'climate-form', 'facade-vitality'],
    synergyNote: '灰空间让活跃首层获得气候庇护，延长街道活力的时间。',
  },
  {
    id: 'terrace-step',
    name: '退台跌落',
    nameEn: 'Terraced Setback',
    group: 'space',
    tags: ['空间原型', '屋顶花园', '景观'],
    concept:
      '体量逐层后退形成跌落的台地与屋顶平台，消解高层体量并把地面景观延伸至空中。每户或每层由此获得户外空间与开阔视野。',
    scenarios: ['山地与坡地场地', '高密度住宅与综合体', '高度受限需消化容积率的地块'],
    synergies: ['vertical-greenery', 'vertical-mix', 'courtyard-embed'],
    synergyNote: '退台为立体绿化提供覆土平台，空中花园由此成片成立。',
  },
  {
    id: 'atrium-core',
    name: '中庭活力核',
    nameEn: 'Atrium Vitality Core',
    group: 'space',
    tags: ['空间原型', '公共性', '采光'],
    concept:
      '以贯通多层的中庭作为建筑的社会与环境核心，组织垂直交通、视线交流与自然采光。围绕中庭的环廊成为偶遇与共享的发生器。',
    scenarios: ['大型办公与商业综合体', '酒店与文教建筑', '需要内部公共中心的大体量项目'],
    synergies: ['wind-corridor', 'shared-floor', 'vertical-mix'],
    synergyNote: '中庭同时是拔风井与社交核，环境效益与公共性相互成就。',
  },
  {
    id: 'shared-floor',
    name: '共享大平层',
    nameEn: 'Shared Open Floor',
    group: 'space',
    tags: ['空间原型', '灵活', '协同'],
    concept:
      '以少柱或无柱的大跨楼面提供可自由划分的开放平面，适配灵活办公与持续变化的使用需求。结构与设备被整合到周边或核心。',
    scenarios: ['现代办公与研发空间', '需要灵活布展的展厅', '未来功能不确定的建筑'],
    synergies: ['atrium-core', 'pilotis', 'structure-space'],
    synergyNote: '结构-空间一体化释放柱网，大平层的灵活性才真正成立。',
  },

  // ---------- 在地文脉 ----------
  {
    id: 'local-material',
    name: '在地材料当代表达',
    nameEn: 'Local Material Reinterpreted',
    group: 'context',
    tags: ['在地文脉', '材料', '可持续'],
    concept:
      '就地选取土、石、木、竹等材料并以当代工艺重新表达，降低运输碳排并唤起场所记忆。材料的真实肌理成为建筑最直接的地域语言。',
    scenarios: ['乡村与欠发达地区', '强调地域认同的文化建筑', '预算有限需就地取材项目'],
    synergies: ['climate-form', 'micro-weave', 'light-build'],
    synergyNote: '在地材料与传统气候形制结合，地域智慧被整体转译。',
  },
  {
    id: 'symbol-translate',
    name: '地域符号转译',
    nameEn: 'Regional Symbol Translation',
    group: 'context',
    tags: ['在地文脉', '文化', '造型'],
    concept:
      '提取地域文化与自然中的形式母题进行抽象转译，而非表面拼贴符号。以当代建造再现地方精神，使建筑可被当地人识别与认同。',
    scenarios: ['文化场馆与城市地标', '民族文化地区', '旅游与展示类项目'],
    synergies: ['facade-vitality', 'memory-retain', 'climate-form'],
    synergyNote: '符号转译与界面活化结合，文化表达在街道尺度被日常感知。',
  },
  {
    id: 'memory-retain',
    name: '场地记忆保留',
    nameEn: 'Site Memory Retention',
    group: 'context',
    tags: ['在地文脉', '更新', '工业遗产'],
    concept:
      '保留场地上有记忆价值的建筑、构筑物、植被甚至地形，以新旧叠加延续场地叙事。改造而非清除，让历史层理成为新空间的厚度。',
    scenarios: ['工业遗产与旧厂房改造', '历史街区更新', '有保留价值的校园/营房'],
    synergies: ['micro-weave', 'time-evolve', 'symbol-translate'],
    synergyNote: '保留的记忆载体与时序活化结合，旧空间得以渐进再生。',
  },
  {
    id: 'micro-weave',
    name: '微更新织补',
    nameEn: 'Micro-Renewal Weaving',
    group: 'context',
    tags: ['在地文脉', '城市更新', '社区'],
    concept:
      '以小尺度、针灸式的介入织补被割裂的城市与社区，尊重既有社会网络。一系列微小而精准的公共节点，比大拆大建更能激发活力。',
    scenarios: ['老旧社区微更新', '碎片化城市空间', '多元移民社区'],
    synergies: ['memory-retain', 'slow-stitch', 'facade-vitality', 'sponge-city'],
    synergyNote: '微节点经慢行系统串联，织补效应才能网络化扩散。',
  },
  {
    id: 'climate-form',
    name: '气候适应形制',
    nameEn: 'Climate-Responsive Form',
    group: 'context',
    tags: ['在地文脉', '气候', '传统智慧'],
    concept:
      '从传统聚落适应气候的形制——窄巷、高墙、厚墙小窗、风塔、天井——中提炼原理并当代化。形式由气候逻辑生成，舒适而有地域特征。',
    scenarios: ['干热/湿热/严寒等极端气候区', '传统聚落丰富地区', '低能耗文化与居住项目'],
    synergies: ['passive-design', 'courtyard-embed', 'local-material'],
    synergyNote: '气候形制与被动式设计同源，是传统智慧的现代表达。',
  },

  // ---------- 复合业态 ----------
  {
    id: 'vertical-mix',
    name: '垂直复合分层',
    nameEn: 'Vertical Mixed Layering',
    group: 'mixed',
    tags: ['复合业态', '高密度', '综合体'],
    concept:
      '将多种功能沿垂直方向叠合，以独立入口、结构转换与共享基座组织复杂流线。垂直叠合节约土地并让各业态共享客流与配套。',
    scenarios: ['城市中心高密度地块', 'TOD 综合体', '用地紧张的多功能项目'],
    synergies: ['atrium-core', 'vitality-ring', 'terrace-step', 'public-return'],
    synergyNote: '以中庭组织垂直叠层，复杂流线被清晰地组织为立体街区。',
  },
  {
    id: 'time-evolve',
    name: '时序业态演化',
    nameEn: 'Phased Program Evolution',
    group: 'mixed',
    tags: ['复合业态', '分期', '适应性'],
    concept:
      '承认功能会随时间变化，以可生长、可转换的结构支持业态分阶段演化。先以最低成本启动，再依据市场与运营反馈逐步填充升级。',
    scenarios: ['分期开发的大盘', '产业园区与文创区', '前期业态不确定项目'],
    synergies: ['memory-retain', 'growth-frame', 'vitality-ring'],
    synergyNote: '可生长框架为时序演化提供结构条件，二者共同应对不确定性。',
  },
  {
    id: 'boundary-penetrate',
    name: '边界渗透激活',
    nameEn: 'Permeable Boundary',
    group: 'mixed',
    tags: ['复合业态', '开放', '流线'],
    concept:
      '打破封闭地块边界，让公共流线自由穿越建筑内部与庭院，把城市生活引入。多孔的边界带来安全、客流与自发的活动混合。',
    scenarios: ['大学校园与园区', '占据整个街坊的综合体', '需要增加公共穿越的地块'],
    synergies: ['pilotis', 'shared-floor', 'gradient-open'],
    synergyNote: '底层架空使渗透边界真正连续，城市流线无阻穿过。',
  },
  {
    id: 'vitality-ring',
    name: '24 小时活力环',
    nameEn: '24h Vitality Loop',
    group: 'mixed',
    tags: ['复合业态', '全天候', '商业'],
    concept:
      '将互补业态沿一条连续环道组织，使不同时段的高峰彼此衔接，形成全天候活力。环道本身是目的地，驱动人们停留、绕行与重逢。',
    scenarios: ['商业综合体与街区', '交通枢纽周边', '夜经济活跃地区'],
    synergies: ['vertical-mix', 'facade-vitality', 'public-return'],
    synergyNote: '活跃界面沿活力环展开，街道与内部商业互为橱窗。',
  },
  {
    id: 'public-return',
    name: '公共服务返还',
    nameEn: 'Public Amenity Return',
    group: 'mixed',
    tags: ['复合业态', '公共性', '互惠'],
    concept:
      '在高密度开发中向城市返还图书馆、展厅、城市客厅或开放绿地，以公共利益换取开发强度。这些空间成为建筑的社会信用与吸引力来源。',
    scenarios: ['获得容积率奖励的项目', '政府主导的文化综合体', '地标性公共建筑'],
    synergies: ['vitality-ring', 'urban-public-space', 'gradient-open'],
    synergyNote: '返还空间与城市公共空间连成一体，公共效益最大化。',
  },

  // ---------- 建造效率 ----------
  {
    id: 'modular-build',
    name: '模块化建造',
    nameEn: 'Modular Construction',
    group: 'efficiency',
    tags: ['建造效率', '预制', '快速'],
    concept:
      '以标准化、可重复的空间模块在工厂预制、现场拼装，显著缩短工期、减少现场浪费并提升质量稳定性。模块单元同时赋予建筑清晰的秩序。',
    scenarios: ['酒店/公寓/宿舍等重复单元', '工期紧张项目', '施工条件受限场地'],
    synergies: ['prefab', 'light-build', 'core-skin'],
    synergyNote: '模块与标准化核心筒组合，重复单元与服务核心各得其所。',
  },
  {
    id: 'core-skin',
    name: '标准化核心筒 + 自由表皮',
    nameEn: 'Standard Core, Free Skin',
    group: 'efficiency',
    tags: ['建造效率', '核心筒', '自由度'],
    concept:
      '把交通、机电等服务高度整合为标准化、可复用的核心筒，外围则释放为自由平面与可变表皮。标准化内核保障效率，自由外层回应个性。',
    scenarios: ['高层办公与塔楼', '需复制产品线的开发商', '追求标志性立面项目'],
    synergies: ['structure-space', 'modular-build'],
    synergyNote: '核心筒与外挂结构协同，内部获得无柱自由空间。',
  },
  {
    id: 'prefab',
    name: '装配式集成',
    nameEn: 'Prefabricated Integration',
    group: 'efficiency',
    tags: ['建造效率', '装配', '集成'],
    concept:
      '将结构、围护、设备与装修集成为预制部品，以干法装配取代现场湿作业。集成度越高，现场越安静、快速、可控，全生命周期也更易维护。',
    scenarios: ['住宅产业化项目', '医院/酒店等集成度高建筑', '绿色施工示范工程'],
    synergies: ['modular-build', 'light-build'],
    synergyNote: '装配式与轻量低碳构件结合，兼顾速度、品质与减碳。',
  },
  {
    id: 'structure-space',
    name: '结构 - 空间一体化',
    nameEn: 'Structure-Space Integration',
    group: 'efficiency',
    tags: ['建造效率', '结构表现', '大跨'],
    concept:
      '让结构本身成为空间与形式，而非隐藏在饰面之后。结构构件同时完成跨度、秩序与表现，减少叠层构造并获得真实而有力的空间。',
    scenarios: ['大跨场馆与交通建筑', '高技派/结构表现建筑', '追求材料真实性的项目'],
    synergies: ['core-skin', 'shared-floor', 'growth-frame'],
    synergyNote: '一体化结构既是支撑也是骨架，为自由平面与后续生长奠基。',
  },
  {
    id: 'growth-frame',
    name: '可生长框架',
    nameEn: 'Open Growth Frame',
    group: 'efficiency',
    tags: ['建造效率', '可参与', '可生长'],
    concept:
      '只建造一个坚固、开放的结构框架与基本服务，把剩余填充留给使用者按需求与预算自行生长。框架保障底线，参与带来归属与增值。',
    scenarios: ['保障性与自建住房', '孵化型产业空间', '资源有限的社会住宅'],
    synergies: ['time-evolve', 'structure-space', 'modular-build'],
    synergyNote: '开放框架与分期演化结合，建筑随使用者需求长期增值。',
  },

  // ---------- 城市关系 ----------
  {
    id: 'facade-vitality',
    name: '界面活化',
    nameEn: 'Active Edge',
    group: 'urban',
    tags: ['城市关系', '街道活力', '首层'],
    concept:
      '以小开间、透明橱窗与活跃功能塑造连续友好的街道界面，让建筑首层服务于公共生活。积极的边界是街道安全与活力的来源。',
    scenarios: ['沿街商业与综合体', '需要激活的消极街道', '高密度城区更新'],
    synergies: ['vitality-ring', 'micro-weave', 'gray-space'],
    synergyNote: '灰空间为活跃界面遮阴避雨，街道活力得以全天候维持。',
  },
  {
    id: 'urban-public-space',
    name: '公共空间返还',
    nameEn: 'Public Space Return',
    group: 'urban',
    tags: ['城市关系', '开放空间', '公共性'],
    concept:
      '将部分用地以广场、公园或盖下空间的形式无条件还给城市，以空间的慷慨换取建筑的公共价值。好的返还空间会成为片区的城市客厅。',
    scenarios: ['高开发强度地块', '城市中心文化地标', '轨道上盖综合开发'],
    synergies: ['public-return', 'slow-stitch', 'gradient-open'],
    synergyNote: '返还空间经慢行网络与城市缝合，形成连续公共系统。',
  },
  {
    id: 'slow-stitch',
    name: '慢行缝合',
    nameEn: 'Slow-Mobility Stitching',
    group: 'urban',
    tags: ['城市关系', '步行', '缝合'],
    concept:
      '以连续宜人的步行与自行车道缝合被干道、铁路或水系割裂的区域，把障碍转化为线性公共空间。慢行优先重塑街区的可达与温度。',
    scenarios: ['干道/铁路分隔片区', '滨水与高架再利用', '步行城市与低碳交通项目'],
    synergies: ['micro-weave', 'urban-public-space'],
    synergyNote: '线性慢行空间串起针灸式微更新，织补效应被放大。',
  },
  {
    id: 'view-corridor',
    name: '视线通廊预留',
    nameEn: 'View Corridor',
    group: 'urban',
    tags: ['城市关系', '视廊', '秩序'],
    concept:
      '通过高度与布局控制预留通往自然、地标或历史轴线的视线通廊，维护城市整体空间秩序。通廊让建筑在更大的几何关系中找到位置。',
    scenarios: ['历史名城与轴线沿线', '临山滨水地块', '有高度管制的中心城区'],
    synergies: ['gradient-open', 'urban-public-space', 'courtyard-embed'],
    synergyNote: '视廊与开放空间对齐时，视觉通透与步行通透相互强化。',
  },
  {
    id: 'gradient-open',
    name: '临界面梯度开放',
    nameEn: 'Gradient Open Edge',
    group: 'urban',
    tags: ['城市关系', '过渡', '地景'],
    concept:
      '让建筑从私密内部向城市公共领域逐级、渐变地开放——借草坡、台阶、抬升屋面消解硬边界。地景式过渡使建筑与城市自然地咬合。',
    scenarios: ['滨水与公园相邻地块', '大型文化场馆', '需要柔化边界的大体量建筑'],
    synergies: ['boundary-penetrate', 'urban-public-space', 'public-return'],
    synergyNote: '梯度开放配合流线渗透，城市与建筑之间不再有截然的门槛。',
  },
];

export const strategyMap: Map<string, Strategy> = new Map(strategies.map((s) => [s.id, s]));

export const groupNameMap: Map<string, string> = new Map(
  strategyGroups.map((g) => [g.id, g.name]),
);

export function getGroupName(groupId: string): string {
  return groupNameMap.get(groupId) ?? groupId;
}

export function getStrategy(id: string): Strategy | undefined {
  return strategyMap.get(id);
}
