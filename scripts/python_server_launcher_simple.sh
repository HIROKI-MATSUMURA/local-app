#!/bin/bash
# システム環境依存のPythonランチャースクリプト

# スクリプトのあるディレクトリを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_SCRIPT="${SCRIPT_DIR}/python/python_server.py"

# システムのPythonコマンドを設定
PYTHON_CMD="python3"

# 必要なパッケージをチェック
if ! $PYTHON_CMD -c "import numpy; import PIL; import cv2" &>/dev/null; then
  echo "=========================================="
  echo "必要なPythonパッケージがインストールされていません。"
  echo "以下のコマンドを実行してください："
  echo "pip3 install numpy pillow opencv-python"
  echo "=========================================="
  exit 1
fi

# スクリプトを実行
echo "Pythonスクリプトを実行: ${PYTHON_SCRIPT}"
exec "${PYTHON_CMD}" "${PYTHON_SCRIPT}" "$@"