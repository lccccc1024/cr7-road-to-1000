# CR7 · 千球之路 Road to 1000

Cristiano Ronaldo 千球里程碑实时进度追踪页。统计其成年队正式比赛生涯进球，距 1000 球的实时进度。

**在线访问：https://cr7.950922.xyz/**（GitHub Pages 托管 + 自定义域名）

## 功能

- 大字号进球计数 + 进度条（刻度 500/700/800/900/1000）
- 进球分布、里程碑时间线、最近进球记录
- **自动同步**：GitHub Actions 每 6 小时抓取一次追踪站数据，有更新自动提交并重新部署（所有访客看到同一份数据）
- 手动能力：页面底部可 `+1` 记录进球（存访客浏览器 localStorage）

## 技术

- 纯静态 HTML/CSS/JS，无构建步骤，GitHub Pages 直接部署
- 数据源：`data.js`（仓库即数据库）
- 自动同步：`.github/workflows/auto-sync.yml` + `sync-goals.js`
- 自定义域名：`cr7.950922.xyz`（DNS CNAME → `lccccc1024.github.io`）

## 如何更新数据

| 方式 | 说明 |
| --- | --- |
| 自动（推荐） | Actions 每 6 小时抓取一次，自动提交并部署 |
| 手动 | 同时更新 `data.js` 的 `total`、`breakdown`、`recentGoals` 和 `updatedAt` 后提交，或页面里点 `+1`（仅本人浏览器可见） |
| 手动触发同步 | 仓库 → Actions → auto-sync-goal-data → Run workflow |

## 数据来源

公开统计站点 theroadto1000goals.com / goalnigeria.com。非官方，仅供球迷参考，可能有口径差异。
## 部署与验证

在仓库 Settings → Pages → Build and deployment 中将 Source 设为 **GitHub Actions**，保留已有自定义域名设置。工作流使用官方 Pages artifact/deploy actions 显式部署，不依赖机器人提交触发构建。

默认分支推送会测试并部署；定时和手动运行会先同步、提交，再部署。其他分支及 PR 仅运行测试。同步失败会让任务失败并保留原数据，避免发布不完整统计。

本地验证：`node --test`（Node.js 22 或以上）。

## 数据一致性

- 总数支持 1000 及之后的进球（输入校验上限 10000）；达到目标后展示“已达成”。
- 同步要求 CSV 与来源总数一致，编号从 1 连续且无重复；缺失、重复、滞后或超前均报错，不写入部分数据。总数未变仍会核对并修复明细。
- 页面“校验来源总数”只报告外部来源数字，不改写页面数据。
- 手动记录仅对当前浏览器生效，以整份仓库数据为版本标识。仓库内容变化后本地记录自动重置，避免旧快照覆盖官方更新；旧版缓存也会重置。请勿将本地记录作为长期存档。
- 出场、助攻和场均进球是独立快照，由 `statsUpdatedAt` 标注日期；同步进球不会假装更新这些指标。维护这些指标时需一起更新日期。

只读检查真实数据源：`node sync-goals.js --dry-run`。同步会验证 CSV 必需列、日期、非空对手与类型、唯一连续编号，并在主来源滞后或与 CSV 不一致时尝试备用来源。未知进球类型保留原文，不推断为运动战进球。测试使用固定样例，独立校验仓库数据结构；不会依赖当前进球数。

手动记录日期使用浏览器本地日历日期；仓库同步日期采用 UTC。

历史里程碑核对来源：[500 球（UEFA）](https://www.uefa.com/uefachampionsleague/news/0225-0e91f313b368-03511d3650be-1000/)、[700 球（UEFA）](https://www.uefa.com/european-qualifiers/news/0256-0dbc2aca2fb4-c5f81a0faead-1000--ukraine-book-finals-spot-france-made-to-wait/)。历史里程碑不从 CSV 编号自动推导；外部 CSV 历史记录存在口径或内容异常，结构校验不能证明赛事事实真实。页面明确标注非官方来源。
