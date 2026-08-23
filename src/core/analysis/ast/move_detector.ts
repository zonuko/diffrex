/**
 * コードブロック移動（Move）検出モジュール (B2-02)。
 */

import type { ASTBlockNode } from "./ast_nodes.ts";
import type { MoveAnnotation } from "../../types.ts";

export interface MoveMatch {
  leftNode: ASTBlockNode;
  rightNode: ASTBlockNode;
  isIdentical: boolean;
  annotation: MoveAnnotation;
}

/**
 * Left（Base）と Right（Target）の AST ブロックノード群から移動（Move）ペアを検出する。
 */
export function detectBlockMoves(
  leftNodes: ASTBlockNode[],
  rightNodes: ASTBlockNode[],
): MoveMatch[] {
  const matches: MoveMatch[] = [];
  const usedRightIndices = new Set<number>();

  for (const leftNode of leftNodes) {
    // 1. まず完全一致（正規化コードが一致し、行位置が異なる）を探す
    let foundIndex = -1;
    for (let rIdx = 0; rIdx < rightNodes.length; rIdx++) {
      if (usedRightIndices.has(rIdx)) continue;
      const rightNode = rightNodes[rIdx];

      // 同じ行位置で同じ内容なら移動ではない（不変コード）
      if (
        leftNode.startLine === rightNode.startLine &&
        leftNode.endLine === rightNode.endLine
      ) {
        continue;
      }

      if (leftNode.normalizedText === rightNode.normalizedText) {
        foundIndex = rIdx;
        break;
      }
    }

    if (foundIndex !== -1) {
      const rightNode = rightNodes[foundIndex];
      usedRightIndices.add(foundIndex);

      matches.push({
        leftNode,
        rightNode,
        isIdentical: true,
        annotation: {
          fromLineStart: leftNode.startLine,
          fromLineEnd: leftNode.endLine,
          toLineStart: rightNode.startLine,
          toLineEnd: rightNode.endLine,
          nodeName: leftNode.name,
          nodeType: leftNode.kind,
        },
      });
    }
  }

  return matches;
}

/**
 * Hunk の行範囲と MoveMatch が交差しているかを判定する。
 */
export function findMoveForHunk(
  lineStartLeft: number,
  lineEndLeft: number,
  lineStartRight: number,
  lineEndRight: number,
  moves: MoveMatch[],
): MoveMatch | null {
  for (const move of moves) {
    // Left 側での交差（削除された側の Hunk）
    const matchLeft = lineStartLeft > 0 &&
      lineEndLeft >= lineStartLeft &&
      lineStartLeft <= move.annotation.fromLineEnd &&
      lineEndLeft >= move.annotation.fromLineStart;

    // Right 側での交差（追加された側の Hunk）
    const matchRight = lineStartRight > 0 &&
      lineEndRight >= lineStartRight &&
      lineStartRight <= move.annotation.toLineEnd &&
      lineEndRight >= move.annotation.toLineStart;

    if (matchLeft || matchRight) {
      return move;
    }
  }
  return null;
}
