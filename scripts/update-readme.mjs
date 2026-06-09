import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const readmePath = path.join(rootDir, "README.md");
const dailyDir = path.join(rootDir, "daily");
const startMarker = "<!-- TIL-LIST:START -->";
const endMarker = "<!-- TIL-LIST:END -->";

function escapeTableCell(value) {
  return value.replace(/\|/g, "\\|");
}

function extractTitle(content) {
  const lines = content.split(/\r?\n/);
  const h1 = lines.find((line) => line.trim().startsWith("# "));

  if (h1) {
    return h1.replace(/^#\s*/, "").trim();
  }

  const h2 = lines.find((line) => line.trim().startsWith("## "));

  if (h2) {
    return h2.replace(/^##\s*/, "").trim();
  }

  return "제목 없음";
}

function extractDate(title, fallbackFileName) {
  const match = title.match(/\d{4}-\d{2}-\d{2}/);

  if (match) {
    return match[0];
  }

  return fallbackFileName.slice(0, 10);
}

async function collectEntries() {
  let files = [];

  try {
    files = await fs.readdir(dailyDir);
  } catch {
    return [];
  }

  const markdownFiles = files
    .filter((fileName) => fileName.endsWith(".md"))
    .sort((left, right) => right.localeCompare(left, "ko"));

  const entries = [];

  for (const fileName of markdownFiles) {
    const filePath = path.join(dailyDir, fileName);
    const content = await fs.readFile(filePath, "utf8");
    const title = extractTitle(content);

    entries.push({
      date: extractDate(title, fileName),
      fileName,
      title,
    });
  }

  return entries;
}

function renderArchive(entries) {
  if (entries.length === 0) {
    return ["총 0개", "", "아직 작성한 TIL이 없습니다."].join("\n");
  }

  const lines = [
    `총 ${entries.length}개`,
    "",
    "| 날짜 | 제목 | 링크 |",
    "| --- | --- | --- |",
  ];

  for (const entry of entries) {
    lines.push(
      `| ${escapeTableCell(entry.date)} | ${escapeTableCell(entry.title)} | [보기](daily/${entry.fileName}) |`,
    );
  }

  return lines.join("\n");
}

export async function syncReadmeArchive() {
  const [entries, readme] = await Promise.all([
    collectEntries(),
    fs.readFile(readmePath, "utf8"),
  ]);

  if (!readme.includes(startMarker) || !readme.includes(endMarker)) {
    throw new Error("README.md에 자동 아카이브 마커가 없습니다.");
  }

  const archiveBlock = `${startMarker}\n${renderArchive(entries)}\n${endMarker}`;
  const updatedReadme = readme.replace(
    new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`),
    archiveBlock,
  );

  await fs.writeFile(readmePath, updatedReadme, "utf8");

  return entries.length;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  const count = await syncReadmeArchive();
  console.log(`README 아카이브를 갱신했습니다. 총 ${count}개 문서를 반영했습니다.`);
}
