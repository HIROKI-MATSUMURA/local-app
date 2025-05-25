# WebAssembly依存関係のセットアップと問題解決

このドキュメントでは、CreAIteCodeアプリケーションのWebAssembly依存関係の管理と問題解決について説明します。

## WebAssembly依存パッケージ

アプリケーションは以下のWebAssemblyモジュールに依存しています：

1. **@techstark/opencv-js** (v4.10.0-release.1以上)
   - 画像処理と解析機能を提供
   - コンピュータビジョン機能を実装

2. **tesseract.js** (v6.0.0以上)
   - OCR（光学文字認識）機能を提供
   - 画像からテキストを抽出するために使用

3. **photon-web** (v0.3.2以上)
   - 高速な画像処理機能を提供
   - WebAssemblyを使用した画像変換・フィルタ処理

## photon-webモジュールの問題と修復

photon-webモジュールはネイティブWebAssemblyバイナリを含み、特別な処理が必要な場合があります。インストール後にロードできない問題が発生することがあります。

### 自動修復スクリプト

問題が発生した場合、以下のスクリプトを実行して修復できます：

```bash
node scripts/fix-photon-web.js
```

このスクリプトは以下の処理を行います：
1. photon-webディレクトリの削除
2. 最新バージョンのphoton-webの再インストール
3. モジュールのリビルド
4. ロード可能かどうかの検証

### 手動修復方法

自動スクリプトが機能しない場合、以下の手順で手動修復できます：

1. アプリケーションディレクトリで以下のコマンドを実行：
   ```bash
   npm uninstall photon-web
   npm install photon-web@latest --force
   npm rebuild photon-web
   ```

2. それでも問題が解決しない場合は、以下を試してください：
   ```bash
   # node_modulesディレクトリのキャッシュをクリア
   rm -rf node_modules/.cache
   # 依存関係を完全に再インストール
   npm ci
   ```

## 他のWebAssemblyモジュールの問題

OpenCV.jsやTesseract.jsで問題が発生した場合も同様のアプローチが有効です：

1. 特定のモジュールのみを再インストール：
   ```bash
   npm uninstall [問題のあるモジュール]
   npm install [問題のあるモジュール]@latest --force
   npm rebuild [問題のあるモジュール]
   ```

2. すべてのWebAssembly依存関係を再インストール：
   ```bash
   npm uninstall @techstark/opencv-js tesseract.js photon-web
   npm install @techstark/opencv-js@^4.10.0-release.1 tesseract.js@^6.0.0 photon-web@^0.3.2 --force
   ```

## トラブルシューティング

WebAssembly環境に問題がある場合、アプリケーションは自動的に「WebAssembly環境セットアップ」ダイアログを表示します。このダイアログの指示に従って問題を解決してください。

### よくある問題

1. **モジュールが見つからないエラー**
   - 解決策: `npm install [モジュール名]@latest --force`

2. **WebAssemblyファイルのロードエラー**
   - 解決策: `npm rebuild [モジュール名]`

3. **インストールはされているがロードできない**
   - 解決策: fix-photon-web.jsスクリプトを実行

4. **キャッシュの問題**
   - 解決策: `rm -rf node_modules/.cache` を実行後、アプリケーションを再起動

## 開発者向け情報

WebAssembly環境のチェックは以下のファイルで実装されています：
- `src/electron/webassemblySetupHandler.js`: 環境チェックとセットアップ処理
- `src/electron/WebAssemblySetupWindow.js`: セットアップUIの生成
- `src/electron/utils/module-resolver.js`: モジュール解決ヘルパー
- `scripts/fix-photon-web.js`: photon-web修復スクリプト

これらのファイルを確認して、詳細な実装とカスタマイズオプションを理解できます。