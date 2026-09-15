/**
 * FileIcon コンポーネント
 *
 * VS Code 風の言語・ファイル種別別カラー SVG アイコン。
 * 外部リソース取得を行わず、軽量インライン SVG で高速・高解像度描画する。
 */

import type { JSX } from "preact";

export type FileType =
  | "typescript"
  | "typescript-react"
  | "javascript"
  | "javascript-react"
  | "python"
  | "html"
  | "css"
  | "scss"
  | "json"
  | "yaml"
  | "markdown"
  | "rust"
  | "go"
  | "c"
  | "cpp"
  | "csharp"
  | "java"
  | "php"
  | "ruby"
  | "shell"
  | "powershell"
  | "sql"
  | "git"
  | "docker"
  | "config"
  | "lock"
  | "image"
  | "table"
  | "archive"
  | "font"
  | "file";

/**
 * ファイル名・拡張子からファイル種別を判定する
 */
export function getFileType(filename?: string): FileType {
  if (!filename) return "file";

  const lower = filename.toLowerCase();
  const base = lower.split("/").pop()?.split("\\").pop() ?? lower;

  // 特殊ファイル名（完全一致）
  if (
    base === ".gitignore" || base === ".gitattributes" || base === ".gitmodules"
  ) {
    return "git";
  }
  if (
    base === "dockerfile" ||
    base.startsWith("dockerfile.") ||
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === ".dockerignore"
  ) {
    return "docker";
  }
  if (
    base === "deno.lock" ||
    base === "package-lock.json" ||
    base === "pnpm-lock.yaml" ||
    base === "yarn.lock" ||
    base === "cargo.lock" ||
    base === "gemfile.lock" ||
    base === "composer.lock"
  ) {
    return "lock";
  }
  if (
    base === "deno.json" ||
    base === "deno.jsonc" ||
    base === "package.json" ||
    base === "tsconfig.json" ||
    base.endsWith(".config.js") ||
    base.endsWith(".config.ts") ||
    base.endsWith(".config.mjs") ||
    base.startsWith(".env")
  ) {
    return "config";
  }

  // 拡張子判定
  if (base.endsWith(".tsx")) return "typescript-react";
  if (base.endsWith(".ts") || base.endsWith(".mts") || base.endsWith(".cts")) {
    return "typescript";
  }
  if (base.endsWith(".jsx")) return "javascript-react";
  if (base.endsWith(".js") || base.endsWith(".mjs") || base.endsWith(".cjs")) {
    return "javascript";
  }
  if (base.endsWith(".py") || base.endsWith(".pyw")) return "python";
  if (base.endsWith(".html") || base.endsWith(".htm")) return "html";
  if (base.endsWith(".css")) return "css";
  if (
    base.endsWith(".scss") || base.endsWith(".sass") || base.endsWith(".less")
  ) {
    return "scss";
  }
  if (
    base.endsWith(".json") || base.endsWith(".jsonc") || base.endsWith(".json5")
  ) {
    return "json";
  }
  if (base.endsWith(".yaml") || base.endsWith(".yml")) return "yaml";
  if (base.endsWith(".toml")) return "config";
  if (
    base.endsWith(".md") || base.endsWith(".markdown") ||
    base.endsWith(".mdown")
  ) {
    return "markdown";
  }
  if (base.endsWith(".rs")) return "rust";
  if (base.endsWith(".go")) return "go";
  if (base.endsWith(".c") || base.endsWith(".h")) return "c";
  if (
    base.endsWith(".cpp") ||
    base.endsWith(".hpp") ||
    base.endsWith(".cc") ||
    base.endsWith(".cxx")
  ) {
    return "cpp";
  }
  if (base.endsWith(".cs")) return "csharp";
  if (
    base.endsWith(".java") || base.endsWith(".jar") || base.endsWith(".class")
  ) {
    return "java";
  }
  if (base.endsWith(".php")) return "php";
  if (base.endsWith(".rb") || base.endsWith(".erb")) return "ruby";
  if (base.endsWith(".sh") || base.endsWith(".bash") || base.endsWith(".zsh")) {
    return "shell";
  }
  if (base.endsWith(".ps1") || base.endsWith(".bat") || base.endsWith(".cmd")) {
    return "powershell";
  }
  if (base.endsWith(".sql")) return "sql";
  if (
    base.endsWith(".png") ||
    base.endsWith(".jpg") ||
    base.endsWith(".jpeg") ||
    base.endsWith(".gif") ||
    base.endsWith(".svg") ||
    base.endsWith(".webp") ||
    base.endsWith(".ico") ||
    base.endsWith(".bmp")
  ) {
    return "image";
  }
  if (base.endsWith(".csv") || base.endsWith(".tsv")) return "table";
  if (
    base.endsWith(".zip") ||
    base.endsWith(".tar") ||
    base.endsWith(".gz") ||
    base.endsWith(".tgz") ||
    base.endsWith(".7z") ||
    base.endsWith(".rar")
  ) {
    return "archive";
  }
  if (
    base.endsWith(".woff") ||
    base.endsWith(".woff2") ||
    base.endsWith(".ttf") ||
    base.endsWith(".otf")
  ) {
    return "font";
  }

  return "file";
}

