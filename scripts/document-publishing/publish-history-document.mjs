import crypto from "node:crypto";
import fs from "node:fs";

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue;
const sourceToken = process.env.GITHUB_TOKEN;
const targetToken = process.env.TARGET_GITHUB_TOKEN ?? "";
const sourceRepository = process.env.GITHUB_REPOSITORY;
const [sourceOwner, sourceRepo] = sourceRepository.split("/");
const config = JSON.parse(
  fs.readFileSync(new URL("../../.github/document-publishing/target.json", import.meta.url), "utf8"),
);
const allowedUsers = JSON.parse(
  fs.readFileSync(new URL("../../.github/document-publishing/allowed-users.json", import.meta.url), "utf8"),
);

const labels = {
  submission: { name: "document-submission", color: "1d76db", description: "等待自动处理的文档投稿" },
  processing: { name: "document-processing", color: "fbca04", description: "正在自动发布文档" },
  published: { name: "document-published", color: "0e8a16", description: "文档已成功发布" },
  review: { name: "document-review-required", color: "d876e3", description: "需要 Fork、PR 或人工处理冲突" },
  failed: { name: "document-failed", color: "d73a4a", description: "文档自动发布失败" },
};

async function githubRequest(method, path, { token, body, accept = "application/vnd.github+json" } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "micro-scaff-doc-publisher",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${method} ${path} 返回 ${response.status}: ${data?.message ?? text}`);
    error.status = response.status;
    error.response = data;
    throw error;
  }
  return data;
}

async function ensureLabels() {
  for (const label of Object.values(labels)) {
    try {
      await githubRequest("POST", `/repos/${sourceOwner}/${sourceRepo}/labels`, {
        token: sourceToken,
        body: label,
      });
    } catch (error) {
      if (error.status !== 422) throw error;
    }
  }
}

async function addLabels(...names) {
  await githubRequest("POST", `/repos/${sourceOwner}/${sourceRepo}/issues/${issue.number}/labels`, {
    token: sourceToken,
    body: { labels: names },
  });
}

async function removeLabel(name) {
  try {
    await githubRequest(
      "DELETE",
      `/repos/${sourceOwner}/${sourceRepo}/issues/${issue.number}/labels/${encodeURIComponent(name)}`,
      { token: sourceToken },
    );
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

async function comment(body) {
  await githubRequest("POST", `/repos/${sourceOwner}/${sourceRepo}/issues/${issue.number}/comments`, {
    token: sourceToken,
    body: { body },
  });
}

async function closeIssue() {
  await githubRequest("PATCH", `/repos/${sourceOwner}/${sourceRepo}/issues/${issue.number}`, {
    token: sourceToken,
    body: { state: "closed", state_reason: "completed" },
  });
}

function parseIssueForm(body) {
  const fields = ["文档标题", "文档标识", "标签", "Markdown 正文", "图片附件", "提交确认"];
  const positions = [];
  let boundary = body.length;
  for (let index = fields.length - 1; index >= 0; index -= 1) {
    const marker = `### ${fields[index]}`;
    const position = body.lastIndexOf(marker, boundary - 1);
    if (position < 0) throw new Error(`Issue 缺少表单字段：${fields[index]}`);
    positions[index] = position;
    boundary = position;
  }

  return Object.fromEntries(fields.map((field, index) => {
    const marker = `### ${field}`;
    const start = positions[index] + marker.length;
    const end = index + 1 < fields.length ? positions[index + 1] : body.length;
    const value = body.slice(start, end).trim();
    return [field, value === "_No response_" ? "" : value];
  }));
}

function normalizeSlug(value, title) {
  const source = value || title;
  const slug = source
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "document";
}

function shanghaiTimestamp() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts().filter(part => part.type !== "literal").map(part => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

function extractAttachmentUrls(value) {
  const matches = value.match(/https:\/\/[^\s)>]+/g) ?? [];
  return [...new Set(matches.map(url => url.replace(/[.,;]+$/, "")))];
}

