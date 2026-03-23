---
name: ppt-generator
description: 根据话题自动生成培训课件。用户说"生成课件"、"做个PPT"、"生成培训PPT"、"帮我做一个XXX的课件"时触发。调用 OpenMAIC 生成交互式课堂，输出可供外网访问的课堂链接。
---

# PPT 课件生成器（OpenMAIC 版）

## 简介

基于 [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) 驱动的 AI 课堂生成工具。

只需提供一段文字描述或培训主题，即可自动生成包含图文讲解、知识点拆解、互动测验的完整培训课堂，并输出可分享的在线链接。

**核心能力：**
- 🎓 自动将文档/主题拆解为多个场景（slides + quiz）
- 📝 内置互动答题，学员提交后自动统计得分并通过大象消息通知教师
- 🔗 生成可直接分享的在线课堂链接（需美团 SSO 登录访问）
- 🌐 支持中文课堂生成

**适用场景：** 客服培训、新人入职、知识点考核、标准操作流程宣导等

输入用户提供的内容/主题 → 用 OpenMAIC 生成交互式课堂 → 返回公网可访问链接。

## 前置条件

- OpenMAIC 本地服务运行在 `http://localhost:3000`
- 沙箱公网地址：`https://3000-1bjiovj7jviuytsw41lf.ap2.catclaw.sankuai.com`

## 执行流程

### Step 1：确认 OpenMAIC 服务在线

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000
```

若非 200/302，使用 skill 目录内置的 OpenMAIC 启动：

```bash
SKILL_DIR="$(dirname "$0")"
# 若以 SKILL.md 路径为基准，则：
# SKILL_DIR=/root/.openclaw/skills/ppt-generator
cd "${SKILL_DIR}/OpenMAIC" && nohup pnpm dev > /tmp/openmaic.log 2>&1 &
sleep 10
# 再次确认服务已起来
curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000
```

> OpenMAIC 代码位置：skill 目录下的 `OpenMAIC/` 子目录（即 `/root/.openclaw/skills/ppt-generator/OpenMAIC`）。
> 首次启动前确保已执行过 `pnpm install`（依赖已预装，通常无需重装）。

### Step 2：提交生成任务

API：`POST http://localhost:3000/api/generate-classroom`

```bash
curl -s -X POST http://localhost:3000/api/generate-classroom \
  -H "Content-Type: application/json" \
  -d '{
    "requirement": "<用户提供的内容或主题>",
    "language": "zh"
  }'
```

响应示例：
```json
{
  "jobId": "abc123xyz",
  "status": "pending",
  "pollUrl": "http://localhost:3000/api/generate-classroom/abc123xyz",
  "pollIntervalMs": 5000
}
```

### Step 3：轮询任务状态

```bash
curl -s "http://localhost:3000/api/generate-classroom/<jobId>"
```

每 5 秒轮询一次，最多等待 5 分钟。

完成时响应包含：
```json
{
  "status": "completed",
  "classroomId": "xxxxxx"
}
```

若 `status` 为 `failed`，报错并告知用户。

### Step 4：构造并回复公网链接

```
https://3000-1bjiovj7jviuytsw41lf.ap2.catclaw.sankuai.com/classroom/<classroomId>
```

回复格式：

```
课堂已生成 🎉

👉 https://3000-1bjiovj7jviuytsw41lf.ap2.catclaw.sankuai.com/classroom/<classroomId>

（需要美团 SSO 登录后访问）
```

## 注意事项

- 生成约需 1-3 分钟，提交后告知用户正在生成
- 若遇 429 限流，等 30 秒后重试
- 课堂数据保存在 `/root/OpenMAIC/data/classrooms/<classroomId>.json`
- OpenMAIC 代码在 skill 目录下：`<skill_dir>/OpenMAIC`（默认 `/root/.openclaw/skills/ppt-generator/OpenMAIC`），API 路由在 `OpenMAIC/app/api/`

---

## 答题通知功能

### 功能说明

学员完成测验后，系统会自动：
1. 将答题记录保存到本地 JSONL 文件（`data/quiz-records/<classroomId>.jsonl`）
2. 通过大象消息通知教师（默认通知 `wangjinyan08`）

通知示例：
```
📊 学员答题通知
课堂：退赔策略-通用方案
学员：zhangsan01
得分：8/10 分（80%）
正确 3 题 / 错误 1 题 / 部分得分 0 题
课堂链接：https://3000-1bjiovj7jviuytsw41lf.ap2.catclaw.sankuai.com/classroom/<classroomId>
```

### 实现机制

**前端触发**（`components/scene-renderers/quiz-view.tsx`）：
- 学员点击「提交答案」后，前端自动发起 `POST /api/quiz-notify`
- 学员 MIS 从 URL 参数 `?mis=xxx` 读取（分享链接时需带上此参数）
- 无论通知成功与否均静默处理，不影响答题体验

**后端接口**（`app/api/quiz-notify/route.ts`）：
- 接收答题结果，追加写入 `data/quiz-records/<classroomId>.jsonl`
- 调用 `/root/.openclaw/skills/daxiang-sender/scripts/send.py` 发送大象消息

**配置项**（在 `.env.local` 中设置）：
```
DX_CLIENT_ID=48e73268b7
DX_CLIENT_SECRET=cea268943c8a40c08cfd2a80ebbaf62b
QUIZ_NOTIFY_MIS=wangjinyan08   # 接收通知的教师 MIS
```

