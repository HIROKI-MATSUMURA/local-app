# システム Python の実装について

## 概要

CreAIteCode アプリケーションでは、Python 環境をアプリケーションバンドル版からシステム環境依存版へと移行しました。
この変更は以下の課題を解決するために行われました：

1. arm64 と x64 環境の互換性の問題
2. macOS から Windows 環境のビルド対応
3. 将来的な Python の自動インストール機能の土台作り

## 実装内容

### 1. Python Bridge の簡略化（`python_bridge.js.simplified`）

以前のバージョンでは、Python の実行環境をアプリケーションにバンドルし、アーキテクチャに基づいて適切な実行ファイルを選択していました。新しい実装では：

- システムにインストールされた Python を優先的に使用
- Node.js の `child_process.spawn` を使用して Python プロセスを直接起動
- Python のバージョンと必要なパッケージの検証機能を追加

主な変更点：
- `detectPythonExecutable()` 関数を追加し、システム Python コマンドを自動検出
- Python プロセスの起動をシンプル化
- 環境チェック機能を強化（`checkPythonEnvironment()`, `detailedPythonCheck()`）

### 2. ランチャースクリプト（`python_server_launcher_simple.sh/bat`）

システム Python を使用するためのランチャースクリプトを macOS 用と Windows 用に作成しました：

- Python のインストール確認
- 必要なパッケージの検証
- 適切なエラーメッセージの表示
- Python サーバーの起動

これらのスクリプトは Electron アプリが Python サーバーを起動する際に使用されます。

### 3. Python 環境セットアップ（`setup-python-env.js`）

Python 環境のセットアップを自動化するスクリプトを追加しました：

- Python コマンドの検出
- pip の検証
- 必要なパッケージのインストールと検証
- 環境構築のエラーハンドリング

このスクリプトは開発環境や初回起動時に Python 環境を準備するために使用されます。

### 4. パッケージングスクリプト

パッケージング時に Python スクリプトとランチャーをアプリケーションパッケージにコピーするためのスクリプトを追加しました：

- `copy-python-script-mac.js` - macOS 用
- `copy-python-script-win.js` - Windows (x64) 用
- `copy-python-script-win-universal.js` - Windows (x64/ia32) 用

これらのスクリプトにより、パッケージ化されたアプリケーションでも Python スクリプトが正しく配置され、実行可能になります。

### 5. クロスプラットフォームビルド対応

macOS から Windows 用アプリケーションをビルドするための機能を追加しました：

- Docker を使用した Windows ビルド環境の設定
- ビルドプロセスを自動化するスクリプト（`build-windows-from-mac.sh`）
- 詳細なビルド手順の文書化（`mac-to-win-build.md`）

### 6. package.json の修正

`package.json` にシステム Python 対応の新しいスクリプトコマンドを追加しました：

- 開発用コマンド（`dev`, `dev:win`）の修正
- Python 環境セットアップコマンド（`setup-python`, `check-python`）の追加
- パッケージングコマンド（`package-mac-system`, `package-win-system`, `package-win-system-universal`）の追加
- macOS から Windows ビルド用のコマンド（`package-win-from-mac`）の追加

## アーキテクチャ

システム Python 依存版の全体的なアーキテクチャは以下の通りです：

```
Electron App (JS/React)
      │
      ▼
python_bridge.js ── detectPythonExecutable() ─┐
      │                                      │
      ▼                                      ▼
PythonBridge クラス                 システム Python 検出
      │
      ▼
ランチャースクリプト
(python_server_launcher_simple.sh/bat)
      │
      ▼
Python サーバー (python_server.py)
      │
      ▼
Python モジュール (OCR, 画像処理等)
```

## 今後の拡張

1. **Python 自動インストール機能**：
   - ユーザーの環境に Python がインストールされているかチェック
   - 必要に応じて Python と必要なパッケージを自動インストール
   - インストールプロセスのGUI対応

2. **マルチプラットフォーム対応の強化**：
   - Linux 環境のサポート改善
   - アーキテクチャ間の互換性向上

3. **エラーハンドリングの強化**：
   - より詳細なエラー情報の提供
   - 自動リカバリーメカニズムの改善

## 導入方法

新しいシステム Python 依存版を導入するには、以下の手順を実行してください：

1. `python_bridge.js.simplified` を `python_bridge.js` にリネーム
2. `package.json.simplified` の内容を `package.json` にマージ
3. 各種スクリプトが正しく配置されていることを確認

これにより、システム Python を使用するように設定が変更されます。