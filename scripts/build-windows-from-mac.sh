#!/bin/bash
# Windows用アプリケーションをmacOSからビルドするスクリプト

# カラー出力用の設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ヘルプメッセージを表示
function show_help {
  echo -e "${YELLOW}macOSからWindows用アプリケーションをビルドするスクリプト${NC}"
  echo ""
  echo "使用方法:"
  echo "  $0 [options]"
  echo ""
  echo "オプション:"
  echo "  -h, --help        このヘルプメッセージを表示"
  echo "  -a, --all         x64およびia32の両方をビルド（ユニバーサルビルド）"
  echo "  -x, --x64         x64アーキテクチャのみをビルド（デフォルト）"
  echo "  -i, --interactive Dockerコンテナに入り、手動でコマンドを実行"
  echo ""
  echo "例:"
  echo "  $0 --all          # x64とia32の両方をビルド"
  echo "  $0 --x64          # x64のみをビルド"
  echo "  $0 --interactive  # インタラクティブモードでDockerを起動"
}

# デフォルト設定
BUILD_TYPE="x64"
INTERACTIVE=false

# 引数の解析
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        -a|--all) BUILD_TYPE="universal"; shift ;;
        -x|--x64) BUILD_TYPE="x64"; shift ;;
        -i|--interactive) INTERACTIVE=true; shift ;;
        *) echo "Unknown parameter: $1"; show_help; exit 1 ;;
    esac
done

# Dockerがインストールされているか確認
if ! command -v docker &> /dev/null; then
    echo -e "${RED}エラー: Dockerがインストールされていません。${NC}"
    echo "Docker Desktopをインストールしてください: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Dockerデーモンが実行中か確認
if ! docker info &> /dev/null; then
    echo -e "${RED}エラー: Dockerデーモンが実行されていません。${NC}"
    echo "Docker Desktopを起動してください。"
    exit 1
fi

echo -e "${YELLOW}Windows用アプリケーションのビルドを準備しています...${NC}"

# 現在のディレクトリを取得
CURRENT_DIR=$(pwd)
PROJECT_NAME=$(basename "$CURRENT_DIR")

# Dockerイメージが存在するか確認
if ! docker images | grep -q "electronuserland/builder"; then
    echo -e "${YELLOW}Dockerイメージをダウンロードしています...${NC}"
    docker pull electronuserland/builder:wine
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}エラー: Dockerイメージのダウンロードに失敗しました。${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}ビルドコマンドを準備しています...${NC}"

# ビルドコマンドの設定
if [ "$BUILD_TYPE" = "universal" ]; then
    BUILD_COMMAND="npm run package-win-system-universal"
    echo "ユニバーサルビルド（x64およびia32）を行います。"
else
    BUILD_COMMAND="npm run package-win-system"
    echo "x64アーキテクチャのみをビルドします。"
fi

# インタラクティブモードかバッチモードかを決定
if [ "$INTERACTIVE" = true ]; then
    echo -e "${YELLOW}インタラクティブモードでDockerコンテナを起動します...${NC}"
    echo "コンテナ内で以下のコマンドを実行してビルドを開始してください:"
    echo -e "${GREEN}$BUILD_COMMAND${NC}"
    
    docker run --rm -ti \
      --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
      --env ELECTRON_CACHE="/root/.cache/electron" \
      --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
      -v ${PWD}:/project \
      -v ${PROJECT_NAME}-node-modules:/project/node_modules \
      -v ~/.cache/electron:/root/.cache/electron \
      -v ~/.cache/electron-builder:/root/.cache/electron-builder \
      electronuserland/builder:wine
else
    echo -e "${YELLOW}Dockerコンテナでビルドを実行します...${NC}"
    
    docker run --rm \
      --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
      --env ELECTRON_CACHE="/root/.cache/electron" \
      --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
      -v ${PWD}:/project \
      -v ${PROJECT_NAME}-node-modules:/project/node_modules \
      -v ~/.cache/electron:/root/.cache/electron \
      -v ~/.cache/electron-builder:/root/.cache/electron-builder \
      electronuserland/builder:wine \
      /bin/bash -c "$BUILD_COMMAND"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}ビルドが正常に完了しました！${NC}"
        echo "releaseディレクトリに生成されたファイルを確認してください。"
    else
        echo -e "${RED}ビルドに失敗しました。${NC}"
        echo "エラーメッセージを確認して問題を解決してください。"
        exit 1
    fi
fi

exit 0