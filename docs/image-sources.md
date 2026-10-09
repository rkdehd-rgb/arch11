# 案例库配图 · 外站图源实测报告

> 日期：2026-10-09 ｜ 目的：为 ArchReason 案例库更换"非 wiki"的配图兜底源
> 实测环境：WorkBuddy 沙箱（Git Bash + curl/node fetch），逐站实测，非推测

## 一、为什么要换掉 Wikimedia

原设计是 `image`（gooood 实拍）→ `imageWiki`（Wikimedia 兜底）两级回退。实测发现：

| 目标 | 结果 |
|---|---|
| `commons.wikimedia.org` / `upload.wikimedia.org` | **000 连接失败** |
| `commons.m.wikimedia.org`（移动站） | 000 |
| `api.wikimedia.org`（官方 API） | 000 |
| `www.wikidata.org` | 000 |
| WebFetch 工具访问 commons API | fetch failed |

**结论：Wikimedia 全系在当前环境不可达**，且无法预先验图 —— 等于这条兜底链形同虚设，必须换。

## 二、实测维度

对每个站点测三项，缺一不可：

1. **可达性** —— HTTP 状态（`403` 代表服务器已回话=可达，只有 `000` 才是真被拦）
2. **能否程序化检索** —— 站内搜索页是否服务端渲染，能否直接解析出「项目链接 + 封面图」（JS 渲染的取不到）
3. **图片能否直链** —— 取真实图片 URL 做 HTTP + 文件头魔数校验，并测**无 Referer 时是否 403**（防盗链）

## 三、实测结果

### ✅ 可用（推荐）

| 站点 | 可达 | 站内检索 | 图片直链 | 定位与特点 |
|---|---|---|---|---|
| **gooood.cn**（已有主源） | 200 | ✔ 可解析 | ✔ **免 Referer** | 中文；中国项目 + 知名国际项目，更新快 |
| **有方 archiposition.com** | 200 | ✔ 可解析（`search-article-item`） | ✔ 但**需 Referer**（无 Referer 返回 403） | 中文；深度报道、观点文多，中国项目强 |
| **建筑学院 archcollege.com** | 200 | ✔ 可解析 | ✔ **免 Referer** | 中文；项目库体量大，老项目也能找到 |
| **divisare.com** | 200 | ✔ 可解析 | ✔ **免 Referer** | 英文；建筑专业图库，**摄影质量最高**，按事务所/项目组织 |
| **archdaily.cn**（ArchDaily 中文站） | 200 | ✗ **搜索无效**（返回默认内容，非搜索结果） | ✔ 可直链 | 覆盖最全；**但只能靠外部检索定位项目页**，不能站内搜 |

### ❌ 不可用

| 站点 | 原因 |
|---|---|
| architizer.com / archello.com / world-architects.com / domusweb.it | **Cloudflare 拦截**（返回 "Just a moment..." 盾页） |
| dezeen.com | 站内搜索走 **Algolia（JS 渲染）**，HTML 里只有侧栏推荐，取不到结果 |
| designboom.com / wallpaper.com | 站内搜索无法解析；且非建筑专站 |
| 一起设计 together-design.com / 搜建筑 sojianzhu.com | 000 / 连接失败 |
| **Openverse**（CC 授权聚合 API） | `api.openverse.org` fetch failed |

## 四、三档可选方案

**方案 A｜中文双源（推荐）**
`gooood` + `有方` + `建筑学院`
- 优点：中文站检索稳定、**中国与亚洲项目覆盖最好**、图可直接用
- 注意：有方的图需经服务端代理带 Referer（项目现有 `/api/case-image` 机制可复用）
- 适合：案例库里中国项目占比高的情况

**方案 B｜国际专业图库**
`divisare`
- 优点：图质最高（专业建筑摄影）、免 Referer、按事务所归档精准
- 缺点：英文站，中国中小项目少
- 适合：偏重国际经典案例、要出图质量的场景

**方案 C｜全都要（覆盖最大化）**
`gooood` 主 → `有方`/`建筑学院` → `divisare` → `archdaily.cn` 四级回退
- 覆盖最广，但实现与维护成本最高；`archdaily.cn` 需逐个用外部检索定位，速度慢

## 五、版权提示（重要）

上面除 Openverse/Wikimedia 外的站点，**图片版权属于摄影师或事务所**，不是自由许可。

- 用作**案例学习/内部参考**并标注来源，属行业惯例；
- 若案例库要**对外商用或公开发布**，建议逐张确认授权，或改用可商用图库；
- 这也是原来走 Wikimedia（CC 许可）的原因 —— 换源的收益是**图好看、覆盖广**，代价是**版权注意义务上升**。

## 六、接入结果（已实施）

| 项 | 结果 |
|---|---|
| 服务端多源代理 | 新增 `server/routes/case-image.ts`：图源白名单 + 按源站注入 Referer + 图片魔数校验 + 60s 缓存 |
| 前端代理识别 | `src/services/strategyPool.ts` 的 `toDisplayUrl` 扩为 6 源白名单 |
| 批量检索 | 新增 `scripts/fetch-case-images-multi.mjs`（gooood → 有方 → 建筑学院 → divisare） |
| 检索命中 | 159 条待配图 → **35 条候选** |
| 人工核验后保留 | **11 条**（误配率约三分之二） |
| 案例库有图总数 | **105 / 253** |
| 端到端验证 | 有方防盗链图经代理返回 200；非白名单域名返回 403 |

**关键结论：多源提升了召回，但没有解决误配。**

中文站的搜索结果经常是"相关文章 / 店铺 / 展览 / 在建方案"，而非项目本身：

- `Powerhouse Kjørbo` → 匹配到「Powerhouse Telemark」（同一事务所、同国家，但是另一个项目）
- `难波公园` → 匹配到「JINS难波公园店」（商场里的一家店）
- `中国美院象山校区` → 匹配到一张**活动海报**（大字压在照片上）
- `Sky Habitat`（新加坡）→ 匹配到「秦皇岛海碧台二期」（同一事务所的另一个项目）

所以自动匹配只能用来**产出候选**，**人工审读标题 + 逐图目视核验**这一步不可省略 —— 本轮抽查 10 张就有 2 张不合格。

---

### 附：实测脚本

`scripts/probe-sources.mjs`（通用探测）、`probe-sources3.mjs`（有方/dezeen/divisare）、`probe-sources5.mjs`（archdaily.cn）
