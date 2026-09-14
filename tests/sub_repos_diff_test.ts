import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { runMain } from "../main.ts";
import {
  findSubGitRepositories,
  parseGitModules,
} from "../src/core/git/sub_repos.ts";
import {
  buildMultiGitDirectoryDiffSession,
  findSubRepoForPath,
} from "../src/core/git/status.ts";

Deno.test("parseGitModules: .gitmodules の内容をパースできる", () => {
  const content = `
[submodule "libs/core"]
\tpath = libs/core
\turl = https://github.com/example/core.git
\tbranch = main

[submodule "plugins/auth"]
\tpath = plugins/auth
\turl = git@github.com:example/auth.git
`;

  const configs = parseGitModules(content);
  assertEquals(configs.length, 2);
  assertEquals(configs[0].name, "libs/core");
  assertEquals(configs[0].path, "libs/core");
  assertEquals(configs[0].url, "https://github.com/example/core.git");
  assertEquals(configs[0].branch, "main");

  assertEquals(configs[1].name, "plugins/auth");
  assertEquals(configs[1].path, "plugins/auth");
  assertEquals(configs[1].url, "git@github.com:example/auth.git");
});

Deno.test("findSubRepoForPath: 相対パスから最も適合するサブリポジトリを検索できる", () => {
  const subRepos = [
    {
      relativePath: "",
      absolutePath: "/root",
      name: "root",
    },
    {
      relativePath: "packages/app",
      absolutePath: "/root/packages/app",
      name: "app",
    },
    {
      relativePath: "packages/app/submodules/dep",
      absolutePath: "/root/packages/app/submodules/dep",
      name: "dep",
    },
  ];

  // ネストされたサブリポジトリ内のファイル
  const match1 = findSubRepoForPath(
    subRepos,
    "packages/app/submodules/dep/src/index.ts",
  );
  assertEquals(match1?.subRepo.name, "dep");
  assertEquals(match1?.fileRelativeInSubRepo, "src/index.ts");

  // 中間サブリポジトリ内のファイル
  const match2 = findSubRepoForPath(
    subRepos,
    "packages/app/package.json",
  );
  assertEquals(match2?.subRepo.name, "app");
  assertEquals(match2?.fileRelativeInSubRepo, "package.json");

  // ルートリポジトリ直下のファイル
  const match3 = findSubRepoForPath(
    subRepos,
    "README.md",
  );
  assertEquals(match3?.subRepo.name, "root");
  assertEquals(match3?.fileRelativeInSubRepo, "README.md");
});

Deno.test("マルチリポジトリ統合: サブディレクトリ内 Git リポジトリの検出・差分集約・セッション構築", async () => {
  const baseDir = await Deno.makeTempDir({
    prefix: "diffrex-multi-repo-test-",
  });

  try {
    const repoAPath = join(baseDir, "services", "repo-a");
    const repoBPath = join(baseDir, "packages", "repo-b");
    const ignoredPath = join(baseDir, "node_modules", "ignored-repo");

    await Deno.mkdir(repoAPath, { recursive: true });
    await Deno.mkdir(repoBPath, { recursive: true });
    await Deno.mkdir(ignoredPath, { recursive: true });

    // Git 初期化ヘルパー
    const initRepo = async (dir: string) => {
      await new Deno.Command("git", { args: ["init"], cwd: dir }).output();
      await new Deno.Command("git", {
        args: ["config", "user.name", "Diffrex Tester"],
        cwd: dir,
      }).output();
      await new Deno.Command("git", {
        args: ["config", "user.email", "test@diffrex.dev"],
        cwd: dir,
      }).output();
    };

    await initRepo(repoAPath);
    await initRepo(repoBPath);
    await initRepo(ignoredPath);

    // repo-a: 初期コミットと変更
    await Deno.writeTextFile(join(repoAPath, "a1.txt"), "hello from a1\n");
    await new Deno.Command("git", { args: ["add", "."], cwd: repoAPath })
      .output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "init a"],
      cwd: repoAPath,
    }).output();
    // 変更差分を発生
    await Deno.writeTextFile(
      join(repoAPath, "a1.txt"),
      "hello from a1 modified\n",
    );

    // repo-b: 初期コミットと追加差分
    await Deno.writeTextFile(join(repoBPath, "b1.txt"), "hello from b1\n");
    await new Deno.Command("git", { args: ["add", "."], cwd: repoBPath })
      .output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "init b"],
      cwd: repoBPath,
    }).output();
    // 新規・未追跡ファイル
    await Deno.writeTextFile(join(repoBPath, "b_new.txt"), "new file in b\n");

    // 1. findSubGitRepositories のテスト
    const foundRepos = await findSubGitRepositories(baseDir);
    // node_modules はスキップされるため 2 件検出されるはず
    assertEquals(foundRepos.length, 2);

    const names = foundRepos.map((r) => r.name).sort();
    assertEquals(names, ["repo-a", "repo-b"]);

    // 2. buildMultiGitDirectoryDiffSession のテスト
    const session = await buildMultiGitDirectoryDiffSession(
      baseDir,
      foundRepos,
    );

    assertEquals(session.isGitRepo, true);
    assertEquals(session.git?.isGitRepo, true);
    assertEquals(session.git?.subRepos?.length, 2);

    // 全体サマリ: modified 1件 (a1.txt), added 1件 (b_new.txt)
    assertEquals(session.summary.total, 2);
    assertEquals(session.summary.modified, 1);
    assertEquals(session.summary.added, 1);

    // サブリポジトリごとのサマリ
    const repoASummary = session.git?.subRepos?.find((r) =>
      r.name === "repo-a"
    );
    const repoBSummary = session.git?.subRepos?.find((r) =>
      r.name === "repo-b"
    );

    assertEquals(repoASummary?.summary.modified, 1);
    assertEquals(repoBSummary?.summary.added, 1);

    // ツリー構造の検証: ルートに services と packages が存在すること
    const servicesNode = session.tree.children?.find((c) =>
      c.name === "services"
    );
    const packagesNode = session.tree.children?.find((c) =>
      c.name === "packages"
    );
    assertEquals(Boolean(servicesNode), true);
    assertEquals(Boolean(packagesNode), true);

    // 3. CLI 実行（--scan-git / 単一ディレクトリ指定 headless モード）
    const exitCode = await runMain([baseDir, "--headless"]);
    assertEquals(exitCode, 0);
  } finally {
    try {
      await Deno.remove(baseDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});
