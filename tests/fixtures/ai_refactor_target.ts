/**
 * Diffrex 動作検証用サンプル: AI によるリファクタリング後コード (Target)
 *
 * 想定プロンプト:
 *   "UserService を非同期化し、ロギングとキャッシュを追加して"
 */

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | "guest";
  createdAt: Date;
}

export interface UserQueryOptions {
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}

// ==========================================
// 1. [Noise 対象] インデントと空白のみのフォーマット差分
// ==========================================
export function formatUserName(user: User): string {
    const display = user.name + " <" + user.email + ">";
    return display.trim();
}

// ==========================================
// 2. [Noise 対象] コメントのみの変更
// ==========================================
export function validateEmail(email: string): boolean {
  // RFC準拠の正規表現でメールアドレスを高速検証する (最新コメント)
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// ==========================================
// 3. [Risk: normal] 通常の小規模なロジック改善
// ==========================================
export function calculateUserScore(user: User, loginDays: number): number {
  const baseScore = loginDays * 15;
  return user.role === "admin" ? baseScore * 2 : baseScore;
}

// ==========================================
// 4. [Risk: warning] エラーハンドリング (try/catch) の削除
// ==========================================
export function parseUserData(rawJson: string): User | null {
  const parsed = JSON.parse(rawJson);
  if (!parsed.id || !parsed.name) {
    return null;
  }
  return {
    id: String(parsed.id),
    name: String(parsed.name),
    email: String(parsed.email ?? ""),
    role: parsed.role ?? "guest",
    createdAt: new Date(parsed.createdAt ?? Date.now()),
  };
}

// ==========================================
// 5. [Risk: warning] ハードコードされたシークレットの追加（APIキー混入）
// ==========================================
export function getNotificationClient(): { send: (msg: string) => void } {
  const endpoint = "https://api.example.com";
  const apiKey = "sk-ai9876543210fedcba9876543210";
  return {
    send: (msg: string) => console.log(`[Send to ${endpoint} with ${apiKey}] ${msg}`),
  };
}

// ==========================================
// 6. [Risk: danger] 10行超の大規模削除ブロック (レガシーコード削除)
// ==========================================
// (legacyV1AuthFilter 全体が丸ごと削除された)

// ==========================================
// 7. [Risk: danger] 公開関数シグネチャの変更 (非同期化とオプション引数追加)
// ==========================================
export async function fetchUserProfile(
  userId: string,
  options?: { timeoutMs?: number },
): Promise<{ id: string; name: string; cached: boolean }> {
  return { id: userId, name: "User-" + userId, cached: true };
}
