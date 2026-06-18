# AI×MUS 常時公開デプロイ手順

このアプリをPCスリープ中でも他のPCやスマホから使うには、ローカルPCではなく常時稼働する外部サーバーに置きます。現在のCloudflare Quick Tunnelは開発確認用で、PCがスリープすると止まります。

## 実装した内容

- `Dockerfile` を追加し、Web画面とFastAPIバックエンドを1つのコンテナで起動できるようにしました。
- `render.yaml` を追加し、Renderにそのまま載せられる構成にしました。
- SQLite DB、アップロード動画、解析結果を `/app/data` に保存する設計にしました。
- Renderなどが自動設定する `PORT` 環境変数にも対応しました。
- 本番HTTPSでは `FORGE_SECURE_COOKIES=true` を使えるようにしました。
- Apple Silicon / ARM64 Dockerでもビルドできるよう、MediaPipeはARM64 wheelが提供されている `0.10.18` に固定しています。

## 推奨構成

最初は以下で十分です。

- ホスティング: Render Web Service または Railway/Fly.io
- 実行形式: Docker
- 永続保存: `/app/data` に永続ディスクをマウント
- URL: ホスティング先のHTTPS URL、または独自ドメイン

将来的にユーザー数や動画量が増えたら、SQLiteをPostgreSQLへ、動画保存をS3互換ストレージへ移します。

## Renderでの公開手順

1. このフォルダをGitHubリポジトリへpushします。
2. Renderで `New +` → `Blueprint` を選びます。
3. GitHubリポジトリを選択します。
4. `render.yaml` が読み込まれるので、Web Serviceを作成します。
5. 作成後、Renderの公開URLを確認します。
6. RenderのEnvironmentで以下を実際のURLに変更します。

```text
FORGE_PUBLIC_BASE_URL=https://あなたのRender URL
FORGE_ALLOWED_ORIGINS=https://あなたのRender URL
FORGE_SECURE_COOKIES=true
```

7. 再デプロイします。
8. `https://あなたのRender URL/api/v1/health` が `ok` を返せば公開成功です。

## 重要な注意

- Renderの無料枠はスリープする場合があります。PCスリープ対策として使うなら、有料プランまたは常時稼働設定が必要です。
- SQLiteを使う間は必ず永続ディスクを有効にしてください。永続ディスクなしだと再デプロイでユーザー情報が消えます。
- Cloudflare Quick TunnelのURLは開発用です。本番URLとしては使わないでください。
- パスワードは平文保存せず、Scryptハッシュで保存しています。
- 本番でパスワード再設定メールを使うにはSMTP環境変数を設定してください。

## 本番環境変数

```text
FORGE_DATA_DIR=/app/data
FORGE_SECURE_COOKIES=true
FORGE_PUBLIC_BASE_URL=https://あなたの公開URL
FORGE_ALLOWED_ORIGINS=https://あなたの公開URL
FORGE_SESSION_DAYS=180
FORGE_MAX_UPLOAD_MB=300
FORGE_SMTP_HOST=
FORGE_SMTP_PORT=587
FORGE_SMTP_USERNAME=
FORGE_SMTP_PASSWORD=
FORGE_SMTP_FROM=
FORGE_SMTP_USE_TLS=true
```

## ローカル確認

Dockerが入っているPCでは以下で確認できます。

```powershell
docker build -t aimus-training .
docker run --rm -p 8001:8001 -e FORGE_DATA_DIR=/app/data aimus-training
```

確認URL:

```text
http://localhost:8001/
http://localhost:8001/api/v1/health
```
