# **AI-Friendly Diff Tool (Diffrex) Specification & Implementation Roadmap**

## **1\. Project Overview & Concept**

Diffrex is a lightweight, high-performance desktop diff & merge application optimized for reviewing AI-generated code. It bridges the gap between classic WinMerge-style keyboard navigation and modern "Human-in-the-Loop" AI code auditing.

### **Key Goals**

* **WinMerge-Grade Speed & Navigation:** Full keyboard-driven diff navigation and block-level merging.  
* **AI-Friendly Code Review:**  
  * Display AI generation context (prompt, model, agent) directly above the diff view.  
  * Automatically detect and **fold non-essential noise** (formatting, indents, comments) so the user can focus strictly on logic changes.  
  * Automatically highlight **destructive or risky edits** (large deletions, type signature changes).  
* **Native Ecosystem Integration:** Built with Deno Desktop (deno desktop) and CodeMirror 6, callable via terminal and configurable as a git difftool / git mergetool.

## **2\. Tech Stack**

* **Runtime & Desktop Framework:** Deno Desktop (deno desktop, Deno v2.9+)  
* **Backend / Engine:** TypeScript (Deno)  
* **Frontend Framework:** JSX (TSX) + HTML/CSS
* **Frontend Architecture:** Classic GUI MVC (Smalltalk-80 style, Zero external MVC/state libraries)
* **Editor & Diff Component:** CodeMirror 6 (@codemirror/merge, @codemirror/state, @codemirror/view)  
* **CLI Parser:** @std/cli (Deno Standard Library)

## **3\. Architecture & Data Flow**

