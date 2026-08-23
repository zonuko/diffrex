# Diffrex

**English** | [日本語 (Japanese)](docs/README-ja.md)

> [!WARNING]
> **Work in Progress (WIP)**: Diffrex is currently under active development.
> Features, interfaces, and specifications are continually evolving. Please note
> that GitHub **Issues** and **Pull Requests** are temporarily disabled during
> this early WIP stage. They will be fully opened once the project exits the WIP
> phase.

An AI-friendly diff and merge tool built with **Deno Desktop**. Designed to
streamline AI-assisted code reviews by displaying prompts and model metadata,
automatically folding noise diffs, and highlighting high-risk modifications.

---

## 🦖 Origin of the Name

The name **Diffrex** is a blend of two words:

- **Diff**: Difference and comparison between files or directories.
- **Rex**: The **T-Rex** dinosaur mascot of Deno.

It represents the ambition to be the "King of Deno-native Diff Tools" tailored
for modern AI-assisted engineering workflows.

---

## 🌟 Key Features

- 🤖 **AI Context Display**: Shows the prompt, agent name (e.g. Claude Code,
  Cursor, Aider), and LLM model (e.g. `claude-3-7-sonnet`, `gpt-4o`) right in
  the header toolbar.
- 🧹 **Automatic Noise Diff Folding**: Automatically detects and collapses
  whitespace, indentation, and comment-only changes, keeping your focus on
  essential logic changes (`Ctrl+N` to toggle all).
- ⚠️ **High-Risk Change Warnings**: Identifies potentially dangerous edits—such
  as massive deletions, altered function signatures / type definitions, and
  removed error handling—with visual warning badges.
- ⚡ **Fast Review Triage**: Quick one-key hunk actions: `A` (Accept), `R`
  (Reject), and `E` (Edit).
- 📁 **Directory & Folder Comparison**: Recursively compares entire directories
  with an interactive tree view, status indicators (Added, Deleted, Modified),
  and instant file switching.
- 🔀 **3-Way Merge & Conflict Resolution**: Handles 3-way file comparisons and
  parses Git conflict markers directly for interactive merging.
- 🖼️ **Rich Media & Structured Data Diff**: Supports side-by-side / swipe
  comparisons for images (PNG, JPEG, SVG) and key-sorted canonical comparisons
  for JSON, YAML, and CSV.
- 🌲 **AST Semantic Diff**: Powered by Tree-sitter to detect moved code blocks
  (`Move`) and renamed identifiers (`Rename`).
- 🛡️ **Safe Atomic Saving**: Employs atomic file replacement via directory-local
  temporary files and `Deno.rename`, preventing file corruption if interrupted
  while preserving line endings (LF / CRLF) and UTF-8 BOM.
- 🏛️ **Classical Smalltalk-80 GUI MVC**: Built cleanly with a zero-dependency
  classical GUI MVC architecture and CodeMirror 6 (`@codemirror/merge`).

---

## 📋 Prerequisites

- **Deno v2.9.0** or higher

> [!NOTE]
> Deno Desktop features are available in Deno v2.9+ via the `deno desktop`
> subcommand and `Deno.BrowserWindow` API.

---

## 📦 Installation & Local Build

> [!NOTE]
> **No Pre-built Releases Yet**: Since GitHub Releases are not yet provided
> during this early WIP phase, running Diffrex as an installed application
> requires cloning the repository and building it locally (or running it
> directly via Deno).

### 1. Clone the Repository

```powershell
git clone https://github.com/zonuko/diffrex.git
cd diffrex
```

### 2. Prepare Assets (UI Bundle & Tree-sitter WASM)

```powershell
deno task build:ui
deno task setup:wasms
```

### 3. Compile Standalone Binary

Compile Diffrex into a standalone binary:

```powershell
deno task compile
```

This outputs the executable to `dist/diffrex` (or `dist/diffrex.exe` on
Windows). Add the `dist/` directory to your `PATH` or copy the binary to a
directory already in your `PATH` to run `diffrex` from any terminal.

### 4. Run Directly with Deno (No Compilation Needed)

Alternatively, you can run Diffrex directly with Deno during development:

```powershell
# Web / Default UI
deno task dev path/to/base path/to/target

# Desktop Window (Deno Desktop)
deno task dev:desktop -- path/to/base path/to/target
```

---

## 🚀 Usage

### 1. Directory / Folder Comparison

Compare two directory trees and inspect individual file diffs:

```powershell
diffrex path/to/base_dir path/to/target_dir
```

### 2. 2-Way File Comparison

Compare an original base file with an AI-generated or modified target file:

```powershell
diffrex src/base.ts src/target.ts
```

Passing AI generation context:

```powershell
diffrex src/base.ts src/target.ts `
  --prompt "Refactor UserService to async and add logging" `
  --agent "Claude Code" `
  --model "claude-3-7-sonnet"
