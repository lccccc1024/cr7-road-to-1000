# CR7 · 千球之路 Road to 1000

Cristiano Ronaldo 千球里程碑实时进度追踪页。统计其成年队正式比赛生涯进球，距 1000 球的实时进度。

## 功能

- 大字号进球计数 + 进度条（刻度 500/700/800/900/1000）
- 进球分布、里程碑时间线、最近进球记录
- **自动同步**：GitHub Actions 每 6 小时抓取一次追踪站数据，有更新自动提交并重新部署（所有访客看到同一份数据）
- 手动能力：页面底部可 `+1` 记录进球（存访客浏览器 localStorage）

## 技术

- 纯静态 HTML/CSS/JS，无构建步骤，GitHub Pages 直接部署
- 数据源：`data.js`（仓库即数据库）
- 自动同步：`.github/workflows/auto-sync.yml` + `sync-goals.js`

## 如何更新数据

| 方式 | 说明 |
| --- | --- |
| 自动（推荐） | Actions 每 6 小时抓取一次，自动提交并部署 |
| 手动 | 改 `data.js` 里 `total` 和 `updatedAt` 后提交，或页面里点 `+1`（仅本人浏览器可见） |
| 手动触发同步 | 仓库 → Actions → auto-sync-goal-data → Run workflow |

## 数据来源

公开统计站点 theroadto1000goals.com / goalnigeria.com。非官方，仅供球迷参考，可能有口径差异。