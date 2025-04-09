#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Python Setup Script
画像分析に必要なPythonパッケージをインストールし、環境を検証するスクリプト
"""

import sys
import os
import subprocess
import argparse
import json
import platform
from datetime import datetime

# 必要なパッケージリスト
REQUIRED_PACKAGES = [
    "numpy",
    "opencv-python",
    "pillow",
    "scikit-image",
    "scikit-learn",
    "pytesseract",
    "matplotlib",
    "imutils"
]

# オプションパッケージ（存在すれば利用するが、必須ではない）
OPTIONAL_PACKAGES = [
    "tensorflow",  # 深層学習機能を使用する場合
    "torch",       # PyTorchを使用する場合
]

# ログファイルパス
LOG_FILE = os.path.join(os.path.expanduser("~"), "image_analyzer_setup.log")


def log_message(message, log_type="INFO"):
    """ログメッセージを出力とログファイルに書き込む"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] [{log_type}] {message}"

    # 標準出力に表示
    print(log_entry)

    # ログファイルに書き込み
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")
    except Exception as e:
        print(f"[ERROR] ログファイルへの書き込みエラー: {e}")


def get_system_info():
    """システム情報を取得する"""
    info = {
        "platform": platform.platform(),
        "python_version": sys.version,
        "python_path": sys.executable,
        "cpu_count": os.cpu_count(),
        "user_home": os.path.expanduser("~"),
        "cwd": os.getcwd()
    }
    return info


def check_pip():
    """pipが利用可能かチェックする"""
    try:
        # pipバージョンをチェック
        result = subprocess.run(
            [sys.executable, "-m", "pip", "--version"],
            capture_output=True,
            text=True,
            check=True
        )
        log_message(f"pip が利用可能です: {result.stdout.strip()}")
        return True
    except (subprocess.SubprocessError, FileNotFoundError) as e:
        log_message(f"pip の確認に失敗しました: {e}", "ERROR")
        return False


def install_package(package_name):
    """パッケージをインストールする"""
    log_message(f"{package_name} をインストールしています...")

    try:
        # pipを使用してパッケージをインストール
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", package_name],
            capture_output=True,
            text=True,
            check=True
        )
        log_message(f"{package_name} のインストールに成功しました")
        return True
    except subprocess.CalledProcessError as e:
        log_message(f"{package_name} のインストールに失敗しました: {e.stderr}", "ERROR")
        return False


def verify_package(package_name):
    """パッケージがインストールされているか確認する"""
    try:
        # パッケージをインポートしてみる
        __import__(package_name.split(">=")[0].split("==")[0])
        return True
    except ImportError:
        return False


def verify_environment():
    """環境が正しく設定されているか検証する"""
    log_message("環境検証を開始します...")

    # すべての必須パッケージが揃っているかチェック
    missing_packages = []

    for package in REQUIRED_PACKAGES:
        package_name = package.split(">=")[0].split("==")[0]
        if not verify_package(package_name):
            missing_packages.append(package)

    if missing_packages:
        log_message(f"不足しているパッケージ: {', '.join(missing_packages)}", "WARNING")
        return False
    else:
        log_message("必要なパッケージはすべてインストールされています")

        # オプショナルパッケージの確認
        installed_optional = []
        missing_optional = []

        for package in OPTIONAL_PACKAGES:
            package_name = package.split(">=")[0].split("==")[0]
            if verify_package(package_name):
                installed_optional.append(package_name)
            else:
                missing_optional.append(package_name)

        if installed_optional:
            log_message(f"インストール済みのオプショナルパッケージ: {', '.join(installed_optional)}")

        if missing_optional:
            log_message(f"インストールされていないオプショナルパッケージ: {', '.join(missing_optional)}", "INFO")

        return True


def check_tesseract():
    """Tesseractがインストールされているか確認する"""
    try:
        import pytesseract
        tesseract_path = pytesseract.pytesseract.tesseract_cmd

        # Tesseractの実行ファイルをチェック
        result = subprocess.run(
            [tesseract_path, "--version"],
            capture_output=True,
            text=True,
            check=True
        )
        log_message(f"Tesseract OCRが利用可能です: {result.stdout.splitlines()[0]}")
        return True
    except (ImportError, subprocess.SubprocessError, FileNotFoundError, AttributeError) as e:
        log_message(f"Tesseract OCRのチェックに失敗しました: {e}", "WARNING")
        log_message("Tesseract OCRをインストールしてください。テキスト認識機能が利用できない可能性があります。", "INFO")
        return False


def setup_environment():
    """環境をセットアップする"""
    log_message("環境セットアップを開始します...")

    # システム情報を表示
    system_info = get_system_info()
    log_message(f"システム情報: {json.dumps(system_info, indent=2)}")

    # pipが利用可能か確認
    if not check_pip():
        log_message("pip が利用できないため、セットアップを中止します", "ERROR")
        return False

    # 必要なパッケージをインストール
    failed_installs = []

    for package in REQUIRED_PACKAGES:
        package_name = package.split(">=")[0].split("==")[0]
        if not verify_package(package_name):
            if not install_package(package):
                failed_installs.append(package)

    if failed_installs:
        log_message(f"インストールに失敗したパッケージ: {', '.join(failed_installs)}", "ERROR")
        return False

    # Tesseractをチェック
    check_tesseract()

    # 最終確認
    if verify_environment():
        log_message("環境セットアップが完了しました")
        return True
    else:
        log_message("環境セットアップに問題があります", "ERROR")
        return False


def main():
    """メイン関数"""
    parser = argparse.ArgumentParser(description='Pythonセットアップスクリプト')
    parser.add_argument('--verify-only', action='store_true', help='環境検証のみを実行し、パッケージのインストールは行わない')
    args = parser.parse_args()

    log_message("Pythonセットアップスクリプトを開始します")

    if args.verify_only:
        log_message("検証モードで実行します")
        if verify_environment():
            log_message("環境検証に成功しました")
            sys.exit(0)
        else:
            log_message("環境検証に失敗しました", "ERROR")
            sys.exit(1)
    else:
        log_message("セットアップモードで実行します")
        if setup_environment():
            log_message("セットアップに成功しました")
            sys.exit(0)
        else:
            log_message("セットアップに失敗しました", "ERROR")
            sys.exit(1)


if __name__ == "__main__":
    main()
