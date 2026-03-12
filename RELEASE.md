# Release Guide

arcory 当前生产环境部署在 Vercel，生产域名为 `https://arcory.xyz`。

## 1. 日常开发

本地启动：

```bash
pnpm dev
```

本地需要刷新 Notion 数据时：

```bash
curl -X POST "http://localhost:3000/api/notion/sync?force=1&reclassify=1" \
  -H "x-sync-secret: arcory_sync_2026_Hw9kP2mX7qL4vN8tR1cF6zD3jS"
```

## 2. 发布到生产

生产发布源为 `main` 分支。

```bash
git checkout main
git pull
git add -A
git commit -m "your message"
git push origin main
```

推送后，Vercel 会自动触发 Production 部署。

## 3. 检查部署状态

进入 Vercel 项目：

- `Deployments`
- 查看最新 `main` 提交是否为 `Ready`

生产域名：

- `https://arcory.xyz`

Vercel 默认域名：

- `https://project-4s24m.vercel.app`

## 4. 生产环境同步 Notion

当改动影响 Notion 数据、分类、截图代理或缓存逻辑时，部署完成后手动执行一次：

```bash
curl -X POST "https://arcory.xyz/api/notion/sync?force=1&reclassify=1" \
  -H "x-sync-secret: arcory_sync_2026_Hw9kP2mX7qL4vN8tR1cF6zD3jS"
```

如果只想强制同步、不重分类：

```bash
curl -X POST "https://arcory.xyz/api/notion/sync?force=1" \
  -H "x-sync-secret: arcory_sync_2026_Hw9kP2mX7qL4vN8tR1cF6zD3jS"
```

## 5. 生产验收

检查站点数据：

```bash
curl -s "https://arcory.xyz/api/sites" | jq '{source,syncedAt,total}'
```

预期：

- `source` 为 `notion`
- `syncedAt` 不为空
- `total` 大于 `0`

可补充检查：

```bash
curl -s "https://arcory.xyz/api/notion/sync" | jq '{configured,syncedAt,count}'
```

## 6. 域名说明

当前已接入：

- `arcory.xyz`

Vercel 域名解析记录：

- 类型：`A`
- 主机记录：`@`
- 记录值：`216.198.79.1`

## 7. 注意事项

- Vercel 运行时写缓存目录使用 `/tmp/arcory-data`
- 本地运行时写缓存目录使用项目内 `data/`
- 如果站点显示为空，优先检查：
  - Vercel 环境变量是否正确
  - `NOTION_DATABASE_ID` 是否是数据库本体 ID
  - Notion 数据库是否已 `Share` 给 integration
  - 生产同步接口是否成功执行
