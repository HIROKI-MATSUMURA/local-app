# システム Python 環境への移行計画

## 変更の目的

本変更は、CreAIteCode アプリケーションの Python 環境をアプリケーションバンドル型からシステム環境依存型へと移行させるものです。この変更により、以下の課題を解決します：

1. **arm64 と x64 環境の共存問題**：現在のバンドル済み Python 環境ではアーキテクチャ間の互換性に問題があり、ユニバーサルビルドが難しい状況です。システム Python を使用することで、各環境の Python が正しく動作します。

2. **macOS から Windows 環境のビルド対応**：Docker を使用したクロスプラットフォームビルドを可能にし、macOS 開発環境から Windows 用アプリケーションをビルドできるようにします。

3. **将来的な拡張性の確保**：Python 環境の自動インストール機能など、今後の機能拡張の基盤を整えます。

## 実装手順

### フェーズ 1: 基本実装（完了）

✅ プロジェクト構造の把握と分析  
✅ Python 環境依存からシステム環境依存への移行計画作成  
✅ python_bridge.js の環境依存部分の修正案を立案（python_bridge.js.simplified）  
✅ パッケージングスクリプトの修正案を立案  
✅ package.json のスクリプトコマンドの修正案を立案（package.json.simplified）  
✅ Python サーバー起動用のランチャースクリプトの作成  
✅ MacOS から Windows 環境のビルド手順の整理（Docker 活用）  

### フェーズ 2: 導入と検証（これから実施）

1. **コードベースへの適用**：
   - python_bridge.js.simplified を python_bridge.js に置き換え
   - package.json.simplified の内容を package.json に統合
   - ランチャースクリプトが正しい場所に配置されていることを確認

2. **開発環境での検証**：
   - システム Python を使った開発環境での動作確認
   - アプリケーションの各機能が正常に動作することを確認
   - エラーケースのテスト

3. **ビルド検証**：
   - macOS 用パッケージのビルドとテスト
   - Windows 用パッケージのビルドとテスト
   - macOS から Windows 用パッケージのビルドとテスト（Docker 使用）

### フェーズ 3: 将来的な拡張（計画中）

1. **Python 環境自動インストール機能**：
   - Python がユーザー環境にインストールされているかチェックする機能
   - インストールされていない場合、Python を自動ダウンロード・インストールする機能
   - 必要なパッケージを自動インストールする機能
   - ユーザーインターフェース（進行状況表示など）

2. **マルチプラットフォーム対応の強化**：
   - Windows、macOS に加えて Linux 対応の検討
   - 異なるアーキテクチャ（ARM/x64）間の互換性強化

## 変更ファイル一覧

以下のファイルが新規作成または変更されました：

### 新規作成ファイル
- `/src/electron/python_bridge.js.simplified` - システム Python 対応版の Python ブリッジ
- `/scripts/python_server_launcher_simple.sh` - macOS 用 Python ランチャー
- `/scripts/python_server_launcher_simple.bat` - Windows 用 Python ランチャー
- `/scripts/setup-python-env.js` - Python 環境セットアップスクリプト
- `/scripts/copy-python-script-mac.js` - macOS パッケージング用スクリプト
- `/scripts/copy-python-script-win.js` - Windows パッケージング用スクリプト
- `/scripts/copy-python-script-win-universal.js` - Windows ユニバーサルパッケージング用スクリプト
- `/scripts/build-windows-from-mac.sh` - macOS から Windows ビルドを行うスクリプト
- `/docs/mac-to-win-build.md` - macOS から Windows ビルドの手順書
- `/docs/system-python-implementation.md` - システム Python 実装の詳細説明
- `/docs/implementation-plan.md` - 実装計画の概要（本ドキュメント）

### 変更ファイル
- `/package.json` → `/package.json.simplified` - スクリプトコマンドの更新版

## 導入手順

システム Python 環境への移行を実施するには、以下の手順を実行します：

1. **バックアップの作成**：
   ```bash
   cp src/electron/python_bridge.js src/electron/python_bridge.js.backup
   cp package.json package.json.backup
   ```

2. **新ファイルの適用**：
   ```bash
   cp src/electron/python_bridge.js.simplified src/electron/python_bridge.js
   ```

3. **package.json の更新**：
   - package.json.simplified の内容を package.json にマージ（手動で行う必要があります）
   - 特に scripts セクションの更新が重要です

4. **必要なスクリプトの実行権限を付与**：
   ```bash
   chmod +x scripts/python_server_launcher_simple.sh
   chmod +x scripts/build-windows-from-mac.sh
   ```

5. **Python 環境のセットアップ**：
   ```bash
   node scripts/setup-python-env.js
   ```

6. **検証**：
   ```bash
   # 開発環境での動作確認
   npm run dev
   
   # macOS用パッケージのビルド
   npm run package-mac-system
   
   # Windows用パッケージのビルド（Dockerを使用）
   ./scripts/build-windows-from-mac.sh
   ```

## 注意事項

1. **互換性**：この変更により、アプリケーション実行にはユーザー環境に Python 3.9 以上がインストールされている必要があります。

2. **テスト**：すべての機能が正常に動作するか十分なテストが必要です。特に以下の点に注意してください：
   - OCR 機能
   - 画像分析機能
   - 大量のデータ処理
   - エラーハンドリング

3. **エンドユーザー向け説明**：システム Python を使用する場合、エンドユーザーに Python のインストールガイドを提供することを検討してください。将来的な自動インストール機能で解決する予定です。

## ロールバック計画

問題が発生した場合は、以下の手順でロールバックできます：

1. バックアップから元のファイルを復元：
   ```bash
   cp src/electron/python_bridge.js.backup src/electron/python_bridge.js
   cp package.json.backup package.json
   ```

2. アプリケーションを再起動し、動作を確認します。

## 今後の予定

1. フェーズ 1 の成果物をレビュー
2. フェーズ 2 の実装と検証を実施
3. 問題が解決した後、フェーズ 3 の計画を具体化