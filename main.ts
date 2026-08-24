/**
 * Diffrex エントリポイント（Phase 1, Phase B-1）。
 */

import { parseCliArgs } from "./src/cli/args.ts";
import { printUsage, printVersion } from "./src/cli/usage.ts";
import { validateCliArgs } from "./src/cli/validate.ts";
import { compareDirectories } from "./src/core/dir_diff.ts";
import {
  type FileMetadata,
  readFileTarget,
  readStdinTarget,
} from "./src/core/file_io.ts";
import { buildSession, buildSessionAsync } from "./src/core/session.ts";
import {
  clearHistory,
  loadSessionSnapshot,
  recordHistoryEntry,
} from "./src/core/history.ts";
import {
  generateContextMenuScript,
  installContextMenu,
  uninstallContextMenu,
} from "./src/core/os/context_menu.ts";
import type {
  DiffSessionData,
  DirectoryDiffSessionData,
  FileTarget,
} from "./src/core/types.ts";
import {
  type AnySessionData,
  isDesktopRuntime,
  startDesktopServer,
} from "./src/desktop/window.ts";

export { isDesktopRuntime };

export interface RunMainOptions {
  /** テスト等のための即時クローズ制御 */
  autoClose?: boolean;
}

/** CLI エントリ。CLI 引数をパース・読み込み・起動し終了コードを返す。 */
export async function runMain(
  args: string[],
  options?: RunMainOptions,
): Promise<number> {
  try {
    const parseRes = parseCliArgs(args);
    if (!parseRes.ok) {
      console.error(`Diffrex: error: ${parseRes.error}`);
      printUsage();
      return parseRes.exitCode;
    }

    const { parsed } = parseRes;

    if (parsed.help) {
      printUsage();
      return 0;
    }

    if (parsed.version) {
      printVersion();
      return 0;
    }

    if (parsed.installContextMenu) {
      const res = await installContextMenu();
      if (res.ok) {
        console.log(`Diffrex: ${res.message}`);
        return 0;
      } else {
        console.error(`Diffrex: ${res.message}`);
        return 1;
      }
    }

    if (parsed.uninstallContextMenu) {
      const res = await uninstallContextMenu();
      console.log(`Diffrex: ${res.message}`);
      return res.ok ? 0 : 1;
    }

    if (parsed.generateContextMenuScript) {
      const res = generateContextMenuScript();
      console.log(res.script || res.message);
      return 0;
    }

    if (parsed.clearHistory) {
      await clearHistory();
      console.log("Diffrex: 比較履歴をクリアしました。");
      return 0;
    }

    if (parsed.restore && parsed.positional.length === 0) {
      const snapshot = await loadSessionSnapshot();
      if (!snapshot) {
        console.error("Diffrex: 復元可能なセッションが見つかりません。");
        return 1;
      }
      parsed.left = snapshot.leftPath;
      parsed.right = snapshot.rightPath;
      parsed.base = snapshot.basePath;
      parsed.output = snapshot.outputPath;
      parsed.mode = snapshot.mode;
      parsed.readOnly = snapshot.readOnly ?? parsed.readOnly;
      parsed.prompt = snapshot.prompt ?? parsed.prompt;
      parsed.agent = snapshot.agent ?? parsed.agent;
      parsed.model = snapshot.model ?? parsed.model;
      parsed.positional = [snapshot.leftPath, snapshot.rightPath];
    }

    const validRes = await validateCliArgs(parsed);
    if (!validRes.ok) {
      console.error(`Diffrex: error: ${validRes.error}`);
      if (validRes.showUsage) {
        printUsage();
      }
      return validRes.exitCode;
    }

    let session: AnySessionData;
    const metadataMap = new Map<string, FileMetadata>();

    if (parsed.mode === "welcome") {
      session = { mode: "welcome" };
    } else if (parsed.mode === "directory") {
      try {
        const dirSession: DirectoryDiffSessionData = await compareDirectories(
          parsed.left!,
          parsed.right!,
          {
            readOnly: parsed.readOnly,
            prompt: parsed.prompt,
            agent: parsed.agent,
            model: parsed.model,
          },
        );
        session = dirSession;
        await recordHistoryEntry({
          mode: "directory",
          leftPath: parsed.left!,
          rightPath: parsed.right!,
          prompt: parsed.prompt,
          agent: parsed.agent,
          model: parsed.model,
          readOnly: parsed.readOnly,
        });
      } catch (err) {
        console.error(
          `Diffrex: error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return 3;
      }
    } else {
      // ファイルおよび stdin の読み込み
      let leftTarget: FileTarget;
      let rightTarget: FileTarget;
      let baseTarget: FileTarget | undefined;

      let singleConflictInfo:
        | import("./src/core/types.ts").ThreeWaySessionInfo
        | undefined;

      try {
        if (parsed.mode === "stdin") {
          const stdinRes = await readStdinTarget({ readOnly: true });
          leftTarget = stdinRes.target;
          rightTarget = {
            path: "<stdin>",
            content: stdinRes.target.content,
            readOnly: true,
          };
          metadataMap.set("<stdin>", stdinRes.meta);
          session = buildSession({
            args: parsed,
            left: leftTarget,
            right: rightTarget,
          });
        } else if (parsed.mode === "3way") {
          if (!parsed.base) {
            // 単一コンフリクトファイルの自動分解
            const { parseConflictMarkers, parsedConflictToThreeWayDiff } =
              await import(
                "./src/core/conflict_parser.ts"
              );
            const singleRes = await readFileTarget(parsed.left!, {
              readOnly: parsed.readOnly,
            });
            const parsedConflict = parseConflictMarkers(
              singleRes.target.content,
            );
            const threeWayRes = parsedConflictToThreeWayDiff(parsedConflict);
            singleConflictInfo = {
              hunks: threeWayRes.hunks,
              initialMergedContent: threeWayRes.initialMergedContent,
              conflictCount: threeWayRes.conflictCount,
            };
            leftTarget = {
              path: `${parsed.left} (LOCAL)`,
              content: parsedConflict.localContent,
              readOnly: true,
            };
            baseTarget = {
              path: `${parsed.left} (BASE)`,
              content: parsedConflict.baseContent,
              readOnly: true,
            };
            rightTarget = {
              path: `${parsed.left} (REMOTE)`,
              content: parsedConflict.remoteContent,
              readOnly: true,
            };
            metadataMap.set(parsed.left!, singleRes.meta);
            metadataMap.set(leftTarget.path, singleRes.meta);
            metadataMap.set(baseTarget.path, singleRes.meta);
            metadataMap.set(rightTarget.path, singleRes.meta);
          } else {
            const [leftRes, baseRes, rightRes] = await Promise.all([
              readFileTarget(parsed.left!, { readOnly: parsed.readOnly }),
              readFileTarget(parsed.base, { readOnly: parsed.readOnly }),
              readFileTarget(parsed.right!, { readOnly: parsed.readOnly }),
            ]);
            leftTarget = leftRes.target;
            baseTarget = baseRes.target;
            rightTarget = rightRes.target;
            metadataMap.set(leftTarget.path, leftRes.meta);
            metadataMap.set(baseTarget.path, baseRes.meta);
            metadataMap.set(rightTarget.path, rightRes.meta);
          }
          session = buildSession({
            args: parsed,
            left: leftTarget,
            right: rightTarget,
            base: baseTarget,
            threeWayInfo: singleConflictInfo,
          });
          await recordHistoryEntry({
            mode: "3way",
            leftPath: parsed.left!,
            rightPath: parsed.right!,
            basePath: parsed.base,
            outputPath: parsed.output,
            prompt: parsed.prompt,
            agent: parsed.agent,
            model: parsed.model,
            readOnly: parsed.readOnly,
          });
        } else {
          // 2-Way
          const { isImageExtension } = await import(
            "./src/core/media/image_detector.ts"
          );
          const isLeftImage = isImageExtension(parsed.left!);
          const isRightImage = isImageExtension(parsed.right!);

          if (isLeftImage || isRightImage) {
            const { readImageTarget } = await import("./src/core/file_io.ts");
            const [leftImg, rightImg] = await Promise.all([
              readImageTarget(parsed.left!),
              readImageTarget(parsed.right!),
            ]);
            leftTarget = {
              path: parsed.left!,
              content: "",
              readOnly: true,
            };
            rightTarget = {
              path: parsed.right!,
              content: "",
              readOnly: Boolean(parsed.readOnly),
            };
            session = buildSession({
              args: parsed,
              left: leftTarget,
              right: rightTarget,
              imageSession: {
                sessionId: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                mode: "image",
                left: leftImg,
                right: rightImg,
                readOnly: Boolean(parsed.readOnly),
                aiContext: parsed.prompt || parsed.agent || parsed.model
                  ? {
                    prompt: parsed.prompt,
                    agent: parsed.agent,
                    model: parsed.model,
                  }
                  : undefined,
              },
            });
            await recordHistoryEntry({
              mode: "image" as import("./src/core/types.ts").DiffMode,
              leftPath: parsed.left!,
              rightPath: parsed.right!,
              prompt: parsed.prompt,
              agent: parsed.agent,
              model: parsed.model,
              readOnly: parsed.readOnly,
            });
          } else {
            const [leftRes, rightRes] = await Promise.all([
              readFileTarget(parsed.left!, { readOnly: parsed.readOnly }),
              readFileTarget(parsed.right!, { readOnly: parsed.readOnly }),
            ]);
            leftTarget = leftRes.target;
            rightTarget = rightRes.target;
            metadataMap.set(leftTarget.path, leftRes.meta);
            metadataMap.set(rightTarget.path, rightRes.meta);

            // セッションの生成
            session = await buildSessionAsync({
              args: parsed,
              left: leftTarget,
              right: rightTarget,
              base: baseTarget,
              threeWayInfo: singleConflictInfo,
            });
            await recordHistoryEntry({
              mode: "2way",
              leftPath: parsed.left!,
              rightPath: parsed.right!,
              prompt: parsed.prompt,
              agent: parsed.agent,
              model: parsed.model,
              readOnly: parsed.readOnly,
              totalHunks: "hunks" in session
                ? (session as DiffSessionData).hunks.length
                : 0,
            });
          }
        }
      } catch (err) {
        console.error(
          `Diffrex: error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return 3;
      }
    }

    // Desktop / Web サーバの起動
    const serverInstance = startDesktopServer(session, {
      metadataMap,
    });

    if (options?.autoClose) {
      await serverInstance.close();
      return 0;
    }

    if (isDesktopRuntime() || parsed.wait) {
      // ウィンドウが閉じるまで待機
      const exitCode = await serverInstance.waitClosed();
      await serverInstance.close();
      return exitCode;
    }

    return 0;
  } catch (err) {
    console.error(
      `Diffrex: error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 3;
  }
}

if (import.meta.main) {
  try {
    const exitCode = await runMain(Deno.args);
    Deno.exit(exitCode);
  } catch (err) {
    console.error(
      `Diffrex: unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    Deno.exit(3);
  }
}
