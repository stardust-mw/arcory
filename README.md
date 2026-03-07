# Arcory

Arcory 是一个面向「网站收藏 / 文章 / 插件 / 案例」的展示型项目，当前基于 Next.js + shadcn/ui 实现。

## 技术栈

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS v4
- shadcn/ui
- Radix UI
- tw-animate-css

## 主要组件

| 组件 | 文件 | 说明 |
| --- | --- | --- |
| HeroAsciiGrid | `components/hero-ascii-grid.tsx` | 首页 Hero ASCII 动态背景（20x11 网格 + 波动动画） |
| IdenticonAvatar | `components/identicon-avatar.tsx` | 默认头像组件，支持 Bayer 2x2 / 4x4 等变体 |
| ListEmptyState | `components/list-empty-state.tsx` | 列表空状态组件，可按分类动态复用（如 `SYSTEM`） |
| Input（shadcn） | `components/ui/input.tsx` | 搜索输入框基础组件 |

## 头像算法能力

实现文件：`lib/identicon.ts`

支持的变体：

- `bayer-2x2`
- `bayer-4x4`
- `bayer-4x4-prod-hsl-triadic`
- `bayer-4x4-mono-oklch`

默认头像在列表中通过 `IdenticonAvatar` 调用并渲染为圆形 20px。

## 组件参考链接

