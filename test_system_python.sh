#!/bin/bash
# システム環境依存のPythonテストスクリプト

# スクリプトのあるディレクトリを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_SCRIPT="${SCRIPT_DIR}/src/python/test_system_python.py"

echo "=== System Python Test Runner ==="
echo "Script path: ${PYTHON_SCRIPT}"

# システムのPythonコマンドを確認
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
    echo "Using Python3 command"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
    echo "Using Python command"
else
    echo "Python not found!"
    exit 1
fi

# Pythonバージョンを確認
$PYTHON_CMD --version

# テストスクリプトに実行権限を付与
chmod +x "${PYTHON_SCRIPT}"

# テストスクリプトを実行
"${PYTHON_CMD}" "${PYTHON_SCRIPT}"