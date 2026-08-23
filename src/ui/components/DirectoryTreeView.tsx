/**
 * DirectoryTreeView (B1-08)
 *
 * ディレクトリ比較時の左ペインツリービュー（開閉・差分バッジ・フィルタ・選択）。
 */

import type { DirectoryTreeNode, FileDiffStatus } from "../../core/types.ts";
import type { DirectoryController } from "../controller/dir_controller.ts";
import type { DirectoryDiffModel } from "../model/dir_diff_model.ts";

export interface DirectoryTreeViewProps {
  model: DirectoryDiffModel;
  controller: DirectoryController;
}

export function DirectoryTreeView({
  model,
  controller,
}: DirectoryTreeViewProps) {
  const session = model.dirSession;
  if (!session) return null;

  const { tree, summary } = session;
  const filterStatus = model.filterStatus;

  return (
    <aside class="dir-tree-pane">
      <div class="dir-tree-toolbar">
        <div class="dir-tree-summary">
          {summary.modified > 0 && (
            <span class="badge-count badge-mod">{summary.modified} M</span>
          )}
          {summary.added > 0 && (
            <span class="badge-count badge-add">{summary.added} A</span>
          )}
          {summary.deleted > 0 && (
            <span class="badge-count badge-del">{summary.deleted} D</span>
          )}
          <span class="badge-count badge-total">計 {summary.total}</span>
        </div>

        <div class="dir-tree-actions">
          <select
            class="dir-tree-filter"
            value={filterStatus}
            onChange={(e) =>
              model.setFilterStatus(
                (e.target as HTMLSelectElement).value as FileDiffStatus | "all",
              )}
          >
            <option value="all">全ファイル表示</option>
            <option value="modified">変更のみ (M)</option>
            <option value="added">追加のみ (A)</option>
            <option value="deleted">削除のみ (D)</option>
          </select>
          <button
            type="button"
            class="tree-action-btn"
            title="すべて展開"
            onClick={() => model.expandAll()}
          >
            ⊞
          </button>
          <button
            type="button"
            class="tree-action-btn"
            title="すべて折りたたむ"
            onClick={() => model.collapseAll()}
          >
            ⊟
          </button>
        </div>
      </div>

      <div class="dir-tree-content">
        {tree.children && tree.children.length > 0
          ? (
            <ul class="tree-root">
              {tree.children.map((child) => (
                <TreeNodeItem
                  key={child.relativePath}
                  node={child}
                  model={model}
                  controller={controller}
                  depth={0}
                />
              ))}
            </ul>
          )
          : <div class="tree-empty">ファイルが見つかりません</div>}
      </div>
    </aside>
  );
}

interface TreeNodeItemProps {
  node: DirectoryTreeNode;
  model: DirectoryDiffModel;
  controller: DirectoryController;
  depth: number;
}

function TreeNodeItem({
  node,
  model,
  controller,
  depth,
}: TreeNodeItemProps) {
  const filterStatus = model.filterStatus;

  // フィルタ判定
  if (filterStatus !== "all") {
    if (!node.isDir && node.status !== filterStatus) {
      return null;
    }
    if (node.isDir) {
      const hasMatchingChild = (n: DirectoryTreeNode): boolean => {
        if (!n.isDir) return n.status === filterStatus;
        return (n.children ?? []).some(hasMatchingChild);
      };
      if (!hasMatchingChild(node)) {
        return null;
      }
    }
  }

  const isExpanded = model.expandedDirs.has(node.relativePath);
  const isSelected = model.selectedPath === node.relativePath;
  const isDirty = model.dirtyFiles.has(node.relativePath);

  const getStatusBadge = (status: FileDiffStatus) => {
    switch (status) {
      case "modified":
        return <span class="tree-badge badge-mod">M</span>;
      case "added":
        return <span class="tree-badge badge-add">A</span>;
      case "deleted":
        return <span class="tree-badge badge-del">D</span>;
      case "binary":
        return <span class="tree-badge badge-bin">BIN</span>;
      case "identical":
        return null;
    }
  };

  const handleClick = () => {
    if (node.isDir) {
      controller.toggleDir(node.relativePath);
    } else {
      controller.selectFile(node.relativePath);
    }
  };

  return (
    <li class="tree-item-wrapper">
      <div
        class={`tree-item-row ${isSelected ? "selected" : ""} ${
          node.isDir ? "is-dir" : "is-file"
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
      >
        <span class="tree-icon">
          {node.isDir ? (isExpanded ? "📂" : "📁") : "📄"}
        </span>
        <span class="tree-name" title={node.relativePath}>
          {node.name}
        </span>
        {isDirty && <span class="tree-dirty-dot" title="未保存の変更">●</span>}
        <span class="tree-badge-container">
          {getStatusBadge(node.status)}
        </span>
      </div>

      {node.isDir && isExpanded && node.children && (
        <ul class="tree-subtree">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.relativePath}
              node={child}
              model={model}
              controller={controller}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
