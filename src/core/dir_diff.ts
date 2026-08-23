/**
 * ディレクトリ再帰走査および段階的差分判定（B1-03）。
 */

import { join, normalize } from "@std/path";
import { isBinary } from "./file_io.ts";
import { type IgnoreRule, isPathIgnored, loadIgnoreRules } from "./ignore.ts";
import type {
  DirectoryDiffSessionData,
  DirectoryDiffSummary,
  DirectoryTreeNode,
  FileDiffStatus,
} from "./types.ts";

export interface FileEntryInfo {
  relativePath: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

/**
 * ディレクトリを再帰走査して相対パスとメタ情報のマップを構築する。
 */
export async function scanDirectoryEntries(
  rootPath: string,
  relDir = "",
  ignoreRules?: IgnoreRule[],
  map = new Map<string, FileEntryInfo>(),
): Promise<Map<string, FileEntryInfo>> {
  const rules = ignoreRules ?? await loadIgnoreRules(rootPath);
  const currentFullDir = relDir ? join(rootPath, relDir) : rootPath;

  try {
    for await (const entry of Deno.readDir(currentFullDir)) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const normRelPath = normalize(relPath).replace(/\\/g, "/");

      if (isPathIgnored(normRelPath, entry.isDirectory, rules)) {
        continue;
      }

      const fullPath = join(rootPath, normRelPath);
      try {
        const stat = await Deno.stat(fullPath);
        map.set(normRelPath, {
          relativePath: normRelPath,
          isDir: entry.isDirectory,
          size: stat.size,
          mtime: stat.mtime?.getTime() ?? 0,
        });

        if (entry.isDirectory) {
          await scanDirectoryEntries(rootPath, normRelPath, rules, map);
        }
      } catch {
        // アクセス不能なファイルはスキップ
      }
    }
  } catch {
    // ディレクトリ読み込みエラー
  }

  return map;
}

/**
 * ファイルの SHA-256 ハッシュを計算する。
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const data = await Deno.readFile(filePath);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 2つのファイルがバイナリか、および差分があるかを段階的に判定する。
 */
export async function compareFilePair(
  baseFullPath: string | null,
  targetFullPath: string | null,
  baseEntry?: FileEntryInfo,
  targetEntry?: FileEntryInfo,
): Promise<{ status: FileDiffStatus; isBinary: boolean }> {
  if (!baseFullPath || !baseEntry) {
    // Target のみ
    const data = await Deno.readFile(targetFullPath!);
    const isBin = isBinary(data);
    return { status: isBin ? "binary" : "added", isBinary: isBin };
  }

  if (!targetFullPath || !targetEntry) {
    // Base のみ
    const data = await Deno.readFile(baseFullPath);
    const isBin = isBinary(data);
    return { status: isBin ? "binary" : "deleted", isBinary: isBin };
  }

  // 両方存在
  const [baseHead, targetHead] = await Promise.all([
    readHeadBytes(baseFullPath, 8192),
    readHeadBytes(targetFullPath, 8192),
  ]);

  if (isBinary(baseHead) || isBinary(targetHead)) {
    return { status: "binary", isBinary: true };
  }

  // 1. サイズ判定
  if (baseEntry.size !== targetEntry.size) {
    return { status: "modified", isBinary: false };
  }

  // 2. mtime 判定（同一なら同一ファイルとみなす）
  if (baseEntry.mtime > 0 && baseEntry.mtime === targetEntry.mtime) {
    return { status: "identical", isBinary: false };
  }

  // 3. ハッシュ判定
  const [baseHash, targetHash] = await Promise.all([
    computeFileHash(baseFullPath),
    computeFileHash(targetFullPath),
  ]);

  if (baseHash === targetHash) {
    return { status: "identical", isBinary: false };
  }

  return { status: "modified", isBinary: false };
}

async function readHeadBytes(
  filePath: string,
  length: number,
): Promise<Uint8Array> {
  const file = await Deno.open(filePath, { read: true });
  try {
    const buf = new Uint8Array(length);
    const n = await file.read(buf);
    return n ? buf.subarray(0, n) : new Uint8Array(0);
  } finally {
    file.close();
  }
}

/**
 * 平坦なエントリマップからツリー構造を構築する。
 */
