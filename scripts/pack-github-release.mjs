import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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
const packages = await readPublicPackages();
const core = packages.find((entry) => entry.name === CORE_PACKAGE);
if (!core) throw new Error("The core package manifest is missing.");
if (releaseTag && releaseTag !== `core-v${core.version}`) {
  throw new Error(
    `Release tag ${releaseTag} does not match core-v${core.version}.`,
  );
}

const artifacts = [];
for (const packageInfo of packages) {
  const { stdout } = await execFileAsync(
    npmExecutable,
    [
      "pack",
      "--workspace",
      packageInfo.name,
      "--pack-destination",
      outputDirectory,
      "--json",
    ],
    { cwd: workspaceRoot },
  );
  const packed = JSON.parse(stdout);
  const result = packed[0];
  if (
    packed.length !== 1 ||
    result?.name !== packageInfo.name ||
    result.version !== packageInfo.version ||
    typeof result.filename !== "string"
  ) {
    throw new Error(
      `npm pack returned an unexpected artifact for ${packageInfo.name}.`,
    );
  }
  artifacts.push({
    filename: result.filename,
    path: join(outputDirectory, result.filename),
  });
}

const sbomFilename = `messanga11-ecosystem-${core.version}.sbom.cdx.json`;
const sbomPath = join(outputDirectory, sbomFilename);
const sbomWorkspace = await mkdtemp(
  join(tmpdir(), "messanga11-ecosystem-sbom-"),
);
await writeFile(
  join(sbomWorkspace, "package.json"),
  `${JSON.stringify({
    dependencies: Object.fromEntries(
      packages.map((packageInfo) => [
        packageInfo.name,
        `file:${artifactFor(artifacts, packageInfo.name).path}`,
      ]),
    ),
    name: "messanga11-ecosystem-sbom",
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
  { cwd: sbomWorkspace, maxBuffer: 20 * 1024 * 1024 },
);
await writeFile(sbomPath, sbom, "utf8");
artifacts.push({ filename: sbomFilename, path: sbomPath });

const checksums = [];
for (const artifact of artifacts) {
  const digest = createHash("sha256")
    .update(await readFile(artifact.path))
    .digest("hex");
  checksums.push(`${digest}  ${artifact.filename}`);
}
checksums.sort();
await writeFile(
  join(outputDirectory, "SHA256SUMS"),
  `${checksums.join("\n")}\n`,
  "utf8",
);

process.stdout.write(
  `Prepared ${artifacts.length} artifacts and SHA256SUMS for ${packages.length} packages.\n`,
);

async function readPublicPackages() {
  const directoryNames = await readdir(join(workspaceRoot, "packages"));
  const results = [];
  for (const directoryName of directoryNames) {
    const manifest = JSON.parse(
      await readFile(
        join(workspaceRoot, "packages", directoryName, "package.json"),
        "utf8",
      ),
    );
    if (
      !manifest.private &&
      typeof manifest.name === "string" &&
      typeof manifest.version === "string"
    ) {
      results.push({ name: manifest.name, version: manifest.version });
    }
  }
  return results.sort((left, right) => left.name.localeCompare(right.name));
}

function artifactFor(artifacts, packageName) {
  const prefix = `${packageName.replace("@", "").replace("/", "-")}-`;
  const artifact = artifacts.find((entry) => entry.filename.startsWith(prefix));
  if (!artifact) throw new Error(`Missing packed artifact for ${packageName}.`);
  return artifact;
}
