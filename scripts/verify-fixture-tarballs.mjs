import { execFileSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), "messanga11-fixtures-"));

try {
  const tarballs = await packPublicPackages();
  await copyFixtures();
  await replacePublicDependencies(tarballs);
  await writeFile(
    join(temporaryRoot, "package.json"),
    JSON.stringify({
      private: true,
      workspaces: ["fixtures/*"],
    }),
  );
  run("npm", ["install", "--no-audit", "--no-fund"], temporaryRoot);
  await assertPackedCoreInstalled();
  run(
    "npm",
    ["run", "typecheck", "-w", "@messanga11/next-fixture"],
    temporaryRoot,
  );
  run("npm", ["run", "build", "-w", "@messanga11/next-fixture"], temporaryRoot);
  run(
    "npm",
    ["run", "typecheck", "-w", "@messanga11/expo-fixture"],
    temporaryRoot,
  );
  run("npm", ["run", "build", "-w", "@messanga11/expo-fixture"], temporaryRoot);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

async function packPublicPackages() {
  const tarballs = new Map();
  for (const directoryName of await readdir(join(workspaceRoot, "packages"))) {
    const directory = join(workspaceRoot, "packages", directoryName);
    const manifest = await readManifest(join(directory, "package.json"));
    if (manifest.private) {
      continue;
    }
    const output = JSON.parse(
      execFileSync(
        "npm",
        ["pack", directory, "--json", "--pack-destination", temporaryRoot],
        { cwd: workspaceRoot, encoding: "utf8" },
      ),
    );
    const filename = output[0]?.filename;
    if (!filename) {
      throw new Error(`Unable to pack ${manifest.name}.`);
    }
    tarballs.set(manifest.name, join(temporaryRoot, filename));
  }
  return tarballs;
}

async function copyFixtures() {
  await cp(join(workspaceRoot, "fixtures"), join(temporaryRoot, "fixtures"), {
    filter: (source) =>
      ![".expo", ".next", "coverage", "dist", "node_modules"].includes(
        source.split("/").at(-1) ?? "",
      ),
    recursive: true,
  });
}

async function replacePublicDependencies(tarballs) {
  for (const directoryName of await readdir(join(temporaryRoot, "fixtures"))) {
    const manifestPath = join(
      temporaryRoot,
      "fixtures",
      directoryName,
      "package.json",
    );
    const manifest = await readManifest(manifestPath);
    for (const field of ["dependencies", "devDependencies"]) {
      const dependencies = manifest[field];
      if (!dependencies) {
        continue;
      }
      for (const [name, tarball] of tarballs) {
        if (name in dependencies) {
          dependencies[name] = `file:${tarball}`;
        }
      }
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

async function assertPackedCoreInstalled() {
  const installed = await realpath(
    join(temporaryRoot, "node_modules", "@messanga11", "core"),
  );
  if (installed.startsWith(workspaceRoot)) {
    throw new Error(
      "Fixture resolved core from workspace sources instead of a tarball.",
    );
  }
}

async function readManifest(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, CI: "1" },
    stdio: "inherit",
  });
}
