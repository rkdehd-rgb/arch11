import { create } from 'zustand';
import type { TaskBrief } from '../types';

const STORAGE_KEY = 'archreason.task';

export const EMPTY_TASK: TaskBrief = {
  projectName: '',
  location: '',
  siteArea: '',
  grossArea: '',
  far: '',
  buildingType: '',
  demands: [],
  content: '',
};

export const EXAMPLE_TASK: TaskBrief = {
  projectName: '云栖谷社区文化中心',
  location: '浙江省杭州市西湖区',
  siteArea: '18600',
  grossArea: '34500',
  far: '1.85',
  buildingType: '文化场馆',
  demands: ['绿色低碳', '在地文化', '复合业态', '全龄友好'],
  content: `一、项目背景
本项目位于杭州西溪湿地南侧，场地北临城市主干道，南侧为现状河道与慢行绿道，东西两侧为已建成的居住社区。基地内地势平坦，东南角保留有一组原有村落肌理与十余株成年香樟，希望在新建设中予以尊重与延续。

二、建设规模
总用地面积约 1.86 公顷，总建筑面积约 3.45 万平方米，容积率不大于 1.85，建筑高度不超过 36 米，绿地率不低于 35%。地下设置机动车库及设备用房，地上以 2-5 层多层体量为主。

三、功能配置
1. 社区文化活动中心：含 800 座多功能剧场、展厅、非遗工坊、图书阅览与青少年活动空间；
2. 社区服务中心：含一站式服务大厅、老年日间照料、托育与卫生服务站；
3. 配套商业：以咖啡、轻餐、文创零售为主，服务社区及湿地游客；
4. 面向社区与城市开放的公共广场、庭院与屋顶花园。

四、核心诉求
1. 绿色低碳：希望达到绿色建筑二星级以上，充分利用自然采光通风，探索光伏与海绵城市措施，降低长期运营能耗；
2. 在地文化：延续江南水乡与西溪村落的空间意象，使用本地材料，避免与周边环境割裂的“方盒子”；
3. 复合业态：文化、服务与商业功能在时间与空间上复合，形成全天候的社区活力场所；
4. 全龄友好：为儿童、青少年、老年人及残障人士提供安全、便捷、可交往的无障碍环境。

五、设计要求
建筑应处理好与北侧城市道路、南侧河道绿道的关系，组织清晰的人车流线；注重室内外空间的渗透，塑造多个尺度宜人的庭院与灰空间；方案需具备一定的标志性，但更强调与社区日常生活的融合。`,
};

function loadTask(): TaskBrief {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY_TASK, ...(JSON.parse(raw) as Partial<TaskBrief>) };
  } catch {
    // ignore
  }
  return EMPTY_TASK;
}

interface TaskState {
  task: TaskBrief;
  update: (patch: Partial<TaskBrief>) => void;
  fillExample: () => void;
  reset: () => void;
  toggleDemand: (demand: string) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  task: loadTask(),
  update: (patch) => {
    const next = { ...get().task, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ task: next });
  },
  fillExample: () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(EXAMPLE_TASK));
    set({ task: EXAMPLE_TASK });
  },
  reset: () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(EMPTY_TASK));
    set({ task: EMPTY_TASK });
  },
  toggleDemand: (demand) => {
    const current = get().task.demands;
    const next = current.includes(demand)
      ? current.filter((d) => d !== demand)
      : [...current, demand];
    get().update({ demands: next });
  },
}));
