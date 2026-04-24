# arcory

Arcory 是一个面向「网站收藏 / 资源 / 案例 / 文章」的展示型项目。当前版本基于 Next.js 16、shadcn/ui 与一套自定义模式系统实现，首页已经重构为接近 [dany.works](https://dany.works/) 的三栏结构，同时保留了可复用的底层组件和 Notion 数据接入能力。

## 项目目标

- 用更克制的三栏布局承载网站列表与预览
- 把 `D / S / N / M / R / C` 做成一套可切换的页面状态系统，而不只是深浅色切换
- 保留可复用的底层组件能力，例如头像生成、空状态、媒体组件、模式容器与 chaos 交互
- 支持从 Notion 数据库同步站点数据、截图和分类结果

## 技术栈

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS v4
- shadcn/ui
- Radix UI
- matter-js
- sharp

## 本地开发

```bash
pnpm install
pnpm dev
```

默认访问地址：`http://localhost:3000`

常用命令：

```bash
pnpm build
pnpm lint
pnpm screenshots:promote
```

## 当前主页面

- 路由：`/`
- 结构：左侧品牌区 / 中间站点列表 / 右侧 hover 预览
- 文件：`app/page.tsx`
- 特征：窄中栏列表、固定预览区、模式切换、搜索、分类筛选

## 目录与职责

| 路径 | 说明 |
| --- | --- |
| `app/page.tsx` | 首页三栏布局、站点列表、hover 预览 |
| `app/layout.tsx` | 根布局、默认模式、全局字体注入 |
| `app/globals.css` | 全局 tokens、模式颜色、overlay 样式 |
| `components/site-mode-provider.tsx` | 模式状态、快捷键、视频层、chaos 模式 |
| `lib/notion-sync.ts` | Notion 拉取、缓存、备份、分类、去重 |
| `app/api/sites/route.ts` | 前端站点数据接口 |
| `app/api/notion/*` | 同步、截图代理、分类锁定相关接口 |
| `public/*.mp4` | 模式视频素材 |

## 核心可复用组件

这些底层组件仍然保留，README 也以“能力说明”方式保留，而不是只写页面结果。About 相关组件目前保留在仓库中，作为可复用媒体与展示模块，而不是当前首页信息架构的一部分。

| 组件 / 能力 | 文件 | 说明 |
| --- | --- | --- |
| `IdenticonAvatar` | `components/identicon-avatar.tsx` | 默认头像组件，支持多种 Bayer 变体 |
| `lib/identicon.ts` | `lib/identicon.ts` | 头像生成算法与变体定义 |
| `ListEmptyState` | `components/list-empty-state.tsx` | 分类空态与搜索空态复用 |
| `AboutCosmosAnimation` | `components/about-cosmos-animation.tsx` | About 顶部视频媒体组件 |
| `AboutGalaxyGrid` | `components/about-galaxy-grid.tsx` | About 图集展示组件 |
| `TextScramble` | `components/text-scramble.tsx` | 文本打散/扰动动效能力 |
| `HeroAsciiGrid` | `components/hero-ascii-grid.tsx` | 早期首页 Hero 动效组件，当前仍保留可复用 |
| `site-mode-provider` | `components/site-mode-provider.tsx` | 模式控制、键盘切换、overlay 与 chaos 逻辑 |
| shadcn UI 基础组件 | `components/ui/*` | 输入框、按钮、卡片、标签页等基础层 |

### 头像算法变体

实现文件：`lib/identicon.ts`

当前支持：

- `bayer-2x2`
- `bayer-4x4`
- `bayer-4x4-prod-hsl-triadic`
- `bayer-4x4-mono-oklch`

## 字体方案

当前已从 Geist Mono 切换到本地字体 `Fragment Mono`：

- 字体文件：`app/fonts/FragmentMono-Regular.ttf`
- 注入位置：`app/layout.tsx`
- token 映射：`app/globals.css`

技术路径：

- 使用 `next/font/local` 注入 `--font-fragment-mono`
- 在 `@theme inline` 中映射给 `--font-sans` 和 `--font-mono`
- 页面层优先通过 `font-sans` / `font-mono` 使用，而不是散落手写 `font-family`

## 模式系统

模式系统由 `SiteModeProvider`、`html.arcory-mode-*` 运行时类名、全局 design tokens、视频 overlay 和 chaos 交互组成。

### 运行机制

- 服务端默认输出 `day`，避免首屏没有模式类
- 客户端挂载后从 `localStorage("arcory-site-mode")` 读取上次选择
- 若本地没有保存值，则按 `prefers-color-scheme: dark` 回退到 `night` 或 `day`
- 每次切换时会统一更新：
  - `<html>` 上的 `arcory-mode-day / night / summer / midnight / rain`
  - `data-site-mode`
  - `.dark` 选择器钩子
- `.dark` 本身不存颜色，只用于命中 Tailwind / shadcn 的 `dark:*` 变体；真正的 token 都定义在 `html.arcory-mode-*`

### 快捷键

- `D`：day
- `S`：summer
- `N`：night
- `M`：midnight
- `R`：rain
- `C`：chaos

输入框、文本域、下拉框和 `contenteditable` 区域会自动跳过这些快捷键。

### Token 组织方式

`app/globals.css` 采用 shadcn / Tailwind v4 token 写法：

- `:root` 只保存 fallback token
- `@theme inline` 把 `--background / --card / --muted / --border ...` 映射为 `--color-*`
- 运行时颜色由 `html.arcory-mode-*` 接管
- `D / S / R` 属于浅色家族，`N / M` 属于暗色家族

### 各模式实现

#### D / N

- `D`：暖白纸张感底色，整体对比克制
- `N`：深灰黑底色，主要靠 `secondary / muted / border` 拉层级

#### S

- 使用真实视频层：`public/leaves.mp4`
- 关键样式：`position: fixed`、`object-fit: cover`、`mix-blend-mode: multiply`
- 目标：保留页面结构可读性，同时把树叶和光影压进背景层次

#### R

- 使用真实视频层：`public/rain.mp4`
- 关键样式：`mix-blend-mode: multiply`、`opacity`、`object-fit: cover`
- 目标：雨感主要来自视频本身，不靠大幅替换底色

#### M

- 使用真实视频层：`public/moon.mp4`
- 不走 `multiply`，而是依赖暗底与视频透明度建立月夜感
- 移动端会单独调整 `object-position`

#### C

- `C` 是 chaos 模式，不是普通主题切换
- 页面会被按“块级元素 + 词级文本”采样并复制到 `arcory-chaos-overlay`
- 复制层交给 `matter-js` 建立刚体、重力、摩擦和拖拽
- 再次触发时会执行回收与归位动画

### 为什么视频不会直接盖掉内容

关键不是单纯的 `z-index`，而是“视频层 + 混合模式 + 页面底色”一起工作：

- 视频层确实位于内容上方
- `S / R` 使用 `mix-blend-mode: multiply`
- multiply 会保留深色线条结构，同时让亮部更自然地融入背景
- 因此列表线条、搜索框边界和文字仍然可见，不会像普通半透明遮罩那样整块发灰

## Notion 数据接入

项目内置了 Notion 同步能力，支持站点信息、截图、分类结果和缓存回退。

### 环境变量

在根目录创建 `.env.local`：

```bash
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选：自动分类
OPENAI_API_KEY=sk-xxx
OPENAI_CLASSIFIER_MODEL=gpt-4.1-mini

# 可选：保护手动同步接口
NOTION_SYNC_SECRET=your-secret

# 可选：截图代理缓存
NOTION_SCREENSHOT_PROXY_CACHE_MS=1800000
NOTION_SCREENSHOT_PROXY_VALIDATE_MS=60000
NOTION_SCREENSHOT_PROXY_MAX_WIDTH=640
NOTION_SCREENSHOT_PROXY_WEBP_QUALITY=48
NOTION_SCREENSHOT_PROXY_WEBP_EFFORT=6

# 可选：运行时数据目录
ARCORY_DATA_DIR=/tmp/arcory-data
```

### API

| 接口 | 说明 |
| --- | --- |
| `GET /api/sites` | 返回前端站点数据 |
| `GET /api/notion/sync` | 查看同步状态 |
| `POST /api/notion/sync` | 触发同步 |
| `POST /api/notion/sync?force=1&reclassify=1` | 强制同步并全量重分类 |
| `GET /api/notion/screenshot?pageId=<id>` | 读取并压缩 Notion 截图 |
| `GET /api/notion/classification` | 查看分类锁定摘要 |
| `POST /api/notion/classification?action=lock` | 锁定分类结果 |
| `POST /api/notion/classification?action=unlock` | 解锁分类结果 |

配置了 `NOTION_SYNC_SECRET` 后，可通过以下任一方式鉴权：

- `x-sync-secret: <secret>`
- `Authorization: Bearer <secret>`

### 数据处理规则

#### 标题与去重

- 优先使用 Notion 自身的 `title`
- 标题缺失时，可回退网页标题或域名推断
- 同步阶段按规范化 URL 去重
- 冲突时优先保留编辑时间更晚、信息更完整的记录

#### 分类与子分类

- 分类优先级：手动分类 > AI 分类 > 规则关键词分类
- 子分类优先级：手动子分类 > 规则识别 > 数据集分析模型 > tags 回退 > `GENERAL`
- 锁定后，手动修正值会覆盖自动结果并写回锁定结果

#### 截图缓存

- 静态优先：`public/screenshot-cache/*.webp`
- 运行时缓存：`data/screenshot-cache/`
- 同步缓存：`data/notion-sites-cache.json`
- 备份快照：`data/notion-sites-backup.json`

### 推荐流程

1. 强制同步并重分类
2. 检查分类摘要
3. 锁定分类结果
4. 如需调整，再解锁后重跑
5. 如果更新了截图，执行 `pnpm screenshots:promote`

## 参考链接

- shadcn/ui: [https://ui.shadcn.com/](https://ui.shadcn.com/)
- dany.works: [https://dany.works/](https://dany.works/)
- identicon prototype: [https://identicon-prototype.labs.vercel.dev/](https://identicon-prototype.labs.vercel.dev/)
- Hero 动效参考: [https://hackathon.polar.sh/](https://hackathon.polar.sh/)
