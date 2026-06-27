import fs from "fs";
import path from "path";
import { packageJsonFileName, readmeFileName } from "./execute-file-copy-constants.js";
import { matchPathSegments, shouldIgnore } from "./execute-file-copy-matchers.js";

function readPackageName(packageDir) {
  const packageJsonPath = path.join(packageDir, packageJsonFileName);

  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  return packageJson.name?.replace(/^@mt-kit\//, "");
}

function createMarkdownFileName(packageName) {
  return `${packageName.replace(/[\\/]+/g, "-")}.md`;
}

function copyReadmeFile(readmePath, outputDir, packageName, outputSegments = []) {
  const content = fs.readFileSync(readmePath, "utf8");
  const targetFilePath = path.join(outputDir, ...outputSegments, createMarkdownFileName(packageName));

  fs.mkdirSync(path.dirname(targetFilePath), {
    recursive: true
  });
  fs.writeFileSync(targetFilePath, content);
}

function collectPackageDirs(entryDir) {
  const packageDirs = [];

  fs.readdirSync(entryDir).forEach(firstLevelName => {
    const firstLevelDir = path.join(entryDir, firstLevelName);

    if (!fs.statSync(firstLevelDir).isDirectory()) {
      return;
    }

    const firstLevelReadmePath = path.join(firstLevelDir, readmeFileName);
    const firstLevelPackageJsonPath = path.join(firstLevelDir, packageJsonFileName);

    if (fs.existsSync(firstLevelReadmePath) && fs.existsSync(firstLevelPackageJsonPath)) {
      packageDirs.push({
        dir: firstLevelDir,
        relativeSegments: [
          firstLevelName
        ]
      });
    }

    fs.readdirSync(firstLevelDir).forEach(secondLevelName => {
      const secondLevelDir = path.join(firstLevelDir, secondLevelName);

      if (!fs.statSync(secondLevelDir).isDirectory()) {
        return;
      }

      const secondLevelReadmePath = path.join(secondLevelDir, readmeFileName);
      const secondLevelPackageJsonPath = path.join(secondLevelDir, packageJsonFileName);

      if (!fs.existsSync(secondLevelReadmePath) || !fs.existsSync(secondLevelPackageJsonPath)) {
        return;
      }

      packageDirs.push({
        dir: secondLevelDir,
        relativeSegments: [
          firstLevelName,
          secondLevelName
        ]
      });
    });
  });

  return packageDirs;
}

export function copyEntryReadme(entryDir, outputDir) {
  const packageName = readPackageName(entryDir);

  if (!packageName) {
    return;
  }

  copyReadmeFile(path.join(entryDir, readmeFileName), outputDir, packageName);
}

export function copyPackageReadmes(entryDir, outputDir, file, ignore = []) {
  collectPackageDirs(entryDir).forEach(({
    dir,
    relativeSegments
  }) => {
    if (relativeSegments.some(segment => shouldIgnore(segment, ignore))) {
      return;
    }

    if (file && !matchPathSegments(relativeSegments, file)) {
      return;
    }

    const packageName = readPackageName(dir);

    if (!packageName) {
      return;
    }

    copyReadmeFile(
      path.join(dir, readmeFileName),
      outputDir,
      packageName,
      relativeSegments.slice(0, -1)
    );
  });
}