```

### 3. No-Argument Launch (Welcome Screen)

Launch without arguments to open the Welcome screen with an interactive file and
folder picker:

```powershell
diffrex
```

### 4. Stdin Pipe (Read-Only Mode)

Stream unified diffs directly into Diffrex via pipe:

```powershell
git diff | diffrex -
```

### 5. 3-Way Merge

```powershell
diffrex local.ts base.ts remote.ts -o merged.ts
```

### 6. CLI Options

| Option                  | Description                                                              |
| :---------------------- | :----------------------------------------------------------------------- |
| `--prompt <text>`       | The prompt string used for AI generation                                 |
| `--agent <name>`        | Name of the AI agent / assistant (e.g. `Claude Code`, `Cursor`, `Aider`) |
| `--model <name>`        | LLM model name (e.g. `claude-3-7-sonnet`, `gpt-4o`)                      |
| `-w`, `--wait`          | Wait for the desktop window to close before exiting the CLI process      |
| `-o`, `--output <path>` | Save path for merge output (defaults to the right-hand target file)      |
| `--read-only`           | Open in read-only viewing mode (disables editing and saving)             |
| `--ignore-space`        | Ignore whitespace differences on startup                                 |
| `--ignore-comments`     | Ignore comment differences on startup                                    |
| `-h`, `--help`          | Display CLI help message                                                 |
| `-v`, `--version`       | Show version information                                                 |

---

## ⌨️ Keybindings

| Action                 | Keybinding       | Description                                                      |
| :--------------------- | :--------------- | :--------------------------------------------------------------- |
| **Next Hunk**          | `Alt+Down` / `J` | Navigate to the next diff hunk                                   |
| **Previous Hunk**      | `Alt+Up` / `K`   | Navigate to the previous diff hunk                               |
| **Accept**             | `A`              | Accept the current hunk and jump to the next                     |
| **Reject**             | `R`              | Revert the current hunk to the base version and jump to the next |
| **Edit**               | `E` / `Enter`    | Focus the editor at the current hunk                             |
| **Merge Left → Right** | `Ctrl+R`         | Copy code from base (left) to target (right)                     |
| **Merge Right → Left** | `Ctrl+L`         | Copy code from target (right) to base (left)                     |
| **Toggle Noise**       | `Ctrl+N`         | Toggle folding/unfolding for noise hunks                         |
| **Save**               | `Ctrl+S`         | Save edited target file to disk                                  |
| **Save & Close**       | `Ctrl+Enter`     | Save changes and close window with exit code 0                   |

> [!NOTE]
> `J` and `K` shortcuts operate exclusively in navigation mode and will not
> interfere with text input while editing.

---

## 🔧 Git Integration (`.gitconfig`)

### 1. Direct Use in Development

Pipe Git diffs directly into Diffrex without global installation:

```powershell
# Review working tree changes in Diffrex (Web UI)
git diff | deno task dev -

# Review in Desktop Window (Deno Desktop)
git diff | deno task dev:desktop -- -

# Review staged changes
git diff --cached | deno task dev -

# Review diff against previous commit
git diff HEAD~1 | deno task dev -
```

---

### 2. Register as `git difftool` / `git mergetool`

Configure Git to launch Diffrex directly from `git difftool` and
`git mergetool`.

#### A. Using the Compiled Standalone Binary

```powershell
# Compile the binary (generates dist/diffrex)
deno task compile

# Register as Git difftool
git config --global diff.tool diffrex
git config --global difftool.diffrex.cmd 'diffrex "$LOCAL" "$REMOTE" --wait'
git config --global difftool.prompt false

# Register as Git mergetool
git config --global merge.tool diffrex
git config --global mergetool.diffrex.cmd 'diffrex "$LOCAL" "$BASE" "$REMOTE" -o "$MERGED" --wait'
git config --global mergetool.diffrex.trustExitCode true
```

#### B. Using Deno Directly

```powershell
git config --global diff.tool diffrex
git config --global difftool.diffrex.cmd 'deno run -A /path/to/diffrex/main.ts "$LOCAL" "$REMOTE" --wait'
git config --global difftool.prompt false
```

#### Commands

```powershell
# 1. Compare modified files one by one
git difftool

# 2. 🌟 Compare entire repository changes in Directory Tree mode
git difftool -d

# 3. Compare changes against another branch or commit
git difftool -d main
git difftool -d HEAD~1

# 4. Resolve merge conflicts interactively
git mergetool
```

---

## 🔢 Exit Codes

| Code | Description                                                   |
| :--- | :------------------------------------------------------------ |
| `0`  | Success (changes saved or cleanly viewed in read-only mode)   |
| `1`  | Cancelled / closed without saving                             |
| `2`  | Invalid CLI arguments or options                              |
| `3`  | I/O Error (file read/write failure, unsupported binary, etc.) |

---

## ⚠️ Known Limitations

- **Automated 3-Way Conflict Solving**: Full 3-way conflict resolution view is
  supported; advanced automatic 3-way AST merge heuristic is scheduled for
  future milestones (v1.0+).
- **Unsupported Binary Formats**: Dedicated text and image (PNG/JPEG/SVG)
  diffing is supported. Unsupported binary files containing `NUL` bytes are
  rejected safely.

---

## 🛠️ Demo & Development Commands

```powershell
# 1. Directory comparison demo (Web / CLI)
deno task demo:dir

# 2. Directory comparison demo (Desktop runtime)
deno task demo:desktop:dir

# 3. Welcome / Picker screen demo (Web / CLI)
deno task demo:welcome

# 4. Welcome / Picker screen demo (Desktop runtime)
deno task demo:desktop:welcome

# 5. Single file comparison demo with AI metadata
deno task demo:ai

# 6. Static check (formatting, linting, type check, tests)
deno task check
```
