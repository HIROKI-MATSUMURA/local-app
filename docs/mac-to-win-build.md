# macOS から Windows 用アプリケーションをビルドする手順

このドキュメントでは、macOS 環境から Windows 用の CreAIteCode アプリケーションをビルドする手順について説明します。このクロスプラットフォームビルドは Docker を利用して行います。

## 前提条件

以下のソフトウェアがインストールされている必要があります：

1. **Docker Desktop for Mac** - [Docker公式サイト](https://www.docker.com/products/docker-desktop)からダウンロードしてインストール
2. **Node.js** - プロジェクトでは Volta で管理（Node.js v20.19.1）
3. **npm パッケージ** - プロジェクトの依存関係が `npm install` でインストール済み

## macOSからWindowsビルドの手順

### 1. Docker イメージのプル

初回のみ、必要な Docker イメージをプルします：

```bash
docker pull electronuserland/builder:wine
```

Apple Silicon Mac（M1/M2/M3 など）をお使いの場合は、Docker Desktop の設定で Rosetta 変換を有効にしてください。

### 2. Docker コンテナの起動

プロジェクトのルートディレクトリで以下のコマンドを実行し、Docker コンテナを起動します：

```bash
docker run --rm -ti \
  --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ${PWD##*/}-node-modules:/project/node_modules \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine
```

これにより、Windows アプリケーションをビルドするための環境が整った Docker コンテナが起動します。

### 3. コンテナ内でのビルド実行

コンテナのシェルに入ったら、以下のコマンドを実行してビルドを行います：

```bash
# システム環境依存版Windows用ビルド（x64のみ）
npm run package-win-system

# または、システム環境依存版Windows用ユニバーサルビルド（x64とia32の両方）
npm run package-win-system-universal
```

ビルドが成功すると、`release` ディレクトリに Windows 用のインストーラーが生成されます。

### 4. ビルド結果の確認

ビルドが完了したら、以下のファイルが生成されているはずです：

- `release/CreAIteCode_Setup_x.y.z.exe` - インストーラーファイル
- `release/win-unpacked/` - 展開済みのアプリケーションフォルダ（x64用）
- `release/win-ia32-unpacked/` - 展開済みのアプリケーションフォルダ（ia32用、ユニバーサルビルドの場合）

## トラブルシューティング

### ビルドに失敗する場合

1. **メモリ不足エラー**：Docker に割り当てられたメモリが不足している可能性があります。Docker Desktop の設定でメモリ割り当てを増やしてください。

2. **パスの問題**：Windows と macOS ではパス区切り文字が異なります。Python スクリプトがパスを正しく処理しているか確認してください。

3. **Node.js ネイティブモジュールの問題**：一部のネイティブモジュールは Docker 環境でのビルドに問題がある場合があります。必要に応じてプリビルドバージョンを使用するか、互換性のあるバージョンに変更してください。

4. **Docker のファイル共有権限**：macOS のファイル共有権限に問題がある場合、Docker がプロジェクトディレクトリにアクセスできない可能性があります。Docker Desktop の設定でファイル共有のアクセス権を確認してください。

### コード署名について

現在の設定では、ビルドされたアプリケーションは署名されていません。Windows アプリケーションの署名が必要な場合は、別途署名プロセスを設定する必要があります。

## 注意点

1. **ビルド時間**：Docker 経由でのビルドは通常のビルドよりも時間がかかる場合があります。特に初回ビルド時はキャッシュがないため、より多くの時間がかかります。

2. **ディスク容量**：Docker イメージとビルドキャッシュに十分なディスク容量があることを確認してください。

3. **Python 互換性**：システム環境依存版ビルドでは、エンドユーザーのコンピューターに Python 環境がインストールされている必要があります。インストール手順をエンドユーザーに提供することを検討してください。

## 自動化スクリプト (オプション)

ビルドプロセスを簡素化するために、以下のようなシェルスクリプトを作成することもできます：

```bash
#!/bin/bash
# build-windows-app.sh

echo "Windows用アプリケーションのビルドを開始します..."

# 現在のディレクトリを取得
CURRENT_DIR=$(pwd)
PROJECT_NAME=$(basename "$CURRENT_DIR")

# Dockerコンテナでビルドを実行
docker run --rm \
  --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ${PROJECT_NAME}-node-modules:/project/node_modules \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "npm run package-win-system-universal"

echo "ビルドが完了しました。releaseディレクトリを確認してください。"
```

このスクリプトを実行可能にして使用できます：

```bash
chmod +x build-windows-app.sh
./build-windows-app.sh
```