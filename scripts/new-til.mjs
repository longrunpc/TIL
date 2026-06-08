import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncReadmeArchive } from "./update-readme.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const templatePath = path.join(rootDir, "templates", "final-til-format.md");
const dailyDir = path.join(rootDir, "daily");

function todayInSeoul() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const rawSlug = process.argv.slice(2).join(" ").trim();
  const slug = rawSlug ? slugify(rawSlug) : "";
  const date = todayInSeoul();
  const fileName = slug ? `${date}-${slug}.md` : `${date}.md`;
  const targetPath = path.join(dailyDir, fileName);

  try {
    await fs.access(targetPath);
    throw new Error(`이미 파일이 있습니다: daily/${fileName}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(dailyDir, { recursive: true });

  const template = await fs.readFile(templatePath, "utf8");

  await fs.writeFile(targetPath, template, "utf8");
  await syncReadmeArchive();

  console.log(`새 TIL 파일을 만들었습니다: daily/${fileName}`);
  console.log("README 아카이브도 함께 갱신했습니다.");
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  await main();
}
