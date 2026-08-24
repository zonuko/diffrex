import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  detectOs,
  generateContextMenuScript,
  generateLinuxDesktopEntry,
  generateMacOSFinderScript,
  generateWindowsRegistryScript,
  generateWindowsRegistryUninstallScript,
} from "../src/core/os/context_menu.ts";

Deno.test("ContextMenu: detectOs returns valid OS string", () => {
  const os = detectOs();
  assertEquals(os === "windows" || os === "darwin" || os === "linux", true);
});

Deno.test("ContextMenu: Windows registry script generation", () => {
  const script = generateWindowsRegistryScript("C:\\Tools\\Diffrex.exe");
  assertStringIncludes(script, "Windows Registry Editor Version 5.00");
  assertStringIncludes(
    script,
    "HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\Diffrex",
  );
  assertStringIncludes(
    script,
    "HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\Diffrex",
  );
  assertStringIncludes(
    script,
    "HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\Diffrex",
  );
  assertStringIncludes(script, "C:\\\\Tools\\\\Diffrex.exe");
});

Deno.test("ContextMenu: Windows registry uninstall script generation", () => {
  const script = generateWindowsRegistryUninstallScript();
  assertStringIncludes(
    script,
    "[-HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\Diffrex]",
  );
  assertStringIncludes(
    script,
    "[-HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\Diffrex]",
  );
  assertStringIncludes(
    script,
    "[-HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\Diffrex]",
  );
});

Deno.test("ContextMenu: macOS Finder script generation", () => {
  const script = generateMacOSFinderScript("/usr/local/bin/diffrex");
  assertStringIncludes(script, "#!/usr/bin/env bash");
  assertStringIncludes(script, 'DIFFREX_BIN="/usr/local/bin/diffrex"');
  assertStringIncludes(script, '"$DIFFREX_BIN" "$1" "$2" &');
});

Deno.test("ContextMenu: Linux .desktop entry generation", () => {
  const entry = generateLinuxDesktopEntry("/usr/bin/diffrex");
  assertStringIncludes(entry, "[Desktop Entry]");
  assertStringIncludes(entry, "Name=Diffrex");
  assertStringIncludes(entry, 'Exec="/usr/bin/diffrex" %F');
});

Deno.test("ContextMenu: generateContextMenuScript for each OS", () => {
  const win = generateContextMenuScript("windows", "C:\\diffrex.exe");
  assertEquals(win.ok, true);
  assertStringIncludes(win.script!, "Windows Registry Editor");

  const mac = generateContextMenuScript("darwin", "/bin/diffrex");
  assertEquals(mac.ok, true);
  assertStringIncludes(mac.script!, "DIFFREX_BIN=");

  const linux = generateContextMenuScript("linux", "/bin/diffrex");
  assertEquals(linux.ok, true);
  assertStringIncludes(linux.script!, "[Desktop Entry]");
});
