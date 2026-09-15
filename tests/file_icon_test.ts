import { assertEquals } from "@std/assert";
import { getFileType } from "../src/ui/components/FileIcon.tsx";

Deno.test("getFileType: 正しくファイル種別を判定できること", () => {
  // TypeScript & TSX
  assertEquals(getFileType("main.ts"), "typescript");
  assertEquals(getFileType("src/core/types.mts"), "typescript");
  assertEquals(getFileType("config.cts"), "typescript");
  assertEquals(getFileType("App.tsx"), "typescript-react");

  // JavaScript & JSX
  assertEquals(getFileType("index.js"), "javascript");
  assertEquals(getFileType("bundle.mjs"), "javascript");
  assertEquals(getFileType("script.cjs"), "javascript");
  assertEquals(getFileType("Component.jsx"), "javascript-react");

  // Web & Styles
  assertEquals(getFileType("index.html"), "html");
  assertEquals(getFileType("page.htm"), "html");
  assertEquals(getFileType("styles.css"), "css");
  assertEquals(getFileType("main.scss"), "scss");
  assertEquals(getFileType("theme.sass"), "scss");
  assertEquals(getFileType("vars.less"), "scss");

  // Data & Config
  assertEquals(getFileType("package.json"), "config");
  assertEquals(getFileType("deno.json"), "config");
  assertEquals(getFileType("deno.jsonc"), "config");
  assertEquals(getFileType("tsconfig.json"), "config");
  assertEquals(getFileType(".env"), "config");
  assertEquals(getFileType(".env.local"), "config");
  assertEquals(getFileType("vite.config.ts"), "config");
  assertEquals(getFileType("data.json"), "json");
  assertEquals(getFileType("data.json5"), "json");
  assertEquals(getFileType("ci.yml"), "yaml");
  assertEquals(getFileType("workflow.yaml"), "yaml");
  assertEquals(getFileType("Cargo.toml"), "config");

  // Lock files
  assertEquals(getFileType("deno.lock"), "lock");
  assertEquals(getFileType("package-lock.json"), "lock");
  assertEquals(getFileType("yarn.lock"), "lock");
  assertEquals(getFileType("pnpm-lock.yaml"), "lock");
  assertEquals(getFileType("cargo.lock"), "lock");

  // Docs
  assertEquals(getFileType("README.md"), "markdown");
  assertEquals(getFileType("docs/guide.markdown"), "markdown");

  // Languages
  assertEquals(getFileType("script.py"), "python");
  assertEquals(getFileType("main.rs"), "rust");
  assertEquals(getFileType("server.go"), "go");
  assertEquals(getFileType("main.c"), "c");
  assertEquals(getFileType("header.h"), "c");
  assertEquals(getFileType("engine.cpp"), "cpp");
  assertEquals(getFileType("Program.cs"), "csharp");
  assertEquals(getFileType("App.java"), "java");
  assertEquals(getFileType("index.php"), "php");
  assertEquals(getFileType("app.rb"), "ruby");

  // Scripts
  assertEquals(getFileType("deploy.sh"), "shell");
  assertEquals(getFileType("setup.bash"), "shell");
  assertEquals(getFileType("run.ps1"), "powershell");
  assertEquals(getFileType("build.bat"), "powershell");
  assertEquals(getFileType("start.cmd"), "powershell");

  // Database & DevOps
  assertEquals(getFileType("schema.sql"), "sql");
  assertEquals(getFileType(".gitignore"), "git");
  assertEquals(getFileType(".gitattributes"), "git");
  assertEquals(getFileType(".gitmodules"), "git");
  assertEquals(getFileType("Dockerfile"), "docker");
  assertEquals(getFileType("docker-compose.yml"), "docker");
  assertEquals(getFileType(".dockerignore"), "docker");

  // Media & Data
  assertEquals(getFileType("logo.png"), "image");
  assertEquals(getFileType("banner.jpg"), "image");
  assertEquals(getFileType("icon.svg"), "image");
  assertEquals(getFileType("export.csv"), "table");
  assertEquals(getFileType("data.tsv"), "table");
  assertEquals(getFileType("archive.zip"), "archive");
  assertEquals(getFileType("font.woff2"), "font");

  // Fallback
  assertEquals(getFileType("unknown.xyz"), "file");
  assertEquals(getFileType(""), "file");
  assertEquals(getFileType(undefined), "file");
});
