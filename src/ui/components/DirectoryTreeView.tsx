/**
 * DirectoryTreeView (B1-08)
 *
 * ディレクトリ比較時の左ペインツリービュー（開閉・差分バッジ・フィルタ・選択）。
 */

import { useEffect, useState } from "preact/hooks";
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
      {model.isGitRepo && (
        <div class="dir-git-header">
          <div class="git-header-row">
            <span
              class="git-branch-badge"
              title="Git ワーキングツリー差分モード"
            >
              🌿 {session.git?.branch ?? "HEAD"}
            </span>
            <span class="git-mode-label">HEAD vs Working Tree</span>
          </div>

          {model.hasSubRepos && (
            <div class="git-subrepo-selector-row">
              <select
                class="subrepo-selector"
                value={model.selectedSubRepo}
                title="表示する Git リポジトリの絞り込み"
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  model.setSelectedSubRepo(val);
                }}
              >
                <option value="all">
                  📦 すべてのリポジトリ ({model.subRepos.length})
                </option>
                {model.subRepos.map((sr) => (
                  <option key={sr.relativePath} value={sr.relativePath}>
                    {sr.isSubmodule ? "🔗 " : "📁 "}
                    {sr.name || "(root)"}
                    {sr.branch ? ` [${sr.branch}]` : ""}
                    {` (${sr.summary.total})`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {session.git?.worktrees && session.git.worktrees.length > 1 && (
            <select
              class="worktree-selector"
              title="Worktree 比較"
              onChange={(e) => {
                const targetWt = (e.target as HTMLSelectElement).value;
                if (targetWt && targetWt !== session.targetDir) {
                  controller.startGitSession(session.targetDir, {
                    worktreePath: targetWt,
                  });
                }
              }}
            >
              <option value="">Worktree 比較...</option>
              {session.git.worktrees.map((wt) => (
                <option key={wt.path} value={wt.path}>
                  {wt.branch ? `${wt.branch} (${wt.path})` : wt.path}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

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

  // サブリポジトリフィルタ判定（B-13）
  const selectedSubRepo = model.selectedSubRepo;
  if (selectedSubRepo !== "all") {
    if (!node.isDir) {
      if (node.subRepoPath !== selectedSubRepo) {
        return null;
      }
    } else {
      const hasMatchingSubRepo = (n: DirectoryTreeNode): boolean => {
        if (!n.isDir) return n.subRepoPath === selectedSubRepo;
        return (n.children ?? []).some(hasMatchingSubRepo);
      };
      if (!hasMatchingSubRepo(node)) {
        return null;
      }
    }
  }

  const isExpanded = model.expandedDirs.has(node.relativePath);
  const isSelected = model.selectedPath === node.relativePath;
  const isDirty = model.dirtyFiles.has(node.relativePath);

  const subRepoInfo = node.isDir
    ? model.subRepos.find((sr) => sr.relativePath === node.relativePath)
    : undefined;

  const getStatusBadge = (n: DirectoryTreeNode) => {
    if (n.gitStatus) {
      switch (n.gitStatus) {
        case "M":
          return <span class="tree-badge badge-mod">M</span>;
        case "A":
          return <span class="tree-badge badge-add">A</span>;
        case "D":
          return <span class="tree-badge badge-del">D</span>;
        case "R":
          return <span class="tree-badge badge-rename">R</span>;
        case "?":
          return <span class="tree-badge badge-untracked">?</span>;
      }
    }
    switch (n.status) {
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

  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number } | null
  >(null);

  const handleClick = () => {
    if (node.isDir) {
      controller.toggleDir(node.relativePath);
    } else {
      controller.selectFile(node.relativePath, false);
    }
  };

  const handleDoubleClick = () => {
    if (!node.isDir) {
      controller.selectFile(node.relativePath, true);
    }
  };

  const handleAuxClick = (e: MouseEvent) => {
    // 中クリックで新規タブで開く
    if (e.button === 1 && !node.isDir) {
      e.preventDefault();
      e.stopPropagation();
      controller.selectFile(node.relativePath, true);
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (!node.isDir) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    globalThis.addEventListener("click", closeMenu);
    globalThis.addEventListener("contextmenu", closeMenu);
    return () => {
      globalThis.removeEventListener("click", closeMenu);
      globalThis.removeEventListener("contextmenu", closeMenu);
    };
  }, [contextMenu]);

  return (
    <li class="tree-item-wrapper">
      <div
        class={`tree-item-row ${isSelected ? "selected" : ""} ${
          node.isDir ? "is-dir" : "is-file"
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
        onDblClick={handleDoubleClick}
        onAuxClick={handleAuxClick}
        onContextMenu={handleContextMenu}
      >
        <span class="tree-icon">
          {node.isDir
            ? (subRepoInfo?.isSubmodule
              ? "🔗"
              : subRepoInfo
              ? "📦"
              : (isExpanded ? "📂" : "📁"))
            : "📄"}
        </span>
        <span class="tree-name" title={node.relativePath}>
          {node.name}
        </span>
        {subRepoInfo && (
          <span
            class={`tree-subrepo-tag ${
              subRepoInfo.isSubmodule ? "submodule" : "repo"
            }`}
            title={subRepoInfo.isSubmodule
              ? "Git サブモジュール"
              : "Git リポジトリ"}
          >
            {subRepoInfo.isSubmodule ? "submodule" : "repo"}
          </span>
        )}
        {isDirty && <span class="tree-dirty-dot" title="未保存の変更">●</span>}
        <span class="tree-badge-container">
          {getStatusBadge(node)}
        </span>
      </div>

      {contextMenu && (
        <div
          class="tree-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <button
            type="button"
            class="context-menu-item"
            onClick={() => {
              setContextMenu(null);
              controller.selectFile(node.relativePath, false);
            }}
          >
            📄 このタブで開く
          </button>
          <button
            type="button"
            class="context-menu-item"
            onClick={() => {
              setContextMenu(null);
              controller.selectFile(node.relativePath, true);
            }}
          >
            🗂️ 新規タブで開く
          </button>
        </div>
      )}

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