\[CLI Execution\]   
  └─\> \`Diffrex base.ts target.ts \--prompt "..."\`  
        │  
        ▼  
\[Deno Backend\]  
  ├─ 1\. Parse CLI arguments (\`flags\`)  
  ├─ 2\. Read target files & stdin  
  ├─ 3\. Perform AI-Friendly Static Analysis (Noise & Risk Level calculation)  
  ├─ 4\. Launch Deno Desktop WebView window  
  └─ 5\. Send \`DiffSessionData\` JSON payload to WebView  
        │  
        ▼  
\[WebView (CodeMirror 6 Engine)\]  
  ├─ 1\. Render Prompt & AI Metadata Header  
  ├─ 2\. Render 2-Way Diff View via \`@codemirror/merge\`  
  ├─ 3\. Apply decorations: Fold noise hunks, attach risk warning badges  
  ├─ 4\. Listen to keybindings (WinMerge & A/R/E Hunk Review shortcuts)  
  └─ 5\. On Save (Ctrl+S / Exit): Post modified \`target\` content back to Deno  
        │  
        ▼  
\[Deno Backend\]  
  ├─ 1\. Overwrite target file (Right file)  
  └─ 2\. Gracefully close window & exit CLI process (Exit Code 0\)

## **4\. CLI Interface Specification**

### **Basic Usage**

\# 2-Way Diff (Base vs Target)  
Diffrex \<base\_file\> \<target\_file\> \[options\]

\# 3-Way Merge (Conflict Resolution)  
Diffrex \<local\> \<base\> \<remote\> \-o \<merged\_output\> \[options\]

\# Stdin Pipe Input  
git diff | Diffrex \-

### **Options & Flags**

| Flag | Type | Description |
| :---- | :---- | :---- |
| \--prompt \<text\> | string | Prompt text used for AI generation. Rendered in the UI header. |
| \--agent \<name\> | string | AI Agent name (e.g., Cursor, Claude Code, Aider). Displayed as a badge. |
| \--model \<name\> | string | LLM Model name (e.g., claude-3-7-sonnet, gpt-4o). |
| \-w, \--wait | boolean | Hold CLI process open until the desktop window is closed. (Crucial for git difftool). |
| \-o, \--output \<path\> | string | Custom output file path for merge results. Default is \<target\_file\>. |
| \--read-only | boolean | Disable editing and write-back functionality. |
| \--ignore-space | boolean | Force ignore whitespace differences on launch. |

### **Default Write-back Target**

* Editing/Merging outputs overwrite the **Right Side (target\_file)** by default unless \-o / \--output is explicitly supplied.

### **Window Management**

* Each CLI invocation spawns an **independent OS window** tied 1:1 to the CLI process lifecycle.

## **5\. Data Models & TypeScript Definitions**

### **types.ts**

export interface DiffSessionData {  
  sessionId: string;  
  timestamp: string;  
  mode: "2way" | "3way";  
  aiContext?: {  
    prompt?: string;  
    agent?: string;  
    model?: string;  
  };  
  files: {  
    left: FileTarget;   // Base (Original)  
    right: FileTarget;  // Target (AI Generated / Default Save Target)  
    base?: FileTarget;  // Optional 3-way parent  
  };  
  outputPath?: string;  // Explicit save destination override  
  hunks: HunkAnnotation\[\];  
  options: {  
    ignoreSpace: boolean;  
    ignoreComments: boolean;  
  };  
}

export interface FileTarget {  
  path: string;  
  content: string;  
  readOnly: boolean;  
}

export interface HunkAnnotation {  
  id: string;  
  lineStartLeft: number;  
  lineEndLeft: number;  
  lineStartRight: number;  
  lineEndRight: number;  
  isNoise: boolean;              // True if changes are solely indents/comments/whitespace  
  riskLevel: "normal" | "warning" | "danger"; // Evaluated by Deno analysis  
  status: "unreviewed" | "accepted" | "rejected" | "edited";  
  summaryTag?: string;           // e.g., "\[Format\] Indentation", "\[Risk\] 15 lines deleted"  
}

## **6\. AI-Friendly Static Analysis Logic**

Deno executes a pre-pass analysis on the base and target texts before rendering.

### **A. Noise Detection (isNoise: true)**

A diff hunk is marked as isNoise: true if:

1. **Formatting/Indent Only:** Normalizing whitespace (line.trim().replace(/\\s+/g, ' ')) yields identical strings.  
2. **Comment-Only Changes:** Adding or removing line/block comments (//, /\* \*/, \#) without altering executable code.

### **B. Risk Assessment (riskLevel)**

* **danger**:  
  * Continuous deletion of \> 10 lines of code.  
  * Modification or removal of function/method signatures, class interfaces, or exported types.  
* **warning**:  
  * Removal of error-handling blocks (try/catch, if (err) ...).  
  * Addition of hardcoded tokens/secrets (basic regex matching).  
* **normal**: Standard logic changes.

## **7\. UI, CodeMirror 6 Integration & Keybindings**

### **Layout**

1. **Header Panel:** Display AI metadata (prompt, agent, model), hunk counters (Unreviewed: 2/5), and filter toggles.  
2. **Main Diff Area:** CodeMirror 6 dual-editor split view (@codemirror/merge).  
3. **Status Bar:** Save confirmation, active keybindings guide.

### **UI Behavior for Noise & Risks**

* **Noise Hunks:** Automatically folded upon load. A lightweight placeholder bar (e.g., \[▶ 4 lines of formatting changes folded\]) appears. Clicking or pressing a shortcut toggles expansion.  
* **Risk Hunks:** Highlighted with a subtle red left-border and a warning badge (⚠️ High Risk: 12 lines deleted).

### **Frontend MVC Architecture (Classic GUI MVC)**

The frontend follows the **Classic GUI MVC pattern (Smalltalk-80 MVC)** rather than the request-response Web MVC pattern. It is implemented with **pure TypeScript and zero external MVC/state management libraries**.

* **Model (Active Domain State & Subject):**
  * Holds application state (diff session data, hunk list, focused hunk index, edit/navigation mode, dirty/save status).
  * Implements the Observer/Subject pattern to notify registered Views whenever its state changes.
  * Completely decoupled from UI rendering and framework dependencies.
* **View (Visual Components & Observer):**
  * Subscribes to Model updates (Observer pattern) and re-renders components (Header, DiffView, StatusBar) according to the latest Model state.
  * Captures UI events (key presses, mouse clicks, editor focus) and delegates them directly to the Controller without modifying the Model directly.
* **Controller (Input Translator & Coordinator):**
  * Receives and interprets user inputs and UI actions (e.g., `Alt+Down`/`J` hunk jumps, `Ctrl+R` merge commands, `Ctrl+S` save triggers, review approvals `A`/`R`).
  * Translates gestures/commands into domain method invocations on the Model.
* **Triad Collaboration:**
  `View` → *(delegates user input)* → `Controller` → *(invokes state change)* → `Model` → *(notifies Observer)* → `View` *(queries state & updates display)*.

### **Keyboard Shortcuts Table**

| Action | Keybinding | Scope / Mode |
| :---- | :---- | :---- |
| **Next Diff Hunk** | Alt \+ Down or J | Global / Navigation |
| **Previous Diff Hunk** | Alt \+ Up or K | Global / Navigation |
| **Copy Base to Target** | Ctrl \+ R or Alt \+ Right | Focused Hunk |
| **Copy Target to Base** | Ctrl \+ L or Alt \+ Left | Focused Hunk |
| **Accept AI Hunk** | A | Focused Hunk |
| **Reject AI Hunk** | R | Focused Hunk |
| **Edit Hunk Manually** | E or Enter | Focuses editor at hunk line |
| **Toggle Noise Visibility** | Ctrl \+ N | Global Toggle |
| **Save Right File** | Ctrl \+ S | Global |
| **Complete Review & Exit** | Ctrl \+ Enter | Save \+ Close Window |

## **8\. Implementation Roadmap**

AI agents should follow this step-by-step roadmap sequentially. Each phase must pass its Acceptance Criteria before proceeding to the next.

### **Phase 1: CLI Entry Point & Deno Desktop Setup**

**Goal:** Initialize the Deno Desktop project, parse CLI arguments, and verify IPC communication with the WebView.

* \[ \] Initialize deno.json with Deno Desktop configuration.  
* \[ \] Implement CLI flag parsing for \<base\>, \<target\>, \--prompt, \--agent, \--model, \-w/--wait.  
* \[ \] Read file contents from disk into memory.  
* \[ \] Launch deno desktop WebView window and transmit DiffSessionData to front-end.

**Acceptance Criteria (AC):**

Running deno run \-A \--unstable-desktop main.ts fileA.txt fileB.txt \--prompt "test" successfully opens a desktop window displaying the raw file contents and prompt in JSON format.

### **Phase 2: CodeMirror 6 Diff View & Key Navigation**

**Goal:** Render a side-by-side diff view and implement WinMerge keyboard navigation.

* \[ \] Embed @codemirror/merge in the frontend app.  
* \[ \] Render file.left.content and file.right.content side-by-side with synchronized scrolling.  
* \[ \] Implement Alt+Down / Alt+Up (or J/K) to jump focus between diff hunks.  
* \[ \] Implement Ctrl+R (Base \-\> Target) and Ctrl+L (Target \-\> Base) block merging.

**Acceptance Criteria (AC):**

Users can navigate through diff chunks using keyboard shortcuts and merge code blocks from left to right smoothly.

### **Phase 2.1: Classic GUI MVC Refactoring**

**Goal:** Refactor frontend architecture into Classic GUI MVC (Smalltalk-80) with zero external state libraries.

* \[ \] Implement pure TypeScript Observer/Subject pattern infrastructure.  
* \[ \] Extract active state & domain logic into Model layer (`DiffSessionModel`).  
* \[ \] Extract user input handling and keymap routing into Controller layer (`DiffController`).  
* \[ \] Refactor View layer (`App`, `DiffView`, `Header`, `StatusBar`) to subscribe to Model and delegate events to Controller.  
* \[ \] Verify seamless integration with CodeMirror 6 MergeView and maintain all existing keyboard shortcuts and merge functionality.

**Acceptance Criteria (AC):**

Frontend logic is cleanly decoupled into Model, View, and Controller triads. All state mutations occur via Model methods through Controller dispatch, with zero regression in diff viewing, hunk navigation, and block merging.

### **Phase 3: File Write-Back & Process Lifecycle**

**Goal:** Enable saving modifications back to disk and proper process termination.

* \[ \] Implement Ctrl+S trigger in frontend to post updated right-side content to Deno backend.  
* \[ \] Write updated content to disk (files.right.path or outputPath).  
* \[ \] Implement Ctrl+Enter to save content and close the window (window.close()), exiting the CLI process with code 0\.

**Acceptance Criteria (AC):**

Edits made in the UI persist to the right-side file upon pressing Ctrl+S or Ctrl+Enter, and the CLI process exits cleanly when \--wait is specified.

### **Phase 4: AI-Friendly Static Analysis & UI Decorations**

**Goal:** Add noise folding, risk warning decorations, and AI metadata headers.

* \[ \] Build backend pre-parser in Deno to compute isNoise and riskLevel per hunk.  
* \[ \] Render the Top Header displaying prompt, agent, and model badges.  
* \[ \] Implement CodeMirror decorations to fold isNoise: true hunks by default.  
* \[ \] Add a UI toggle button and shortcut (Ctrl+N) to expand/collapse noise hunks.  
* \[ \] Render red warning badges alongside danger risk hunks.  
* \[ \] Implement A (Accept), R (Reject), and E (Edit) quick action shortcuts.

**Acceptance Criteria (AC):**

Noise hunks (e.g., spaces/comments) are collapsed on startup. Dangerous deletions show red warning indicators. Pressing A approves the AI hunk and advances to the next change.