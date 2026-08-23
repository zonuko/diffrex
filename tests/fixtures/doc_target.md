# サービス概要仕様書 (v2.0)

本ドキュメントは、次世代認証マイクロサービスの最新仕様書です。

## 1. 概要
OAuth 2.1 / OIDC に完全対応したユーザー認証および JWT 発行を行います。

## 2. API エンドポイント
- `POST /api/v2/oauth/token`: JWT トークン発行
- `POST /api/v2/oauth/revoke`: トークン失効
- `GET /api/v2/userinfo`: ユーザープロファイル取得
- `GET /api/v2/health`: ヘルスチェック

## 3. セキュリティポリシー
すべての通信は TLS 1.3 以上が必須です。