export function buildDirectoryTree(
  entries: Map<string, {
    isDir: boolean;
    status: FileDiffStatus;
    sizeLeft?: number;
    sizeRight?: number;
  }>,
): DirectoryTreeNode {
  const root: DirectoryTreeNode = {
    name: "",
    relativePath: "",
    isDir: true,
    status: "identical",
    children: [],
  };

  for (const [relPath, info] of entries.entries()) {
    const parts = relPath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentRel = parts.slice(0, i + 1).join("/");

      if (isLast) {
        // リーフノード
        let existing = current.children?.find((c) => c.name === part);
        if (!existing) {
          existing = {
            name: part,
            relativePath: currentRel,
            isDir: info.isDir,
            status: info.status,
            sizeLeft: info.sizeLeft,
            sizeRight: info.sizeRight,
            children: info.isDir ? [] : undefined,
          };
          current.children = current.children || [];
          current.children.push(existing);
        } else {
          existing.status = info.status;
          existing.sizeLeft = info.sizeLeft;
          existing.sizeRight = info.sizeRight;
        }
      } else {
        // 中間ディレクトリ
        let nextDir = current.children?.find((c) => c.name === part && c.isDir);
        if (!nextDir) {
          nextDir = {
            name: part,
            relativePath: currentRel,
            isDir: true,
            status: "identical",
            children: [],
          };
          current.children = current.children || [];
          current.children.push(nextDir);
        }
        current = nextDir;
      }
    }
  }

  // ディレクトリの差分ステータスを子要素から集約 & ソート
  aggregateAndSortTree(root);
  return root;
}

function aggregateAndSortTree(node: DirectoryTreeNode): FileDiffStatus {
  if (!node.isDir || !node.children) {
    return node.status;
  }

  let hasMod = false;
  let hasAdd = false;
  let hasDel = false;
  let hasBin = false;

  for (const child of node.children) {
    const childStatus = aggregateAndSortTree(child);
    if (childStatus === "modified") hasMod = true;
    else if (childStatus === "added") hasAdd = true;
    else if (childStatus === "deleted") hasDel = true;
    else if (childStatus === "binary") hasBin = true;
  }

  // ディレクトリ優先、名前昇順でソート
  node.children.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  if (hasMod || (hasAdd && hasDel) || (hasAdd && node.status !== "added")) {
    node.status = "modified";
  } else if (hasAdd) {
    node.status = "added";
  } else if (hasDel) {
    node.status = "deleted";
  } else if (hasBin) {
    node.status = "binary";
  } else {
    node.status = "identical";
  }

  return node.status;
}

/**
 * 2つのディレクトリを走査・比較して DirectoryDiffSessionData を構築する。
 */
export async function compareDirectories(
  baseDir: string,
  targetDir: string,
  options: {
    readOnly?: boolean;
    prompt?: string;
    agent?: string;
    model?: string;
  } = {},
): Promise<DirectoryDiffSessionData> {
  const [baseRules, targetRules] = await Promise.all([
    loadIgnoreRules(baseDir),
    loadIgnoreRules(targetDir),
  ]);

  // マージした除外ルール
  const mergedRules = [...baseRules, ...targetRules];

  const [baseMap, targetMap] = await Promise.all([
    scanDirectoryEntries(baseDir, "", mergedRules),
    scanDirectoryEntries(targetDir, "", mergedRules),
  ]);

  const allRelPaths = new Set<string>([
    ...baseMap.keys(),
    ...targetMap.keys(),
  ]);

  const summary: DirectoryDiffSummary = {
    total: 0,
    modified: 0,
    added: 0,
    deleted: 0,
    identical: 0,
    binary: 0,
    image: 0,
  };

  const resultMap = new Map<string, {
    isDir: boolean;
    status: FileDiffStatus;
    sizeLeft?: number;
    sizeRight?: number;
  }>();

  for (const relPath of allRelPaths) {
    const baseEntry = baseMap.get(relPath);
    const targetEntry = targetMap.get(relPath);
    const isDir = (baseEntry?.isDir ?? false) || (targetEntry?.isDir ?? false);

    if (isDir) {
      resultMap.set(relPath, {
        isDir: true,
        status: "identical",
      });
      continue;
    }

    summary.total++;

    const baseFullPath = baseEntry ? join(baseDir, relPath) : null;
    const targetFullPath = targetEntry ? join(targetDir, relPath) : null;

    const { status } = await compareFilePair(
      baseFullPath,
      targetFullPath,
      baseEntry,
      targetEntry,
    );

    resultMap.set(relPath, {
      isDir: false,
      status,
      sizeLeft: baseEntry?.size,
      sizeRight: targetEntry?.size,
    });

    summary[status]++;
  }

  const tree = buildDirectoryTree(resultMap);

  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode: "directory",
    baseDir,
    targetDir,
    readOnly: options.readOnly ?? false,
    tree,
    summary,
    aiContext: (options.prompt || options.agent || options.model)
      ? {
        prompt: options.prompt,
        agent: options.agent,
        model: options.model,
      }
      : undefined,
  };
}