### 分享链接格式

分享给学员的链接需要带上 MIS 参数，以便通知中显示学员身份：

```
https://3000-1bjiovj7jviuytsw41lf.ap2.catclaw.sankuai.com/classroom/<classroomId>?mis=<学员mis>
```

例如给 `zhangsan01` 分享：
```
https://3000-1bjiovj7jviuytsw41lf.ap2.catclaw.sankuai.com/classroom/l31B4E6O83?mis=zhangsan01
```

### 查询答题记录

```bash
# 查看某课堂所有答题记录
GET /api/quiz-records?classroomId=<classroomId>

# 查看汇总统计（平均分、通过率、各学员最高分）
GET /api/quiz-records?classroomId=<classroomId>&summary=1
```

返回示例（summary=1）：
```json
{
  "classroomId": "l31B4E6O83",
  "totalRecords": 5,
  "avgScore": 78.4,
  "passRate": 0.8,
  "students": [
    { "studentId": "zhangsan01", "attempts": 2, "bestScore": 90, "lastSubmittedAt": "..." }
  ]
}
```


---

## 已知问题与解决方案

### 1. 模型配置

**推荐模型：** `openai:gpt-4.1`（最稳定，无截断问题）

`.env.local` 配置：
```
OPENAI_API_KEY=22034187533487349807
OPENAI_BASE_URL=https://aigc.sankuai.com/v1/openai/native
DEFAULT_MODEL=openai:gpt-4.1
```

**模型避坑：**
- `openai:gemini-3.1-flash-lite-preview` — 不支持 JSON mode，报 `Invalid JSON response`，**不可用**
- `openai:gemini-3-flash-preview` — 需确保 `maxOutputTokens` fallback 已加（见下方），否则大纲只生成 1 个 scene
- `openai:gpt-5.1` — 内网有但限流极严（AppId `22034187533487349807`），不适合课堂生成

### 2. gemini 只生成 1 个 scene（大纲截断）

**原因：** `classroom-generation.ts` 中 `maxOutputTokens` 用 `modelInfo?.outputWindow`，但 gemini 在 openai provider 下查不到 modelInfo，导致未传 max_tokens，gemini 用极低默认值截断输出。

**修复：** `OpenMAIC/lib/server/classroom-generation.ts` 第 123 行：
```ts
// 改为：
maxOutputTokens: modelInfo?.outputWindow ?? 16384,
```

### 3. Interactive 页面只显示裸文字（无样式）

**原因：** `InteractiveRenderer` 的 `<iframe>` 有 `sandbox` 属性，阻止外部 CDN 脚本（Tailwind）加载。

**修复：** `OpenMAIC/components/scene-renderers/interactive-renderer.tsx` 中移除 iframe 的 `sandbox` 属性：
```tsx
// 删除这一行：
// sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
```
内容为 OpenMAIC 自生成的可信 HTML，不需要 sandbox 限制。

### 4. Table 单元格 undefined crash

**原因：** `formatText` 函数未处理 null/undefined 输入。

**修复：** `OpenMAIC/components/slide-renderer/components/element/TableElement/tableUtils.ts` 第 31 行加 null guard：
```ts
function formatText(text: string | null | undefined): string {
  if (text == null) return '';
  // ...原有逻辑
}
```

### 5. Interactive 场景 Tailwind 样式不生效（CDN 加载失败）

**现象：** interactive 类型的场景页面只有裸文字，没有任何样式。

**原因：** `interactive-html` 生成 prompt（`lib/generation/prompts/templates/interactive-html/system.md`）原来要求 AI 使用 `cdn.tailwindcss.com`，但该 CDN 在 Next.js 静态文件 / iframe srcDoc 环境下无法正常加载。

**已修复（两处）：**

1. **Prompt 改为禁用 CDN**：`system.md` 第19行已改为要求使用 inline CSS styles，不允许外部 CDN。

2. **存量 HTML 补救方案**（已生成的课堂）：
   ```bash
   cd /tmp
   # 安装 pytailwindcss（tailwind v4 binary）
   pip3 install pytailwindcss -q

   # 1. 把有问题的 HTML 存为 input.html
   python3 -c "
   import json
   data = json.load(open('/root/OpenMAIC/data/classrooms/<classroomId>.json'))
   # 找到 interactive 类型的 scene
   for s in data['scenes']:
       if s['type'] == 'interactive':
           open('input.html', 'w').write(s['content']['html'])
           break
   "

   # 2. 生成精简 CSS
   echo '@import \"tailwindcss\";' > tw-input.css
   tailwindcss --input tw-input.css --output tw-output.css --content input.html --minify

   # 3. 替换 CDN script 为 inline style 并写回 JSON
   python3 -c "
   import json, re
   data = json.load(open('/root/OpenMAIC/data/classrooms/<classroomId>.json'))
   css = open('/tmp/tw-output.css').read()
   for s in data['scenes']:
       if s['type'] == 'interactive' and 'html' in s.get('content', {}):
           s['content']['html'] = re.sub(
               r'<script[^>]+cdn\.tailwindcss\.com[^>]*></script>',
               f'<style>{css}</style>',
               s['content']['html']
           )
   json.dump(data, open('/root/OpenMAIC/data/classrooms/<classroomId>.json', 'w'), ensure_ascii=False)
   print('done')
   "
   ```
