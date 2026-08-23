/**
 * 一括リネーム（Rename）検出モジュール (B2-03)。
 */

import type { ASTBlockNode } from "./ast_nodes.ts";

export interface RenameMatch {
  leftNode: ASTBlockNode;
  rightNode: ASTBlockNode;
  renameMap: Record<string, string>; // { "oldVar": "newVar" }
  summaryTag: string;
}

/**
 * 2 つのブロックノード間で識別子の一括リネームが行われたかを判定する。
 */
export function detectBlockRename(
  leftNode: ASTBlockNode,
  rightNode: ASTBlockNode,
): RenameMatch | null {
  // 1. 構文シグネチャが一致しているか（制御フロー・AST構造が完全一致）
  if (leftNode.syntaxSignature !== rightNode.syntaxSignature) {
    return null;
  }

  // 2. 識別子の個数が一致しているか
  if (leftNode.identifiers.length !== rightNode.identifiers.length) {
    return null;
  }

  if (leftNode.identifiers.length === 0) {
    return null;
  }

  // 3. 置換マップの構築と一貫性チェック
  const renameMap: Record<string, string> = {};
  const reverseMap: Record<string, string> = {};
  let renameCount = 0;

  for (let i = 0; i < leftNode.identifiers.length; i++) {
    const leftId = leftNode.identifiers[i];
    const rightId = rightNode.identifiers[i];

    if (leftId === rightId) {
      // 識別子が同じなら変更なし
      continue;
    }

    // 既に登録された置換ルールと整合するか
    if (renameMap[leftId] && renameMap[leftId] !== rightId) {
      return null; // 一貫性のない変更（ロジック変更の可能性）
    }
    if (reverseMap[rightId] && reverseMap[rightId] !== leftId) {
      return null;
    }

    if (!renameMap[leftId]) {
      renameMap[leftId] = rightId;
      reverseMap[rightId] = leftId;
      renameCount++;
    }
  }

  // リネームが 1 つ以上あり、かつ過度に多すぎない（最大 5 種類の同時リネーム等）
  if (renameCount === 0 || renameCount > 5) {
    return null;
  }

  const tagPairs = Object.entries(renameMap)
    .map(([oldName, newName]) => `${oldName} -> ${newName}`)
    .join(", ");

  return {
    leftNode,
    rightNode,
    renameMap,
    summaryTag: `[Rename] ${tagPairs}`,
  };
}

/**
 * Left と Right のノードリストから Rename マッチ群を検出する。
 */
export function detectRenames(
  leftNodes: ASTBlockNode[],
  rightNodes: ASTBlockNode[],
): RenameMatch[] {
  const matches: RenameMatch[] = [];

  // 名前が一致するか、または同じ位置にあるブロックを比較
  for (const leftNode of leftNodes) {
    for (const rightNode of rightNodes) {
      // 完全に同じコードならリネームではない
      if (leftNode.normalizedText === rightNode.normalizedText) {
        continue;
      }

      // 名前が同じか、または行番号が近い/同じブロック
      const isCandidate = leftNode.name === rightNode.name ||
        Math.abs(leftNode.startLine - rightNode.startLine) <= 5;

      if (isCandidate) {
        const renameMatch = detectBlockRename(leftNode, rightNode);
        if (renameMatch) {
          matches.push(renameMatch);
          break;
        }
      }
    }
  }

  return matches;
}

/**
 * Hunk 行範囲が RenameMatch と交差しているかを判定する。
 */
export function findRenameForHunk(
  lineStartLeft: number,
  lineEndLeft: number,
  lineStartRight: number,
  lineEndRight: number,
  renames: RenameMatch[],
): RenameMatch | null {
  for (const rename of renames) {
    const matchLeft = lineStartLeft > 0 &&
      lineEndLeft >= lineStartLeft &&
      lineStartLeft <= rename.leftNode.endLine &&
      lineEndLeft >= rename.leftNode.startLine;

    const matchRight = lineStartRight > 0 &&
      lineEndRight >= lineStartRight &&
      lineStartRight <= rename.rightNode.endLine &&
      lineEndRight >= rename.rightNode.startLine;

    if (matchLeft || matchRight) {
      return rename;
    }
  }
  return null;
}
