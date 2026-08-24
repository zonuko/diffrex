/**
 * Diffrex の CLI ヘルプおよびバージョン情報出力。
 */

export const VERSION = "0.1.0";

/** ヘルプメッセージを表示する。 */
export function printUsage(): void {
  console.log(`Diffrex - AI-Friendly Diff & Merge Tool (v${VERSION})

USAGE:
  Diffrex <base_file> <target_file> [options]
  Diffrex <local> <base> <remote> -o <output> [options]
  git diff | Diffrex -

ARGUMENTS:
  <base_file>          Original base file (left side)
  <target_file>        Target file to compare/merge into (right side)
  <local> <base> <remote>
                       3-Way merge inputs. If -o is omitted, defaults to <local>.
  -                    Read input from stdin (read-only mode)

OPTIONS:
  --prompt <text>      AI Generation prompt context
  --agent <name>       AI Agent name (e.g., Claude Code, Cursor, Aider)
  --model <name>       LLM Model name (e.g., claude-3-7-sonnet, gpt-4o)
  -w, --wait           Hold CLI process open until desktop window is closed
  -o, --output <path>  Custom output file path for merge results
  --read-only          Disable editing and write-back functionality
  --ignore-space       Force ignore whitespace differences on launch
  --ignore-comments    Force ignore comment differences on launch
  -r, --restore        Restore and resume the last active diff session
  --clear-history      Clear all saved diff comparison history
  --install-context-menu
                       Install OS context menu integration (Explorer/Finder)
  --uninstall-context-menu
                       Remove OS context menu integration
  --generate-context-menu-script
                       Output OS context menu setup script to stdout
  -h, --help           Show this help message
  -v, --version        Show version information

EXIT CODES:
  0                    Success / saved or completed without unresolved conflicts
  1                    Dismissed / closed without saving changes
  2                    Invalid CLI arguments or options
  3                    I/O or file read/write error
`);
}

/** バージョン情報を表示する。 */
export function printVersion(): void {
  console.log(`Diffrex v${VERSION}`);
}
