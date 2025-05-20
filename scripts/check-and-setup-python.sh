#!/bin/bash
# Python環境チェックとセットアップスクリプト
# アプリケーションと一緒に配布されるスクリプト

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# スクリプトのあるディレクトリを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}     CreAIteCode Python環境セットアップ     ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo

# Pythonコマンドの確認
PYTHON_CMD="python3"
if ! command -v $PYTHON_CMD &> /dev/null; then
    # python3が見つからない場合はpythonを試す
    PYTHON_CMD="python"
    if ! command -v $PYTHON_CMD &> /dev/null; then
        echo -e "${RED}Pythonが見つかりません。${NC}"
        echo -e "${YELLOW}Python 3.7以上をインストールしてください:${NC}"
        echo -e "  Mac: brew install python"
        echo -e "  Windows: https://www.python.org/downloads/"
        echo -e "  Linux: sudo apt install python3 python3-pip"
        echo
        echo -e "${YELLOW}インストール後、このスクリプトを再実行してください。${NC}"
        exit 1
    fi
fi

# Pythonバージョンの確認
PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
echo -e "${GREEN}Python バージョン: ${PYTHON_VERSION}${NC}"

# pipコマンドの確認
PIP_CMD="pip3"
if ! command -v $PIP_CMD &> /dev/null; then
    # pip3が見つからない場合はpipを試す
    PIP_CMD="pip"
    if ! command -v $PIP_CMD &> /dev/null; then
        # それでも見つからない場合はpython -m pipを使用
        PIP_CMD="$PYTHON_CMD -m pip"
    fi
fi

echo -e "${BLUE}必要なライブラリをチェックしています...${NC}"

# 必要なパッケージリスト
REQUIRED_PACKAGES=("numpy" "pillow" "opencv-python" "torch")

# インストールが必要なパッケージを追跡
MISSING_PACKAGES=()

# 各パッケージをチェック
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    echo -n "Checking $pkg... "
    
    # パッケージ名とインポート名のマッピング
    if [ "$pkg" == "pillow" ]; then
        IMPORT_NAME="PIL"
    elif [ "$pkg" == "opencv-python" ]; then
        IMPORT_NAME="cv2"
    else
        IMPORT_NAME="$pkg"
    fi
    
    # パッケージのインポートテスト
    if $PYTHON_CMD -c "import $IMPORT_NAME" 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}見つかりません${NC}"
        MISSING_PACKAGES+=("$pkg")
    fi
done

# 不足しているパッケージがある場合
if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo -e "\n${YELLOW}以下のパッケージをインストールする必要があります:${NC}"
    printf " - %s\n" "${MISSING_PACKAGES[@]}"
    
    echo -e "\n${BLUE}これらのパッケージをインストールしますか？ [y/N]${NC}"
    read -r answer
    
    if [[ "$answer" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo -e "${BLUE}パッケージをインストールしています...${NC}"
        $PIP_CMD install "${MISSING_PACKAGES[@]}"
        
        if [ $? -eq 0 ]; then
            echo -e "\n${GREEN}必要なパッケージのインストールが完了しました！${NC}"
        else
            echo -e "\n${RED}パッケージのインストールに失敗しました。${NC}"
            echo -e "${YELLOW}以下のコマンドを手動で実行してください:${NC}"
            echo -e "  $PIP_CMD install ${MISSING_PACKAGES[*]}"
            exit 1
        fi
    else
        echo -e "\n${YELLOW}インストールをスキップしました。${NC}"
        echo -e "${YELLOW}アプリケーションを使用するには、以下のコマンドでパッケージをインストールしてください:${NC}"
        echo -e "  $PIP_CMD install ${MISSING_PACKAGES[*]}"
        exit 1
    fi
else
    echo -e "\n${GREEN}✓ すべての必要なパッケージがインストールされています！${NC}"
fi

echo -e "\n${GREEN}CreAIteCodeで使用するPython環境の設定が完了しました！${NC}"
echo -e "${GREEN}アプリケーションを起動して、作業を開始できます。${NC}"
exit 0