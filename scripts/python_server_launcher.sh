#!/bin/bash

# Python Server Launcher Script
# アーキテクチャに基づいて適切なバイナリを実行します

# 現在のディレクトリを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 現在のアーキテクチャを検出
ARCH=$(uname -m)

# 実行ファイルのパスを設定
ARM64_BINARY="${SCRIPT_DIR}/python_server_arm64"
X64_BINARY="${SCRIPT_DIR}/python_server_x64"

echo "Python Server Launcher を起動しています..."
echo "検出されたアーキテクチャ: ${ARCH}"

# アーキテクチャに基づいて適切な実行ファイルを選択
if [[ "${ARCH}" == "arm64" ]]; then
    echo "ARM64バイナリを実行します: ${ARM64_BINARY}"
    # 引数をすべて渡して実行
    exec "${ARM64_BINARY}" "$@"
else
    echo "x64バイナリを実行します: ${X64_BINARY}"
    # 引数をすべて渡して実行
    exec "${X64_BINARY}" "$@"
fi

# このコードは実行されません（execが成功した場合）
echo "エラー: 適切なバイナリを実行できませんでした"
exit 1
