/**
 * AST セマンティック Diff 解析統合エントリーポイント (B2-01, B2-02, B2-03)。
 */

import { parseCodeToAst, type SupportedLanguage } from "./ast_parser.ts";
import { type ASTBlockNode, extractBlockNodes } from "./ast_nodes.ts";
import {
  detectBlockMoves,
  findMoveForHunk,
  type MoveMatch,
} from "./move_detector.ts";
import {
  detectRenames,
  findRenameForHunk,
  type RenameMatch,
} from "./rename_detector.ts";

export * from "./ast_parser.ts";
export * from "./ast_nodes.ts";
export * from "./move_detector.ts";
export * from "./rename_detector.ts";

export interface AstDiffAnalysisResult {
  language: SupportedLanguage | null;
  leftNodes: ASTBlockNode[];
  rightNodes: ASTBlockNode[];
  moves: MoveMatch[];
  renames: RenameMatch[];
}

/**
 * 2 つのコード文字列の AST を比較し、Move および Rename の検出結果を返す。
 * 言語が未対応またはパース失敗時は null を返す（Graceful Fallback）。
 */
export async function analyzeAstDiff(
  leftContent: string,
  rightContent: string,
  filename?: string,
): Promise<AstDiffAnalysisResult | null> {
  const targetLang = filename || "sample.ts";
  const leftParsed = await parseCodeToAst(leftContent, targetLang);
  const rightParsed = await parseCodeToAst(rightContent, targetLang);

  if (!leftParsed || !rightParsed) {
    return null;
  }

  const leftNodes = extractBlockNodes(
    leftParsed.tree.rootNode,
    leftParsed.language,
  );
  const rightNodes = extractBlockNodes(
    rightParsed.tree.rootNode,
    rightParsed.language,
  );

  const moves = detectBlockMoves(leftNodes, rightNodes);
  const renames = detectRenames(leftNodes, rightNodes);

  return {
    language: leftParsed.language,
    leftNodes,
    rightNodes,
    moves,
    renames,
  };
}

export { findMoveForHunk, findRenameForHunk };
