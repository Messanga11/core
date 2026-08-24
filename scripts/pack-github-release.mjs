import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const CORE_PACKAGE = "@messanga11/core";
const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(
  workspaceRoot,
  process.argv[2] ?? "release-assets",
);
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const releaseTag = process.argv[3];

await mkdir(outputDirectory, { recursive: true });

const manifest = JSON.parse(
  await readFile(join(workspaceRoot, "packages/core/package.json"), "utf8"),
);
if (manifest.name !== CORE_PACKAGE || typeof manifest.version !== "string") {
  throw new Error("The core package manifest is invalid.");
}
if (releaseTag && releaseTag !== `core-v${manifest.version}`) {
  throw new Error(
    `Release tag ${releaseTag} does not match core-v${manifest.version}.`,
  );
}

const { stdout: packOutput } = await execFileAsync(
  npmExecutable,
  [
    "pack",
    "--workspace",
    CORE_PACKAGE,
    "--pack-destination",
    outputDirectory,
    "--json",
  ],
  { cwd: workspaceRoot },
);
const packed = JSON.parse(packOutput);
const packResult = packed[0];
if (
  packed.length !== 1 ||
  packResult?.name !== CORE_PACKAGE ||
  packResult.version !== manifest.version ||
  typeof packResult.filename !== "string"
) {
  throw new Error("npm pack returned an unexpected core artifact.");
}

const tarballPath = join(outputDirectory, packResult.filename);
const sbomFilename = `messanga11-core-${manifest.version}.sbom.cdx.json`;
const sbomPath = join(outputDirectory, sbomFilename);
const sbomWorkspace = await mkdtemp(join(tmpdir(), "messanga11-core-sbom-"));
await writeFile(
  join(sbomWorkspace, "package.json"),
  `${JSON.stringify({
    dependencies: { [CORE_PACKAGE]: `file:${tarballPath}` },
    name: "messanga11-core-sbom",
    private: true,
    version: "0.0.0",
  })}\n`,
  "utf8",
);
await execFileAsync(
  npmExecutable,
  ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: sbomWorkspace },
);
const { stdout: sbom } = await execFileAsync(
  npmExecutable,
  ["sbom", "--sbom-format", "cyclonedx"],
  { cwd: sbomWorkspace, maxBuffer: 10 * 1024 * 1024 },
);
await writeFile(sbomPath, sbom, "utf8");

const checksums = [];
for (const [filename, path] of [
  [packResult.filename, tarballPath],
  [sbomFilename, sbomPath],
]) {
  const digest = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  checksums.push(`${digest}  ${filename}`);
}
await writeFile(
  join(outputDirectory, "SHA256SUMS"),
  `${checksums.join("\n")}\n`,
  "utf8",
);

process.stdout.write(
  `Prepared ${packResult.filename}, ${sbomFilename}, and SHA256SUMS.\n`,
);