- shadcn/ui: [https://ui.shadcn.com/](https://ui.shadcn.com/)
- identicon 原型参考: [https://identicon-prototype.labs.vercel.dev/](https://identicon-prototype.labs.vercel.dev/)
- Hero 动效参考: [https://hackathon.polar.sh/](https://hackathon.polar.sh/)

## 本地运行

```bash
pnpm install
pnpm dev
```

默认访问地址：`http://localhost:3000`

## Notion 数据接入

项目已内置 Notion 同步能力，支持“新增 / 修改 / 删除（归档）”同步到本地缓存，并自动分类。
当 Notion 中 `title` 为空时，会尝试基于网站上下文自动补全标题（优先网页 `<title>/og:title`，其次域名推断）。
同步成功后会按小时写入备份快照；当 Notion 请求失败时，优先回退到「约 3 小时前」的快照数据展示。

### 1) 环境变量

在项目根目录创建 `.env.local`：

```bash
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选：自动分类（启用 AI 分类器）
OPENAI_API_KEY=sk-xxx
OPENAI_CLASSIFIER_MODEL=gpt-4.1-mini

# 可选：保护手动同步接口
NOTION_SYNC_SECRET=your-secret
```

### 2) API 能力

- `GET /api/sites`：返回前端使用的数据
  - 若 Notion / 备份可用，返回对应数据
  - 不再回退本地占位数据；不可用时返回空数组（前端展示 loading/空态）
- `GET /api/notion/sync`：查看同步状态
- `POST /api/notion/sync`：触发同步（支持 `?force=1` 或 body `{ "force": true }`）
- `POST /api/notion/sync?force=1&reclassify=1`：强制同步并全量重分类（当你调整了分类规则、子分类推断策略时使用）
- `GET /api/notion/classification`：查看分类锁定状态
- `POST /api/notion/classification?action=lock`：确认当前分类结果并“固定”
- `POST /api/notion/classification?action=unlock`：解除固定，恢复自动分类/子分类

当设置了 `NOTION_SYNC_SECRET` 后，同步接口需鉴权：

- Header `x-sync-secret: <secret>`，或
- Header `Authorization: Bearer <secret>`

### 3) 同步缓存

- 缓存文件：`data/notion-sites-cache.json`
- 备份快照：`data/notion-sites-backup.json`（按小时保留，默认保留 14 天）
- 已在 `.gitignore` 中忽略，不会提交到仓库

### 4) 生成规则（标题 / 去重 / 分类）

#### 标题生成规则

- 优先使用 Notion 自身 `title` 字段（若为空则继续降级）。
- 若设置 `NOTION_TITLE_FETCH=true`：尝试抓取网页 `og:title` / `twitter:title` / `<title>`。
- 仍为空时，按 URL 域名推断标题（如 `ui.shadcn.com` -> `Ui · Shadcn`）。
- 对弱标题做增强（例如 `Ui` / `App` / `Chat` 这类过短或通用标题）：
  - 会追加域名语义，减少视觉上“重复标题”的问题。

#### 去重规则（按 URL）

- 同步阶段按 URL 进行去重（规范化 host/path/search 后比较）。
- 同 URL 冲突时保留“更优”记录，优先级：
  - `lastEditedTime` 更新更晚
  - 信息质量更高（标题完整、手动分类/子分类、tags、notes、clicks 等）
  - 若仍相同则按 page id 稳定选择

#### 分类与子分类规则

- 分类优先级：手动分类 > AI 分类（配置 `OPENAI_API_KEY`）> 规则关键词分类。
- 子分类优先级：手动子分类 > 规则语义识别（如 `AI`/`ICON`/`FONT`）> 数据集分析模型（按分类聚合站点 token）> tags 回退 > `GENERAL`。
- 子分类模型为“真实数据驱动”：
  - 从 `domain/path/tags/title/notes` 提取 token 并加权。
  - 仅保留满足阈值的 token（默认至少出现在 2 条站点记录且总权重 >= 8）。
  - 过滤单字符、纯数字和过泛词（如 `WORK`、`GENERAL`、`RESOURCES` 等噪音 token）。
  - 每条站点在候选 token 中按分数选择最优子分类，低于阈值则回退到 `tags` 或 `GENERAL`。
- `meta` 生成：优先取前 1-2 个 tags，否则使用 `域名token•category`。

#### 分类固定（确认后）

- 你确认分类结果后，调用 `POST /api/notion/classification?action=lock`。
- 固定后，已锁定 URL 会优先使用锁定的 `category/subcategory`，不会被自动策略反复改写。
- 固定后新增 URL 也会自动写入锁文件，后续同步不会被自动策略反复改写。
- 后续你在 Notion 中手动改 `分类/子分类` 时，会覆盖并更新锁定结果（用于手动修正）。
- `GET /api/notion/classification` 会返回当前分类摘要（每个分类下子分类分布），用于你确认后再 lock。

### 5) 推荐操作流程（分类确认 -> 固定）

1. 强制同步并重分类（拿到最新分类结果）

```bash
curl -X POST "http://localhost:3000/api/notion/sync?force=1&reclassify=1"
```

2. 查看分类摘要（确认分类与子分类是否符合预期）

```bash
curl "http://localhost:3000/api/notion/classification"
```

3. 确认后锁定分类

```bash
curl -X POST "http://localhost:3000/api/notion/classification?action=lock"
```

4. 如需重新开放自动分类（临时调参/重建策略）

```bash
curl -X POST "http://localhost:3000/api/notion/classification?action=unlock"
```

> 若你配置了 `NOTION_SYNC_SECRET`，请在以上命令加请求头：`-H "x-sync-secret: <your-secret>"`。

### 6) 手动修正规则（锁定后）

- 建议在 Notion 数据库保留可编辑字段：
  - `category`（或“分类”）
  - `subcategory`（或“子分类”）
- 当你手动填写这两个字段后，下次同步会以手动值为准，并覆盖对应 URL 的锁定结果。
- 这意味着“自动策略负责初次归类，人工修正负责最终定稿”。

### 7) 前端分类展示规则

- 主分类按英文字母顺序展示（含 `ALL`）。
- 子分类由真实数据动态生成，并按字母排序。
- 每个主分类下固定包含一个 `ALL` 子分类入口。
- 不再使用随机子分类占位。

#### 同步失败回退规则

- Notion 拉取失败时，`/api/sites` 回退顺序：
  - 约 3 小时前备份快照
  - 最新备份快照
  - 当前缓存
  - 空数组（前端展示空态）
