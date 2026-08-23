/**
 * Diffrex 動作検証用サンプル: AI によるリファクタリング前コード (Base)
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
  // メールアドレスの簡易チェック (旧実装コメント)
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// ==========================================
// 3. [Risk: normal] 通常の小規模なロジック改善
// ==========================================
export function calculateUserScore(user: User, loginDays: number): number {
  const baseScore = loginDays * 10;
  return user.role === "admin" ? baseScore * 2 : baseScore;
}

// ==========================================
// 4. [Risk: warning] エラーハンドリング (try/catch) の削除
// ==========================================
export function parseUserData(rawJson: string): User | null {
  try {
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
  } catch (_err) {
    console.error("Failed to parse user data");
    return null;
  }
}

// ==========================================
// 5. [Risk: warning] ハードコードされたシークレットの追加（Target 側で混入）
// ==========================================
export function getNotificationClient(): { send: (msg: string) => void } {
  const endpoint = Deno.env.get("NOTIFY_URL") ?? "https://api.example.com";
  return {
    send: (msg: string) => console.log(`[Send to ${endpoint}] ${msg}`),
  };
}

// ==========================================
// 6. [Risk: danger] 10行超の大規模削除ブロック (レガシーコード)
// ==========================================
export function legacyV1AuthFilter(headers: Record<string, string>): boolean {
  const authHeader = headers["authorization"] || headers["x-api-key"];
  if (!authHeader) {
    return false;
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2) {
    return false;
  }
  const scheme = parts[0];
  const token = parts[1];
  if (scheme.toLowerCase() !== "bearer") {
    return false;
  }
  if (token.length < 16) {
    return false;
  }
  return true;
}

// ==========================================
// 7. [Risk: danger] 公開関数シグネチャの変更
// ==========================================
export function fetchUserProfile(userId: string): { id: string; name: string } {
  return { id: userId, name: "User-" + userId };
}