function assertAttachmentUrl(rawUrl, initial = false) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("图片附件必须使用 HTTPS。");
  const hostAllowed = url.hostname === "github.com" || url.hostname.endsWith(".githubusercontent.com");
  if (!hostAllowed) throw new Error(`不允许下载非 GitHub 图片：${url.hostname}`);
  if (initial && url.hostname === "github.com" && !url.pathname.startsWith("/user-attachments/assets/")) {
    throw new Error(`不是受支持的 GitHub Issue 附件：${url.pathname}`);
  }
  return url;
}

async function downloadAttachment(rawUrl) {
  let url = assertAttachmentUrl(rawUrl, true);
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": "micro-scaff-doc-publisher" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("图片重定向缺少 Location。");
      url = assertAttachmentUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`图片下载失败：HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) throw new Error("单张图片不能超过 5 MB。");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("图片重定向次数过多。");
}

function detectImage(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return { extension: "gif", width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return { extension: "webp", width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    }
    if (chunk === "VP8 " && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return { extension: "webp", width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { extension: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xd8, 0xd9].includes(marker)) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;
      const dimensionMarker = (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf);
      if (dimensionMarker) {
        return { extension: "jpg", width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  throw new Error("图片仅支持真实的 PNG、JPEG、GIF 或 WebP 文件。");
}

async function prepareImages(markdown, imageField, documentStem) {
  const attachmentUrls = extractAttachmentUrls(imageField);
  const inlinePattern = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  const matches = [...markdown.matchAll(inlinePattern)];
  const imageSources = [];
  let attachmentIndex = 0;

  for (const match of matches) {
    const reference = match[2];
    if (/^https:\/\//i.test(reference)) {
      assertAttachmentUrl(reference, true);
      imageSources.push(reference);
    } else if (/^\.\/images\/[^/]+$/i.test(reference)) {
      const attachment = attachmentUrls[attachmentIndex++];
      if (!attachment) throw new Error(`图片 ${reference} 没有对应的 GitHub 附件。`);
      imageSources.push(attachment);
    } else if (/^(?:data:|\/|\.\.\/|http:)/i.test(reference)) {
      throw new Error(`不允许的图片路径：${reference}`);
    } else {
      throw new Error(`图片必须使用 ./images/<文件名>：${reference}`);
    }
  }

  if (attachmentIndex !== attachmentUrls.length) {
    throw new Error("图片附件数量与正文中的本地图片引用数量不一致。");
  }
  if (imageSources.length > 20) throw new Error("单篇文档最多允许 20 张图片。");

  const assets = [];
  let totalBytes = 0;
  for (const [index, source] of imageSources.entries()) {
    const buffer = await downloadAttachment(source);
    totalBytes += buffer.length;
    if (totalBytes > 30 * 1024 * 1024) throw new Error("单篇文档图片总大小不能超过 30 MB。");
    const detected = detectImage(buffer);
    if (detected.width <= 0 || detected.height <= 0 || detected.width * detected.height > 25_000_000) {
      throw new Error("图片尺寸无效或超过 2500 万像素。");
    }
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileName = `${String(index + 1).padStart(2, "0")}-${hash.slice(0, 12)}.${detected.extension}`;
    assets.push({
      path: `${config.assetDirectory}/${documentStem}/${fileName}`,
      relativePath: `./images/${documentStem}/${fileName}`,
      buffer,
    });
  }

  let cursor = 0;
  let rendered = "";
  matches.forEach((match, index) => {
    rendered += markdown.slice(cursor, match.index);
    rendered += `![${match[1]}](${assets[index].relativePath})`;
    cursor = match.index + match[0].length;
  });
  rendered += markdown.slice(cursor);
  return { markdown: rendered, assets };
}

function validateMarkdown(markdown) {
  if (!markdown.trim()) throw new Error("Markdown 正文不能为空。");
  if (/^---\r?\n/.test(markdown)) throw new Error("正文不能自行提供 frontmatter。");
  if (/<\/?(?:script|iframe|object|embed|form|input|button|textarea|select|link|meta|style|svg|math|img)\b/i.test(markdown)) {
    throw new Error("正文包含禁止的 HTML 标签。");
  }
  if (/(?:javascript|vbscript|file):/i.test(markdown)) throw new Error("正文包含危险链接协议。");
  if (/!\[[^\]]*\]\[[^\]]*\]/.test(markdown)) throw new Error("图片不支持引用式 Markdown 语法。");
}

async function findExistingDocument() {
  const tree = await githubRequest(
    "GET",
    `/repos/${config.owner}/${config.repository}/git/trees/${encodeURIComponent(config.branch)}?recursive=1`,
    { token: targetToken },
  );
  const suffix = `-${issue.number}.md`;
  return tree.tree.find(item => item.type === "blob" && item.path.startsWith(`${config.documentDirectory}/`) && item.path.endsWith(suffix));
}

async function createCommit(files, message, branch = config.branch) {
  const ref = await githubRequest("GET", `/repos/${config.owner}/${config.repository}/git/ref/heads/${encodeURIComponent(branch)}`, { token: targetToken });
  const parentSha = ref.object.sha;
  const parent = await githubRequest("GET", `/repos/${config.owner}/${config.repository}/git/commits/${parentSha}`, { token: targetToken });
  const treeEntries = [];
  for (const file of files) {
    const blob = await githubRequest("POST", `/repos/${config.owner}/${config.repository}/git/blobs`, {
      token: targetToken,
      body: { content: file.buffer.toString("base64"), encoding: "base64" },
    });
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await githubRequest("POST", `/repos/${config.owner}/${config.repository}/git/trees`, {
    token: targetToken,
    body: { base_tree: parent.tree.sha, tree: treeEntries },
  });
  const commit = await githubRequest("POST", `/repos/${config.owner}/${config.repository}/git/commits`, {
    token: targetToken,
    body: { message, tree: tree.sha, parents: [parentSha] },
  });
  return { commit, parentSha };
}

async function publish(files, message) {
  let lastCommit;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const created = await createCommit(files, message);
    lastCommit = created.commit;
    try {
      await githubRequest("PATCH", `/repos/${config.owner}/${config.repository}/git/refs/heads/${config.branch}`, {
        token: targetToken,
        body: { sha: created.commit.sha, force: false },
      });
      return { mode: "direct", sha: created.commit.sha };
    } catch (error) {
      if (![409, 422].includes(error.status) || attempt === 1) break;
    }
  }

  const conflictBranch = `document-publishing/issue-${issue.number}-${Date.now()}`;
  await githubRequest("POST", `/repos/${config.owner}/${config.repository}/git/refs`, {
    token: targetToken,
    body: { ref: `refs/heads/${conflictBranch}`, sha: lastCommit.sha },
  });
  const pullRequest = await githubRequest("POST", `/repos/${config.owner}/${config.repository}/pulls`, {
    token: targetToken,
    body: {
      title: `[文档发布冲突] ${issue.title.replace(/^\[文档发布\]\s*/, "")}`,
      head: conflictBranch,
      base: config.branch,
      body: `来源 Issue：${issue.html_url}\n\n自动更新 main 发生并发冲突，请核对后合并。`,
    },
  });
  return { mode: "pull-request", sha: lastCommit.sha, pullRequest };
}

async function main() {
  if (!issue || !issue.title.startsWith("[文档发布]")) {
    console.log("不是文档发布 Issue，跳过。");
    return;
  }
  await ensureLabels();
  await addLabels(labels.submission.name);

  const login = issue.user.login;
  const allowed = allowedUsers.some(user => user.toLowerCase() === login.toLowerCase());
  if (!allowed) {
    await addLabels(labels.review.name);
    await comment([
      "当前账号不在直接发布名单中，系统不会使用官方仓库权限代替你提交。",
      "",
      `1. [Fork Not-have/learn](https://github.com/${config.owner}/${config.repository}/fork)` ,
      `2. 新增 \`${config.documentDirectory}/<历史文件>.md\` 及对应图片目录。`,
      `3. 向 \`${config.owner}/${config.repository}:${config.branch}\` 创建 Pull Request。`,
      "",
      "PR 将运行只读的“历史文档 PR 校验”，通过后由维护者审核合并。",
    ].join("\n"));
    return;
  }

  if (!targetToken) throw new Error("缺少目标仓库 GitHub App Token。");
  await removeLabel(labels.failed.name);
  await addLabels(labels.processing.name);

  const existing = await findExistingDocument();
  if (existing) {
    await addLabels(labels.published.name);
    await removeLabel(labels.processing.name);
    await comment(`此 Issue 已发布为 [\`${existing.path}\`](https://github.com/${config.owner}/${config.repository}/blob/${config.branch}/${existing.path})，不会重复创建。`);
    await closeIssue();
    return;
  }

  const fields = parseIssueForm(issue.body ?? "");
  const title = fields["文档标题"].trim();
  if (!title || title.length > 100) throw new Error("文档标题不能为空且不能超过 100 个字符。");
  const slug = normalizeSlug(fields["文档标识"].trim(), title);
  const tags = fields["标签"].split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 20);
  const timestamp = shanghaiTimestamp();
  const documentStem = `${timestamp}-${slug}-${issue.number}`;
  const documentPath = `${config.documentDirectory}/${documentStem}.md`;

  validateMarkdown(fields["Markdown 正文"]);
  const prepared = await prepareImages(fields["Markdown 正文"], fields["图片附件"], documentStem);
  let body = prepared.markdown.trim();
  if (!/^#\s+.+$/m.test(body)) body = `# ${title}\n\n${body}`;
  const createdAt = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false }).replace(" ", "T") + "+08:00";
  const tagYaml = tags.length ? `tags:\n${tags.map(tag => `  - ${JSON.stringify(tag)}`).join("\n")}` : "tags: []";
  const markdown = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `author: ${JSON.stringify(login)}`,
    `createdAt: ${JSON.stringify(createdAt)}`,
    `documentId: ${JSON.stringify(`${sourceRepo}#${issue.number}`)}`,
    `sourceIssue: ${JSON.stringify(issue.html_url)}`,
    `targetRepository: ${JSON.stringify(`${config.owner}/${config.repository}`)}`,
    tagYaml,
    "sidebar: true",
    "---",
    "",
    body,
    "",
  ].join("\n");

  const files = [
    { path: documentPath, buffer: Buffer.from(markdown, "utf8") },
    ...prepared.assets.map(asset => ({ path: asset.path, buffer: asset.buffer })),
  ];
  const result = await publish(files, `docs: 发布 ${title}（#${issue.number}）`);

  await removeLabel(labels.processing.name);
  if (result.mode === "direct") {
    await addLabels(labels.published.name);
    await comment([
      "文档已自动发布，无需创建或合并 Pull Request。",
      "",
      `- 文件：[\`${documentPath}\`](https://github.com/${config.owner}/${config.repository}/blob/${config.branch}/${documentPath})`,
      `- Commit：[\`${result.sha.slice(0, 7)}\`](https://github.com/${config.owner}/${config.repository}/commit/${result.sha})`,
      `- 站点部署将在 \`docs-published\` 事件后自动开始。`,
    ].join("\n"));
    await closeIssue();
  } else {
    await addLabels(labels.review.name);
    await comment(`直接更新 main 时发生冲突，已创建 Pull Request：${result.pullRequest.html_url}`);
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await ensureLabels();
    await removeLabel(labels.processing.name);
    await addLabels(labels.failed.name);
    await comment(`自动发布失败：${error.message}\n\n请检查本次 Actions 运行日志，修正 Issue 后重新打开或编辑以重试。`);
  } catch (reportError) {
    console.error("写入失败状态时再次出错：", reportError);
  }
  process.exitCode = 1;
});
