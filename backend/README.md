# AI×MUS API

Web版と将来のiOS/Androidアプリで共通利用する認証・動画解析APIです。

## Architecture

- `main.py`: バージョン付きREST APIと動画アップロード
- `service.py`: 非同期解析ジョブ
- `pose.py`: MediaPipe姿勢推定アダプター
- `evaluator.py`: ベンチプレス、スクワット、デッドリフトの評価
- `repository.py`: SQLiteによるジョブ・解析結果保存
- `auth.py`: Scryptパスワードハッシュと長期セッション管理

姿勢推定と評価を分離しているため、将来は`MediaPipePoseEstimator`をMoveNet、
オンデバイスCore ML/TFLite、またはGPU推論サービスへ交換できます。

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

## Always-on production hosting

PCスリープ中でもスマホや他のPCから使うには、ローカルPCではなく外部ホスティングにデプロイしてください。
このリポジトリには `Dockerfile` と `render.yaml` を追加済みです。Renderなどの常時稼働Web Serviceへ載せる手順は `../DEPLOYMENT.md` を参照してください。

WebアプリとAPIは既定で`http://localhost:8001`、Swagger UIは
`http://localhost:8001/docs`です。

Webアプリは表示中ホストのポート`8001`へ接続します。スマホ実機から
LAN内のPCへ接続する場合も、Web画面とAPIを同じPCのIPアドレスで利用できます。
本番アプリでは起動時設定または環境別ビルド設定から
`FORGE_API_BASE_URL`を注入してください。

## Endpoints

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/analyses`
  - multipart: `video`, `lift`, `profile`, `weight_kg`, `rpe`,
    `camera_angle`, `set_label`
- `GET /api/v1/analyses/{job_id}`

アップロードは`202 Accepted`を返します。クライアントはジョブ取得APIを
ポーリングし、`completed`または`failed`になるまで待ちます。
解析APIはログインCookieを要求し、ジョブはログインユーザーへ紐づきます。

## Authentication

- パスワードはScryptでソルト付きハッシュ化し、平文では保存しません。
- セッション識別子はSHA-256ハッシュのみDBへ保存します。
- ブラウザには`HttpOnly`、`SameSite=Lax` Cookieを設定します。
- 既定のログイン保持期間は180日です。
- 本番HTTPS環境では`FORGE_SECURE_COOKIES=true`を必ず設定してください。
- 会員番号は`AIMUS-00000001`形式で自動発行します。
- 登録時に安全なユーザー情報を`data/user_registry.csv`へ自動追記します。パスワードは含みません。
- SMTPを設定すると、登録メールへ期限付きパスワード再設定リンクとログインIDを送信します。

## Production roadmap

- SQLiteをPostgreSQLへ変更
- ローカル動画保存をS3互換オブジェクトストレージへ変更
- ThreadPoolをRedis + Celery/RQまたはクラウドキューへ変更
- PostgreSQLへのユーザー・トレーニング記録移行
- メール確認、パスワード再設定、ログイン試行回数制限
- 署名付きアップロードURLによる大容量動画の直接転送
- モデル精度検証、競技判定データセット、モデルバージョン管理
- 映像・姿勢座標の保存期間、削除要求、同意取得を含むプライバシー設計

## Competition judgment limitations

現在のバー軌道は、ベンチプレスとデッドリフトでは左右手首中点、
スクワットでは左右肩中点をバー位置の近似として使用します。
胸への接触、審判コマンド、足・尻の接触、プレート重量を公式判定と同等に
確定するものではありません。結果には信頼度と`目視必須`を含め、
競技判定支援として扱います。公式判定に近づけるにはバー・プレート専用の
物体検出モデル、音声イベント検出、複数カメラ映像、競技映像による検証が必要です。
