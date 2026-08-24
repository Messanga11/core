import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const PLATFORM_IMPORTS = new Set([
  "react",
  "react-dom",
  "react-native",
  "react-native-web",
]);
const IMPORT_PATTERN = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;

const violations = [];

for (const directory of ["packages", "fixtures"]) {
  await inspectDirectory(join(ROOT, directory));
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
}

async function inspectDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  for (const entry of entries) {
    if (["dist", "node_modules", ".expo", ".next"].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspectDirectory(path);
    } else if (SOURCE_EXTENSIONS.has(extname(path))) {
      await inspectFile(path);
    }
  }
}

async function inspectFile(path) {
  const source = await readFile(path, "utf8");
  const normalized = relative(ROOT, path).split(sep).join("/");
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[2];
    if (!specifier) {
      continue;
    }
    if (/^@messanga11\/[^/]+\/(?:src|dist)(?:\/|$)/.test(specifier)) {
      violations.push(`${normalized}: deep package import ${specifier}`);
    }
    if (
      normalized.startsWith("packages/core/") &&
      isPlatformImport(specifier)
    ) {
      violations.push(`${normalized}: renderer import ${specifier}`);
    }
    if (
      normalized.startsWith("packages/") &&
      !normalized.startsWith("packages/adapter-") &&
      isOrmImport(specifier)
    ) {
      violations.push(`${normalized}: provider import ${specifier}`);
    }
  }
}

function isPlatformImport(specifier) {
  return [...PLATFORM_IMPORTS].some(
    (blocked) => specifier === blocked || specifier.startsWith(`${blocked}/`),
  );
}

function isOrmImport(specifier) {
  return ["@prisma/client", "drizzle-orm", "typeorm", "sequelize"].some(
    (blocked) => specifier === blocked || specifier.startsWith(`${blocked}/`),
  );
}
