const DEFAULT_OWNER = "aim123qqq-cpu";
const DEFAULT_REPO = "graphql-visualize";
const DEFAULT_BRANCH = "main";
const TABLE_MARKER = "<!-- FEEDBACK_TABLE_ROWS -->";

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const origin = env.CORS_ORIGIN || "https://graphql-visual.ru";
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, headers);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ ok: false, error: "Invalid JSON" }, 400, headers);
  }

  const feedback = normalizeFeedback(payload);
  if (!feedback.message) {
    return json({ ok: false, error: "Message is required" }, 400, headers);
  }

  const owner = env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json({ ok: false, error: "GITHUB_TOKEN is not configured" }, 500, headers);
  }

  const id = makeId(feedback.createdAt);
  const entryPath = `feedback/entries/${id}.md`;
  const entryContent = renderEntry(id, feedback);
  const readmePath = "feedback/README.md";

  await putGithubFile({
    owner,
    repo,
    branch,
    token,
    path: entryPath,
    content: entryContent,
    message: `Add feedback ${id}`
  });

  await appendFeedbackTableRow({
    owner,
    repo,
    branch,
    token,
    readmePath,
    row: renderTableRow(id, feedback, entryPath)
  });

  return json({ ok: true, id, path: entryPath }, 201, headers);
}

function normalizeFeedback(payload) {
  return {
    createdAt: limit(payload.createdAt || new Date().toISOString(), 40),
    type: limit(payload.type || "ОС", 40),
    name: limit(payload.name || "Не указано", 120),
    contact: limit(payload.contact || "Не указано", 160),
    message: limit(payload.message || "", 4000),
    page: limit(payload.page || "", 300),
    userAgent: limit(payload.userAgent || "", 400)
  };
}

function renderEntry(id, feedback) {
  return [
    `# ОС ${id}`,
    "",
    `- Дата: ${feedback.createdAt}`,
    `- Тип: ${feedback.type}`,
    `- Имя: ${feedback.name}`,
    `- Контакт: ${feedback.contact}`,
    `- Страница: ${feedback.page || "Не указано"}`,
    "",
    "## Сообщение",
    "",
    feedback.message,
    "",
    "## User-Agent",
    "",
    "```",
    feedback.userAgent || "Не указано",
    "```",
    ""
  ].join("\n");
}

function renderTableRow(id, feedback, entryPath) {
  const date = feedback.createdAt.slice(0, 10);
  const contact = feedback.contact === "Не указано" ? "Не указано" : feedback.contact;
  const entryLink = `[${id}](${entryPath})`;
  return `| ${escapeCell(id)} | ${escapeCell(date)} | ${escapeCell(feedback.type)} | ${escapeCell(contact)} | Новая | ${entryLink} |`;
}

async function appendFeedbackTableRow(options) {
  const current = await getGithubFile(options);
  const content = decodeBase64(current.content);
  const next = content.includes(TABLE_MARKER)
    ? content.replace(TABLE_MARKER, `${options.row}\n${TABLE_MARKER}`)
    : `${content.trim()}\n${options.row}\n`;

  await putGithubFile({
    ...options,
    path: options.readmePath,
    sha: current.sha,
    content: next,
    message: "Update feedback table"
  });
}

async function getGithubFile({ owner, repo, branch, token, readmePath }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${readmePath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: githubHeaders(token)
  });
  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }
  return response.json();
}

async function putGithubFile({ owner, repo, branch, token, path, content, message, sha }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    branch,
    message,
    content: encodeBase64(content)
  };
  if (sha) body.sha = sha;

  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub write failed: ${response.status} ${text}`);
  }
  return response.json();
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "graphql-visual-feedback",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function makeId(createdAt) {
  const safeDate = createdAt.replace(/[^0-9]/g, "").slice(0, 14) || Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `${safeDate}-${random}`;
}

function limit(value, max) {
  return String(value).trim().slice(0, max);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