export interface FileIconProps {
  filename?: string;
  size?: number;
  class?: string;
}

export function FileIcon({
  filename,
  size = 14,
  class: customClass = "",
}: FileIconProps): JSX.Element {
  const type = getFileType(filename);
  const className = `file-icon-svg file-icon-${type} ${customClass}`.trim();

  switch (type) {
    case "typescript":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`TypeScript (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#3178C6" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
          >
            TS
          </text>
        </svg>
      );

    case "typescript-react":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`React TypeScript (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#20232A" />
          <ellipse
            cx="8"
            cy="8"
            rx="6.5"
            ry="2.6"
            stroke="#61DAFB"
            strokeWidth="1"
          />
          <ellipse
            cx="8"
            cy="8"
            rx="6.5"
            ry="2.6"
            stroke="#61DAFB"
            strokeWidth="1"
            transform="rotate(60 8 8)"
          />
          <ellipse
            cx="8"
            cy="8"
            rx="6.5"
            ry="2.6"
            stroke="#61DAFB"
            strokeWidth="1"
            transform="rotate(120 8 8)"
          />
          <circle cx="8" cy="8" r="1.2" fill="#61DAFB" />
        </svg>
      );

    case "javascript":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`JavaScript (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#F7DF1E" />
          <text
            x="8"
            y="11.5"
            fill="#000000"
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
          >
            JS
          </text>
        </svg>
      );

    case "javascript-react":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`React JavaScript (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#20232A" />
          <ellipse
            cx="8"
            cy="8"
            rx="6.5"
            ry="2.6"
            stroke="#F7DF1E"
            strokeWidth="1"
          />
          <ellipse
            cx="8"
            cy="8"
            rx="6.5"
            ry="2.6"
            stroke="#F7DF1E"
            strokeWidth="1"
            transform="rotate(60 8 8)"
          />
          <ellipse
            cx="8"
            cy="8"
            rx="6.5"
            ry="2.6"
            stroke="#F7DF1E"
            strokeWidth="1"
            transform="rotate(120 8 8)"
          />
          <circle cx="8" cy="8" r="1.2" fill="#F7DF1E" />
        </svg>
      );

    case "python":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Python (${filename})`}
        >
          <path
            d="M7.9 1.5C5 1.5 5.2 2.7 5.2 2.7l.01 1.3h2.8v.4H4.1s-1.8-.2-1.8 2.6c0 2.8 1.6 2.7 1.6 2.7h1v-1.4s-.05-1.6 1.6-1.6h2.7s1.5.02 1.5-1.5V3.3s.2-1.8-2.8-1.8zm-1.5.9a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1z"
            fill="#387EB8"
          />
          <path
            d="M8.1 14.5c2.9 0 2.7-1.2 2.7-1.2l-.01-1.3H8v-.4h3.9s1.8.2 1.8-2.6c0-2.8-1.6-2.7-1.6-2.7h-1v1.4s.05 1.6-1.6 1.6H6.8s-1.5-.02-1.5 1.5v1.6s-.2 1.8 2.8 1.8zm1.5-.9a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z"
            fill="#FFE873"
          />
        </svg>
      );

    case "html":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`HTML (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#E34F26" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
            textAnchor="middle"
          >
            &lt;/&gt;
          </text>
        </svg>
      );

    case "css":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`CSS (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#1572B6" />
          <text
            x="8"
            y="12"
            fill="#FFFFFF"
            fontSize="10"
            fontWeight="bold"
            fontFamily="monospace"
            textAnchor="middle"
          >
            #
          </text>
        </svg>
      );

    case "scss":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`SCSS/Sass (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#CF649A" />
          <text
            x="8"
            y="12"
            fill="#FFFFFF"
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            S
          </text>
        </svg>
      );

    case "json":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`JSON (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#2E3440" />
          <text
            x="8"
            y="11.5"
            fill="#CBCB41"
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
            textAnchor="middle"
          >
            {"{ }"}
          </text>
        </svg>
      );

    case "yaml":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`YAML (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#CB171E" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="8"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            YML
          </text>
        </svg>
      );

    case "markdown":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Markdown (${filename})`}
        >
          <rect
            width="16"
            height="16"
            rx="3"
            fill="#083344"
            stroke="#06B6D4"
            strokeWidth="1"
          />
          <path
            d="M3 11V5l2.2 2.5L7.4 5v6M10.2 8.5l1.6 1.8 1.6-1.8m-1.6-3.5v5.3"
            stroke="#22D3EE"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "rust":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Rust (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#3B2E2A" />
          <circle
            cx="8"
            cy="8"
            r="4.5"
            stroke="#DEA584"
            strokeWidth="1.5"
            strokeDasharray="2 1.5"
          />
          <circle cx="8" cy="8" r="2" fill="#DEA584" />
        </svg>
      );

    case "go":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Go (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#00ACD7" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="8"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            GO
          </text>
        </svg>
      );

    case "c":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`C (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#00599C" />
          <text
            x="8"
            y="12"
            fill="#FFFFFF"
            fontSize="9.5"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            C
          </text>
        </svg>
      );

    case "cpp":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`C++ (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#00599C" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="7.5"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            C++
          </text>
        </svg>
      );

    case "csharp":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`C# (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#68217A" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="8"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            C#
          </text>
        </svg>
      );

    case "java":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Java (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#5382A1" />
          <path
            d="M5 10c0 1.5 2.5 2 4 1.5 1.2-.4 1.5-1.5 1.5-1.5H5zM5 7c1-.5 2 0 3-.5s1.5-1.5 1.5-1.5c-.5 1-1.5 1-2.5 1.5S5 8 5 7z"
            fill="#E76F00"
          />
        </svg>
      );

    case "php":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`PHP (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#777BB4" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="7.5"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            PHP
          </text>
        </svg>
      );

    case "ruby":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Ruby (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#CC342D" />
          <path
            d="M4 6l4-3 4 3-2 6H6L4 6z"
            fill="#FFFFFF"
            opacity="0.9"
          />
        </svg>
      );

    case "shell":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Shell script (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#1E293B" />
          <path
            d="M4 5l3 3-3 3M8 11h4"
            stroke="#4ADE80"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "powershell":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`PowerShell / Batch (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#012456" />
          <path
            d="M4 5.5l3 2.5-3 2.5M8 11.5h4"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "sql":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`SQL Database (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#E38C00" />
          <ellipse cx="8" cy="5" rx="4.5" ry="1.8" fill="#FFF8E1" />
          <path
            d="M3.5 5v5c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8V5"
            stroke="#FFF8E1"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      );

    case "git":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Git file (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#F05032" />
          <circle cx="5.5" cy="5.5" r="1.5" fill="#FFFFFF" />
          <circle cx="5.5" cy="11.5" r="1.5" fill="#FFFFFF" />
          <circle cx="10.5" cy="7.5" r="1.5" fill="#FFFFFF" />
          <path
            d="M5.5 7v3M5.5 7l3.5 1.5"
            stroke="#FFFFFF"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "docker":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Docker (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#2496ED" />
          <rect x="3" y="6" width="2" height="1.8" fill="#FFFFFF" rx="0.3" />
          <rect x="5.5" y="6" width="2" height="1.8" fill="#FFFFFF" rx="0.3" />
          <rect x="8" y="6" width="2" height="1.8" fill="#FFFFFF" rx="0.3" />
          <rect
            x="5.5"
            y="3.8"
            width="2"
            height="1.8"
            fill="#FFFFFF"
            rx="0.3"
          />
          <path
            d="M2.5 9c.5 3 3.5 3.5 6 3.5 3 0 5-1.5 5.5-3.5H2.5z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case "config":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Config file (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#475569" />
          <circle cx="8" cy="8" r="2" fill="#E2E8F0" />
          <circle
            cx="8"
            cy="8"
            r="4.2"
            stroke="#E2E8F0"
            strokeWidth="1.2"
            strokeDasharray="1.5 1.2"
          />
        </svg>
      );

    case "lock":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Lock file (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#B45309" />
          <rect x="4.5" y="7" width="7" height="6" rx="1.5" fill="#FDE047" />
          <path
            d="M6 7V5a2 2 0 1 1 4 0v2"
            stroke="#FDE047"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case "image":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Image (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#047857" />
          <circle cx="5" cy="5.5" r="1.5" fill="#A7F3D0" />
          <path
            d="M3 12l3-3.5 2 2 3-4 2.5 5.5H3z"
            fill="#D1FAE5"
          />
        </svg>
      );

    case "table":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Table / CSV (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#15803D" />
          <path
            d="M3 4h10v8H3V4zm0 2.5h10M3 9h10M7 4v8M10.5 4v8"
            stroke="#DCFCE7"
            strokeWidth="1"
          />
        </svg>
      );

    case "archive":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Archive (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#6D28D9" />
          <path
            d="M3 4h10v2H3V4zm1 2v6h8V6H4zm3 0v4h2V6H7z"
            fill="#DDD6FE"
          />
        </svg>
      );

    case "font":
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`Font (${filename})`}
        >
          <rect width="16" height="16" rx="3" fill="#C2410C" />
          <text
            x="8"
            y="11.5"
            fill="#FFFFFF"
            fontSize="8"
            fontWeight="bold"
            fontFamily="serif"
            textAnchor="middle"
          >
            Aa
          </text>
        </svg>
      );

    case "file":
    default:
      return (
        <svg
          class={className}
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          title={`File (${filename})`}
        >
          <path
            d="M3.5 2.5C3.5 2 4 1.5 4.5 1.5h5l3.5 3.5v8.5c0 .5-.5 1-1 1h-7.5c-.5 0-1-.5-1-1v-11z"
            fill="#334155"
            stroke="#64748B"
            strokeWidth="1"
          />
          <path
            d="M9.5 1.5v3.5h3.5"
            fill="#475569"
            stroke="#64748B"
            strokeWidth="1"
          />
        </svg>
      );
  }
}
