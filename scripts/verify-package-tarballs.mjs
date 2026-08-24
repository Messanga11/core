import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), "messanga11-tarballs-"));
const packages = await publicPackages();
const tarballs = [];

for (const packageInfo of packages) {
  const output = runJson("npm", [
    "pack",
    packageInfo.directory,
    "--json",
    "--pack-destination",
    temporaryRoot,
  ]);
  const packed = output[0];
  if (!packed) {
    throw new Error(`npm pack returned no result for ${packageInfo.name}.`);
  }
  assertCleanTarball(packageInfo.name, packed.files);
  tarballs.push(join(temporaryRoot, packed.filename));
}

const consumer = join(temporaryRoot, "consumer");
await writeFile(
  join(temporaryRoot, "package.json"),
  JSON.stringify({ private: true, workspaces: ["consumer"] }),
);
await writeFile(
  join(temporaryRoot, "consumer-package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
await mkdir(consumer);
await rename(
  join(temporaryRoot, "consumer-package.json"),
  join(consumer, "package.json"),
);
run(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "@trpc/server@^11.18.0",
    ...tarballs,
  ],
  consumer,
);

const esmImports = exportSpecifiers(packages)
  .map((specifier) => `await import(${JSON.stringify(specifier)});`)
  .join("\n");
const cjsImports = exportSpecifiers(packages)
  .filter((specifier) => !specifier.endsWith("/migrations"))
  .map((specifier) => `require(${JSON.stringify(specifier)});`)
  .join("\n");
await writeFile(join(consumer, "smoke.mjs"), esmImports);
await writeFile(join(consumer, "smoke.cjs"), cjsImports);
run("node", ["smoke.mjs"], consumer);
run("node", ["smoke.cjs"], consumer);

function run(command, args, cwd = workspaceRoot) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function runJson(command, args) {
  return JSON.parse(
    execFileSync(command, args, { cwd: workspaceRoot, encoding: "utf8" }),
  );
}

async function publicPackages() {
  const directories = await readdir(join(workspaceRoot, "packages"));
  const results = [];
  for (const directoryName of directories) {
    const directory = join(workspaceRoot, "packages", directoryName);
    const manifestPath = join(directory, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!manifest.private) {
      results.push({
        directory,
        exports: manifest.exports,
        name: manifest.name,
      });
    }
  }
  return results;
}

function exportSpecifiers(packageInfos) {
  return packageInfos.flatMap((packageInfo) =>
    Object.keys(packageInfo.exports)
      .filter((subpath) => !subpath.includes("*") && subpath !== "./migrations")
      .map((subpath) =>
        subpath === "."
          ? packageInfo.name
          : `${packageInfo.name}/${subpath.slice(2)}`,
      ),
  );
}

function assertCleanTarball(packageName, files) {
  const paths = files.map((file) => file.path ?? basename(file));
  for (const required of ["LICENSE", "README.md", "package.json"]) {
    if (!paths.includes(required)) {
      throw new Error(`${packageName} tarball is missing ${required}.`);
    }
  }
  for (const file of files) {
    const path = file.path ?? basename(file);
    if (
      path.endsWith(".map") ||
      path.includes("/src/") ||
      /\.(?:spec|test)\./.test(path)
    ) {
      throw new Error(
        `${packageName} tarball contains forbidden file ${path}.`,
      );
    }
  }
}
