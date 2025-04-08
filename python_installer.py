#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import platform
import subprocess
import json
import tempfile
import urllib.request
import time

# インストールが必要なライブラリ
REQUIRED_LIBRARIES = [
    "numpy",
    "opencv-python",
    "scikit-image",
    "pillow",
    "tensorflow",
    "matplotlib"
]

# Pythonインストーラーの情報
PYTHON_INSTALLERS = {
    "Windows": {
        "url": "https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe",
        "filename": "python-3.10.11-amd64.exe",
        "command": "{} /quiet InstallAllUsers=1 PrependPath=1 Include_test=0"
    },
    "Darwin": {  # macOS
        "url": "https://www.python.org/ftp/python/3.10.11/python-3.10.11-macos11.pkg",
        "filename": "python-3.10.11-macos11.pkg",
        "command": "installer -pkg {} -target /"
    }
}

def log(message):
    """ログメッセージを出力"""
    print(f"[Python Installer] {message}")
    sys.stdout.flush()  # 確実に出力を表示

def run_command(command, shell=True, check=True):
    """コマンドを実行して結果を返す"""
    try:
        result = subprocess.run(
            command,
            shell=shell,
            text=True,
            capture_output=True,
            check=check
        )
        return {
            "success": True,
            "output": result.stdout,
            "error": result.stderr
        }
    except subprocess.CalledProcessError as e:
        return {
            "success": False,
            "output": e.stdout,
            "error": e.stderr,
            "code": e.returncode
        }

def check_python_installed():
    """Pythonがインストールされているかチェック"""
    try:
        # 現在のPythonではなく、システムにインストールされているPythonを確認
        if platform.system() == "Windows":
            command = ["where", "python"]
        else:  # macOS, Linux
            command = ["which", "python3"]

        result = subprocess.run(command, capture_output=True, text=True)
        return result.returncode == 0
    except Exception:
        return False

def install_python():
    """システムに適したPythonをインストール"""
    system = platform.system()
    if system not in PYTHON_INSTALLERS:
        log(f"サポートされていないシステムです: {system}")
        return False

    installer_info = PYTHON_INSTALLERS[system]
    log(f"Pythonインストーラーをダウンロードしています...")

    # インストーラーをダウンロード
    try:
        temp_dir = tempfile.gettempdir()
        installer_path = os.path.join(temp_dir, installer_info["filename"])

        urllib.request.urlretrieve(installer_info["url"], installer_path)
        log(f"インストーラーをダウンロードしました: {installer_path}")

        # インストールコマンドを実行
        install_command = installer_info["command"].format(installer_path)
        log(f"Pythonをインストールしています...")

        if system == "Windows":
            result = run_command(install_command)
        else:  # macOS
            result = run_command(install_command, check=False)

        if result["success"]:
            log("Pythonのインストールが完了しました")
            return True
        else:
            log(f"インストール中にエラーが発生しました: {result['error']}")
            return False
    except Exception as e:
        log(f"インストール中に例外が発生しました: {str(e)}")
        return False

def install_pip():
    """pipをインストールする"""
    log("pipをインストールしています...")
    # get-pip.pyをダウンロード
    try:
        temp_dir = tempfile.gettempdir()
        get_pip_path = os.path.join(temp_dir, "get-pip.py")

        urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", get_pip_path)
        log("get-pip.pyをダウンロードしました")

        # get-pip.pyを実行
        python_cmd = "python" if platform.system() == "Windows" else "python3"
        result = run_command(f"{python_cmd} {get_pip_path}")

        if result["success"]:
            log("pipのインストールが完了しました")
            return True
        else:
            log(f"pipのインストール中にエラーが発生しました: {result['error']}")
            return False
    except Exception as e:
        log(f"pipのインストール中に例外が発生しました: {str(e)}")
        return False

def install_libraries():
    """必要なライブラリをインストール"""
    log("必要なライブラリをインストールしています...")
    python_cmd = "python" if platform.system() == "Windows" else "python3"

    for library in REQUIRED_LIBRARIES:
        log(f"{library}をインストールしています...")
        result = run_command(f"{python_cmd} -m pip install {library}")

        if result["success"]:
            log(f"{library}のインストールが完了しました")
        else:
            log(f"{library}のインストール中にエラーが発生しました: {result['error']}")
            return False

    return True

def get_environment_status():
    """環境ステータスをJSON形式で返す"""
    # python_check.pyを実行して結果を取得
    python_cmd = "python" if platform.system() == "Windows" else "python3"
    try:
        # python_check.pyが同じディレクトリにあると仮定
        script_dir = os.path.dirname(os.path.abspath(__file__))
        check_script = os.path.join(script_dir, "python_check.py")

        result = subprocess.run(
            [python_cmd, check_script],
            capture_output=True,
            text=True,
            check=False
        )

        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            log(f"環境チェックスクリプトの実行中にエラーが発生しました: {result.stderr}")
            return None
    except Exception as e:
        log(f"環境ステータスの取得中に例外が発生しました: {str(e)}")
        return None

def main():
    """メイン関数"""
    log("Python環境のインストールを開始します")

    # Pythonがインストールされているか確認
    if not check_python_installed():
        log("Pythonがインストールされていません。インストールを開始します...")
        if not install_python():
            log("Pythonのインストールに失敗しました。手動でインストールしてください。")
            return {
                "success": False,
                "message": "Pythonのインストールに失敗しました"
            }

        # インストール直後はPATHが更新されていない可能性があるため、少し待機
        log("インストール完了後のPATH更新を待機中...")
        time.sleep(5)

    # pipが利用可能か確認し、必要なら追加インストール
    log("pipが利用可能か確認しています...")
    python_cmd = "python" if platform.system() == "Windows" else "python3"
    pip_check = run_command(f"{python_cmd} -m pip --version", check=False)

    if not pip_check["success"]:
        log("pipがインストールされていません。インストールを開始します...")
        if not install_pip():
            log("pipのインストールに失敗しました。")
            return {
                "success": False,
                "message": "pipのインストールに失敗しました"
            }

    # 必要なライブラリをインストール
    if not install_libraries():
        log("一部のライブラリのインストールに失敗しました。")
        return {
            "success": False,
            "message": "一部のライブラリのインストールに失敗しました"
        }

    # 環境ステータスを確認
    log("環境ステータスを確認しています...")
    status = get_environment_status()

    if status and status["summary"]["all_libraries_installed"]:
        log("すべてのライブラリが正常にインストールされました。")
        return {
            "success": True,
            "message": "すべてのライブラリが正常にインストールされました",
            "status": status
        }
    else:
        missing = status["summary"]["missing_libraries"] if status else "不明"
        log(f"一部のライブラリがインストールされていません: {missing}")
        return {
            "success": False,
            "message": f"一部のライブラリがインストールされていません: {missing}",
            "status": status
        }

if __name__ == "__main__":
    result = main()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["success"] else 1)
