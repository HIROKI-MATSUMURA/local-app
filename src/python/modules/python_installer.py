#!/usr/bin/env python3
# coding: utf-8

import os
import sys
import subprocess
import platform
import json
import logging
from pathlib import Path
import datetime

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('PythonInstaller')

# 必要なパッケージのリスト
REQUIRED_PACKAGES = [
    'numpy',
    'opencv-python',
    'pillow',
    'pytesseract',
    'scikit-learn',
    'scikit-image',
    'scipy'
]

# TensorFlowとYOLOは必須ではないが、利用可能な場合は機能強化される
OPTIONAL_PACKAGES = [
    'tensorflow',
    'keras'
]

def check_python_version():
    """Pythonのバージョンをチェックする"""
    logger.info("Pythonバージョンを確認中...")
    try:
        python_version = sys.version_info
        logger.info(f"Python {python_version.major}.{python_version.minor}.{python_version.micro} が検出されました")
        return python_version.major >= 3 and python_version.minor >= 6
    except Exception as e:
        logger.error(f"Pythonバージョンの確認中にエラーが発生しました: {e}")
        return False

def check_pip():
    """pipが利用可能かチェックする"""
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', '--version'],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError:
        logger.error("pipが見つかりません。")
        return False

def install_package(package_name):
    """指定されたパッケージをインストールする"""
    try:
        logger.info(f"{package_name} のインストールを試みています...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', package_name],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        logger.info(f"{package_name} のインストールに成功しました。")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"{package_name} のインストールに失敗しました: {str(e)}")
        return False

def check_and_install_package(package_name, optional=False):
    """パッケージの存在をチェックし、なければインストールする"""
    try:
        __import__(package_name.split('==')[0].replace('-', '_'))
        logger.info(f"{package_name} は既にインストールされています。")
        return True
    except ImportError:
        if optional:
            logger.warning(f"オプショナルパッケージ {package_name} が見つかりません。")
            response = input(f"{package_name} をインストールしますか？(y/n): ")
            if response.lower() != 'y':
                logger.info(f"{package_name} のインストールをスキップします。")
                return False
        return install_package(package_name)

def check_tesseract():
    """Tesseractが利用可能かチェックする"""
    logger.info("Tesseractのインストール状況を確認中...")
    try:
        # Tesseractのバージョンを確認
        result = subprocess.run(['tesseract', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            logger.info(f"Tesseractがインストールされています: {result.stdout.splitlines()[0]}")
            return True
        else:
            logger.warning("Tesseractがインストールされていないようです")
            return False
    except Exception as e:
        logger.warning(f"Tesseractのチェック中にエラーが発生しました: {e}")
        logger.info("Tesseractのインストール方法をガイド中...")
        if sys.platform == 'darwin':  # macOS
            logger.info("macOSユーザー向け: 'brew install tesseract' を実行してTesseractをインストールしてください")
        elif sys.platform == 'win32':  # Windows
            logger.info("Windowsユーザー向け: https://github.com/UB-Mannheim/tesseract/wiki からTesseractをダウンロードしてインストールしてください")
        else:  # Linux
            logger.info("Linuxユーザー向け: 'sudo apt-get install tesseract-ocr' または同等のコマンドを実行してTesseractをインストールしてください")
        return False

def create_virtual_env():
    """仮想環境の作成を試みる"""
    try:
        env_path = Path(os.path.dirname(os.path.abspath(__file__))) / 'venv'
        if env_path.exists():
            logger.info(f"仮想環境は既に {env_path} に存在します。")
            return True

        logger.info("仮想環境を作成しています...")
        subprocess.check_call([sys.executable, '-m', 'venv', str(env_path)],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        logger.info(f"仮想環境が {env_path} に作成されました。")

        # 環境情報をJSONで保存
        env_info = {
            'path': str(env_path),
            'python_version': f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            'created_at': str(datetime.datetime.now())
        }
        with open(env_path / 'env_info.json', 'w') as f:
            json.dump(env_info, f, indent=2)

        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"仮想環境の作成に失敗しました: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"予期せぬエラーが発生しました: {str(e)}")
        return False

def setup_environment():
    """Python環境のセットアップを行う"""
    logger.info("Python環境のセットアップを開始します...")

    if not check_python_version():
        return False

    if not check_pip():
        logger.error("pipが必要です。Pythonをインストールし直してください。")
        return False

    # 仮想環境の作成はオプション
    # create_virtual_env()

    # 必須パッケージのインストール
    all_installed = True
    for package in REQUIRED_PACKAGES:
        if not check_and_install_package(package):
            all_installed = False

    # オプショナルパッケージのインストール
    for package in OPTIONAL_PACKAGES:
        check_and_install_package(package, optional=True)

    # Tesseractの確認
    check_tesseract()

    if all_installed:
        logger.info("すべての必須パッケージがインストールされました。")
        return True
    else:
        logger.warning("一部のパッケージのインストールに失敗しました。")
        return False

def main():
    """メイン関数"""
    try:
        logger.info("Python環境インストーラーを開始します...")
        result = setup_environment()
        if result:
            logger.info("セットアップが正常に完了しました。")
            # 結果をJSONで出力
            result_data = {
                'status': 'success',
                'message': 'Python環境が正常にセットアップされました。'
            }
        else:
            logger.warning("セットアップが完了しましたが、一部の問題がありました。")
            # 結果をJSONで出力
            result_data = {
                'status': 'warning',
                'message': 'セットアップが一部の問題付きで完了しました。'
            }

        # 結果をJSONファイルに保存
        output_path = Path(os.path.dirname(os.path.abspath(__file__))) / 'setup_result.json'
        with open(output_path, 'w') as f:
            json.dump(result_data, f, indent=2)

        logger.info(f"セットアップ結果が {output_path} に保存されました。")
        return 0
    except Exception as e:
        logger.error(f"予期せぬエラーが発生しました: {str(e)}")
        # 結果をJSONで出力
        result_data = {
            'status': 'error',
            'message': f'セットアップ中にエラーが発生しました: {str(e)}'
        }
        try:
            output_path = Path(os.path.dirname(os.path.abspath(__file__))) / 'setup_result.json'
            with open(output_path, 'w') as f:
                json.dump(result_data, f, indent=2)
        except:
            pass
        return 1

if __name__ == "__main__":
    sys.exit(main())
