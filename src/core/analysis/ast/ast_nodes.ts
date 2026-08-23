/**
 * AST ノード（関数・クラス・メソッド等）の抽出・正規化モジュール。
 */

import type Parser from "web-tree-sitter";
import type { SupportedLanguage } from "./ast_parser.ts";

export interface ASTBlockNode {
  name: string;
  type: string;
  kind: "function" | "class" | "method" | "block";
  startLine: number; // 1-based
  endLine: number; // 1-based
  rawText: string;
  normalizedText: string;
  identifiers: string[];
  syntaxSignature: string;
}

/** 空白とコメントを除去して正規化文字列を作成 */
export function normalizeAstText(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "") // コメント除去
    .replace(/#.*/g, "") // Python コメント除去
    .replace(/\s+/g, " ")
    .trim();
}

/** ノードから識別子（identifier）を再帰的に抽出 */
export function extractIdentifiers(node: Parser.SyntaxNode): string[] {
  const result: string[] = [];
  function traverse(n: Parser.SyntaxNode) {
    if (
      n.type === "identifier" ||
      n.type === "property_identifier" ||
      n.type === "type_identifier"
    ) {
      result.push(n.text);
    }
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) traverse(child);
    }
  }
  traverse(node);
  return result;
}

/** 構文構造シグネチャ（ノード型名のツリー）を生成 */
export function buildSyntaxSignature(node: Parser.SyntaxNode): string {
  const types: string[] = [];
  function traverse(n: Parser.SyntaxNode, depth: number) {
    if (depth > 8) return; // 深すぎるツリーは制限
    // コメントや空白ノードは無視
    if (n.type.includes("comment")) return;
    types.push(`${depth}:${n.type}`);
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) traverse(child, depth + 1);
    }
  }
  traverse(node, 0);
  return types.join(",");
}

/**
 * AST のルートノードから主要なブロックノード（関数・クラス等）を抽出する。
 */
export function extractBlockNodes(
  root: Parser.SyntaxNode,
  language: SupportedLanguage,
): ASTBlockNode[] {
  const nodes: ASTBlockNode[] = [];

  function visit(node: Parser.SyntaxNode) {
    let blockInfo: {
      name: string;
      kind: "function" | "class" | "method" | "block";
    } | null = null;

    // TypeScript / JavaScript
    if (
      node.type === "function_declaration" ||
      node.type === "generator_function_declaration"
    ) {
      const nameNode = node.childForFieldName("name");
      blockInfo = {
        name: nameNode?.text || "anonymous_function",
        kind: "function",
      };
    } else if (node.type === "class_declaration") {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "anonymous_class", kind: "class" };
    } else if (node.type === "method_definition") {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "method", kind: "method" };
    } else if (
      node.type === "lexical_declaration" ||
      node.type === "variable_declaration"
    ) {
      // e.g., const foo = () => { ... }
      const declarator = node.children.find((c) =>
        c.type === "variable_declarator"
      );
      if (declarator) {
        const nameNode = declarator.childForFieldName("name");
        const valueNode = declarator.childForFieldName("value");
        if (
          valueNode &&
          (valueNode.type === "arrow_function" ||
            valueNode.type === "function_expression")
        ) {
          blockInfo = {
            name: nameNode?.text || "arrow_function",
            kind: "function",
          };
        }
      }
    } // Python
    else if (node.type === "function_definition") {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "function", kind: "function" };
    } else if (node.type === "class_definition") {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "class", kind: "class" };
    } else if (node.type === "decorated_definition") {
      const defNode = node.children.find((c) =>
        c.type === "function_definition" || c.type === "class_definition"
      );
      if (defNode) {
        const nameNode = defNode.childForFieldName("name");
        blockInfo = {
          name: nameNode?.text || "decorated",
          kind: defNode.type === "function_definition" ? "function" : "class",
        };
      }
    } // Rust
    else if (node.type === "function_item") {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "fn", kind: "function" };
    } else if (
      node.type === "struct_item" || node.type === "enum_item" ||
      node.type === "impl_item"
    ) {
      const nameNode = node.childForFieldName("name") ||
        node.childForFieldName("type");
      blockInfo = { name: nameNode?.text || "type", kind: "class" };
    } // Go
    else if (
      node.type === "function_declaration" || node.type === "method_declaration"
    ) {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "func", kind: "function" };
    } // Ruby
    else if (
      language === "ruby" &&
      (node.type === "method" || node.type === "singleton_method")
    ) {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "def", kind: "function" };
    } else if (
      language === "ruby" && (node.type === "class" || node.type === "module")
    ) {
      const nameNode = node.childForFieldName("name");
      blockInfo = { name: nameNode?.text || "class", kind: "class" };
    }

    if (blockInfo && node.endPosition.row > node.startPosition.row) {
      const rawText = node.text;
      const normalizedText = normalizeAstText(rawText);
      const identifiers = extractIdentifiers(node);
      const syntaxSignature = buildSyntaxSignature(node);

      nodes.push({
        name: blockInfo.name,
        type: node.type,
        kind: blockInfo.kind,
        startLine: node.startPosition.row + 1, // 1-based
        endLine: node.endPosition.row + 1, // 1-based
        rawText,
        normalizedText,
        identifiers,
        syntaxSignature,
      });
      // ブロックを見つけたら、その内部の直接の子ブロック探索はスキップするか、メソッド等は別途抽出
      if (blockInfo.kind === "class") {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) visit(child);
        }
      }
      return;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  }

  visit(root);
  return nodes;
}
