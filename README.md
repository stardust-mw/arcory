# arcory

Arcory 是一个面向「网站收藏 / 资源 / 案例 / 文章」的展示型项目。当前版本基于 Next.js 16、shadcn/ui 和一套可迁移的页面模式系统实现，首页已经重构为接近 [dany.works](https://dany.works/) 的三栏结构，同时保留了 Notion 数据接入和一批可复用的底层组件。

## 项目概览

- 首页采用三栏布局：左侧分类树，中间网站列表，右侧 hover / focus 预览。
- 主题不是传统 light / dark，而是一套 `D / S / N / M / R / C` 页面模式系统。
- 网站数据以 Notion 原始库为维护源，前端展示、分类和截图同步都围绕这条链路展开。
- 仓库里仍保留了一批底层可复用组件，而不只是当前首页所需代码。

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

安装并启动：

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

如果需要接入 Notion，同步前还要补充 `.env.local`。

## 当前首页

- 路由：`/`
- 主文件：`app/page.tsx`
- 结构：左侧品牌与分类导航 / 中间网站列表 / 右侧网站预览
- 交互：网站列表支持 hover 与 keyboard focus 两套互斥预览状态
- 快捷键：鼠标进入网站列表区域后，`↑ / ↓ / ← / →` 才接管网站切换
- 状态恢复：当前主分类、子分类和展开状态会写入 `sessionStorage`，刷新后尽量恢复到原筛选上下文

## 目录与职责

| 路径 | 说明 |
| --- | --- |
| `app/page.tsx` | 首页三栏布局、分类树、站点列表、预览区 |
| `app/layout.tsx` | 根布局、默认模式、首屏快捷键缓冲脚本、全局字体注入 |
| `app/globals.css` | 全局 tokens、模式颜色、divider / input / overlay 样式 |
| `components/site-mode-provider.tsx` | 模式状态、快捷键切换、自动模式初始化、chaos 模式 |
| `components/site-mode-atmosphere.tsx` | 模式视频层组件，负责加载、播放、暂停和重置 |
| `lib/site-mode.ts` | 模式类型、快捷键映射、运行时类名、视频配置、自动模式策略 |
| `lib/notion-sync.ts` | Notion 拉取、缓存、截图、分类与同步整理 |
| `app/api/sites/route.ts` | 前端站点数据接口 |
| `app/api/notion/*` | Notion 同步、截图代理、分类锁定相关接口 |
| `public/*.mp4` | 模式视频素材 |

## 模式系统

这套实现已经拆成了“配置层 + provider 层 + atmosphere 组件 + CSS token 层”，后续换项目时，优先复用这四层即可。

### 分层结构

| 层级 | 文件 | 职责 |
| --- | --- | --- |
| 配置层 | `lib/site-mode.ts` | 定义 `SiteMode`、快捷键映射、`html` 类名、dark family 判断、视频配置 |
| 运行时控制层 | `components/site-mode-provider.tsx` | 管理 mode state、首屏恢复、快捷键切换、chaos 触发和 context 暴露 |
| 视频层 | `components/site-mode-atmosphere.tsx` | 按当前模式加载、播放、暂停并重置单个 atmosphere video |
| 样式层 | `app/globals.css` | 通过 `html.arcory-mode-*` 接管 tokens，并定义 overlay 的混合模式、透明度和定位 |

### 模式切换链路

1. 服务端先输出 `html.arcory-mode-day`，保证首屏 HTML 已带默认 tokens。
2. `app/layout.tsx` 在 hydration 前注入快捷键缓冲脚本。
3. 如果页面尚未 hydration 用户就按下 `d / s / n / m / r / c`，按键和时间戳会先写入 `sessionStorage("arcory-pending-shortcut")`。
4. `SiteModeProvider` 挂载后优先读取当天是否仍有效的手动覆盖。这个值保存在 `localStorage("arcory-site-mode")`，结构是 `{ mode, expiresAt }`。
5. 如果存在有效的 pending shortcut 或当天手动覆盖，就直接使用这个模式；否则先按当前时间给一个基线模式：白天 `D`、傍晚/清晨 `N`、深夜 `M`。
6. 在没有手动覆盖时，Provider 会先检查浏览器地理位置权限；只有权限已经是 `granted` 时，才静默读取定位并通过 open-meteo 获取天气，再把时间基线修正到更合适的模式，例如晴热白天进入 `S`，下雨白天进入 `R`。
7. 如果用户触发的是 `C`，页面准备好后会补触发一次 chaos。
8. 每次模式切换都会统一调用 `applySiteMode()`，同步更新 `<html>` 上的 `arcory-mode-*` 类名、`data-site-mode` 和 `.dark` 选择器钩子。

### 默认进入规则

- 第一次打开，没有手动记录时：先按时间进入 `D / N / M`，再由天气修正到 `S / R / N / M / D` 中更合适的一个。
- 用户手动按下 `D / S / R / N / M` 后：该选择会被记为“当天有效的手动覆盖”。
- 当天再次关闭重开：优先使用这个手动覆盖。
- 第二天再打开：昨天的手动覆盖自动失效，系统重新按时间和天气判断。
- 当前实现不会为了自动模式主动弹出浏览器位置授权框；如果用户从未授予过位置权限，会直接回退到时间基线模式。

### 为什么同时保留 `html.arcory-mode-*` 和 `.dark`

- `html.arcory-mode-*` 才是真正持有颜色 tokens 的地方，例如 `--background`、`--card`、`--muted`、`--border`、`--divider`。
- `.dark` 只是 shadcn / Tailwind `dark:*` 语法的选择器钩子，本身不存主题颜色。
- 也就是说，这套方案不是“只有 `:root` 和 `.dark`”的普通深浅色模式，而是由 `html.arcory-mode-*` 接管真实配色，`.dark` 只负责兼容既有语法。

### 视频氛围层策略

- 视频不是页面流里的普通背景，而是一层固定定位的 atmosphere overlay。
- `SiteModeProvider` 统一渲染各模式的视频层，例如 `summer -> /leaves.mp4`、`midnight -> /moon.mp4`、`rain -> /rain.mp4`。
- `SiteModeAtmosphere` 负责单个视频的生命周期：命中当前模式时检查 `readyState` 并播放，模式切走时 `pause()`、`currentTime = 0` 并清掉 ready 状态。
- CSS 决定视频怎么融进页面：位置、透明度、`mix-blend-mode`、`object-fit`、`object-position`。

### 各模式分工

- `D`：默认白天基准模式，作为浅色设计母版。
- `N`：默认夜间基准模式，作为暗色设计母版。
- `S`：沿用 `D` 的底色家族，再叠加 `leaves.mp4` 和 `multiply`。
- `R`：沿用 `D` 的底色基准，再叠加 `rain.mp4` 和 `multiply`。
- `M`：沿用暗色家族，用 `moon.mp4` 叠加月夜氛围，不使用 `multiply`。当前透明度为 `0.4`。
- `C`：不是 token 主题，而是对当前页面做一次瞬时物理打散。

### 为什么 `S / R` 用 `multiply`，`M` 不用

- `S` 和 `R` 都属于浅底模式，视频需要压进背景里，而不是盖住文字和分割线，所以采用 `mix-blend-mode: multiply`。
- 这样能保住深色线条、边框和文字结构，也能让视频亮部自然融进浅底。
- `M` 是暗底模式，如果再叠 `multiply`，页面会更闷、更糊，文字对比也更容易掉下去，所以它主要依赖暗底 tokens、视频透明度和位置控制氛围。

### 列表交互与筛选恢复

- 鼠标进入网站列表区域后，`↑ / ↓ / ← / →` 才会接管当前网站切换。
- keyboard focus 和 mouse hover 互斥：键盘接管时，右侧 preview 只响应当前 focus；鼠标重新移动到列表项上时，会取消上一条 focus 状态并切回 hover 预览。
- focus 行会补一层更轻的背景和细边框，并覆盖自身上下分割线，让“当前项”比普通 hover 更稳定。
- 当前 `activeCategory / activeSubcategory / expandedCategories` 会写入 `sessionStorage`，刷新后优先恢复；恢复后的合法性校验会等待首轮站点数据稳定后再进行，避免子分类被过早清掉。

### Chaos 模式边界

- `C` 模式当前仍保留在 `SiteModeProvider` 中，因为它强依赖当前页面 DOM 结构采样。
- 它会读取三栏分割线、列表行、logo、预览区、空态等节点，再交给 `matter-js` 做重力、碰撞和拖拽。
- 桌面端优先按三栏结构采样，文本会拆成词级 span，分割线会单独抽成 separator 刚体。
- 退出 chaos 时，会把元素缓动归位并恢复 DOM。
- 因此它更像“页面交互引擎”，而不是一个纯主题组件；换项目时建议优先复用 `D / S / N / M / R`，再按新页面结构重新适配 `C`。

### 迁移到新项目的最小步骤

1. 复制 `lib/site-mode.ts`。
2. 复制 `components/site-mode-atmosphere.tsx`。
3. 复制 `components/site-mode-provider.tsx`，先只保留 mode state、快捷键和 atmosphere 部分；如果新页面结构完全不同，可以先临时注释 chaos 采样逻辑。
4. 在新项目的 `layout` 里加入 hydration 前的 pending shortcut 脚本。
5. 在全局 CSS 中建立 `:root` fallback tokens、`html.arcory-mode-*` tokens、`.dark` selector hook 和 overlay class。
6. 把视频素材放到 `public/`，并保证 `src` 与配置一致。
7. 用 provider 包住页面内容。
8. 最后再按新项目布局微调 `object-position`、`opacity`、`mix-blend-mode` 以及哪些元素应处于视频之上或之下。

### 迁移时最容易踩的坑

- 只复制 `.dark`，不复制 `html.arcory-mode-*`，会导致 mode 切了但 tokens 没变。
- 把视频直接塞进页面流里，而不是 fixed overlay，会让布局和滚动一起乱掉。
- 忘记在模式切走时 `pause()` 和 `currentTime = 0`，会导致回切时出现跳帧或沿用旧帧。
- 在暗底模式里盲目使用 `multiply`，容易把文字对比打没。
- 如果要保留“系统默认自动，手动当天有效”的体验，不能只存一个纯字符串模式值，最好同时存过期时间。
- 新项目如果没有和当前页面相同的 DOM 标记类，chaos 逻辑不能直接照搬。

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
NOTION_SCREENSHOT_PROXY_WEBP_QUALITY=68
NOTION_SCREENSHOT_PROXY_WEBP_EFFORT=6

# 可选：运行时数据目录
ARCORY_DATA_DIR=/tmp/arcory-data
```

### 数据处理规则

- 标题优先使用 Notion 自身的 `title`。
- 标题缺失时，可回退网页标题或域名推断。
- 当前前端展示数据以 Notion 原始库为准，不主动按 URL 折叠同站点条目。
- 同步链路会尽量保留原始记录数量，方便直接以 Notion 作为唯一维护源。
- 分类优先级：手动分类 > AI 分类 > 规则关键词分类。
- 子分类优先级：手动子分类 > 规则识别 > 数据集分析模型 > tags 回退 > `GENERAL`。
- 锁定后，手动修正值会覆盖自动结果并写回锁定结果。

### 截图与缓存

- 静态优先：`public/screenshot-cache/*.webp`
- 运行时缓存：`data/screenshot-cache/`
- 同步缓存：`data/notion-sites-cache.json`
- 备份快照：`data/notion-sites-backup.json`

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

### 推荐同步流程

1. 强制同步并重分类。
2. 检查分类摘要。
3. 锁定分类结果。
4. 如需调整，再解锁后重跑。
5. 如果更新了截图，执行 `pnpm screenshots:promote`。

## 可复用组件与资产

README 保留这部分，是为了让后续接手时还能快速复用已有能力，而不是只看到首页布局结果。

### 核心组件

| 组件 / 能力 | 文件 | 说明 |
| --- | --- | --- |
| `IdenticonAvatar` | `components/identicon-avatar.tsx` | 默认头像组件，支持多种 Bayer 变体 |
| `lib/identicon.ts` | `lib/identicon.ts` | 头像生成算法与变体定义 |
| `ListEmptyState` | `components/list-empty-state.tsx` | 分类空态与搜索空态复用 |
| `AboutCosmosAnimation` | `components/about-cosmos-animation.tsx` | About 顶部视频媒体组件 |
| `AboutGalaxyGrid` | `components/about-galaxy-grid.tsx` | About 图集展示组件 |
| `TextScramble` | `components/text-scramble.tsx` | 文本打散 / 扰动动效能力 |
| `HeroAsciiGrid` | `components/hero-ascii-grid.tsx` | 早期首页 Hero 动效组件，当前仍保留可复用 |
| `SiteModeProvider` | `components/site-mode-provider.tsx` | 模式控制、键盘切换、chaos 逻辑与上下文 |
| `SiteModeAtmosphere` | `components/site-mode-atmosphere.tsx` | 单个模式视频层的生命周期组件 |
| shadcn UI 基础组件 | `components/ui/*` | 输入框、按钮、卡片、标签页等基础层 |

### 字体方案

当前已从 Geist Mono 切换到本地字体 `Fragment Mono`：

- 字体文件：`app/fonts/FragmentMono-Regular.ttf`
- 注入位置：`app/layout.tsx`
- token 映射：`app/globals.css`
- 使用方式：通过 `next/font/local` 注入 `--font-fragment-mono`，再在 `@theme inline` 中映射给 `--font-sans` 和 `--font-mono`

### 头像算法变体

实现文件：`lib/identicon.ts`

当前支持：

- `bayer-2x2`
- `bayer-4x4`
- `bayer-4x4-prod-hsl-triadic`
- `bayer-4x4-mono-oklch`

## 参考链接

- shadcn/ui: [https://ui.shadcn.com/](https://ui.shadcn.com/)
- dany.works: [https://dany.works/](https://dany.works/)
- identicon prototype: [https://identicon-prototype.labs.vercel.dev/](https://identicon-prototype.labs.vercel.dev/)
- Hero 动效参考: [https://hackathon.polar.sh/](https://hackathon.polar.sh/)
