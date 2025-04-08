#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
import platform
import subprocess
import importlib
import os

# 必要なライブラリのリスト
REQUIRED_LIBRARIES = [
    "numpy",
    "opencv-python",
    "scikit-image",
    "pillow",
    "tensorflow",  # or "torch"
    "matplotlib"
]

def check_python_version():
    """Pythonのバージョンを確認"""
    major, minor, micro = sys.version_info[:3]
    return {
        "version": f"{major}.{minor}.{micro}",
        "is_compatible": major == 3 and minor >= 8,
        "full_version": sys.version
    }

def check_library(library_name):
    """特定のライブラリがインストールされているかを確認"""
    try:
        if library_name == "opencv-python":
            # OpenCV特有の確認方法
            importlib.import_module("cv2")
            import cv2
            return {
                "name": library_name,
                "installed": True,
                "version": cv2.__version__
            }
        else:
            # 一般的なライブラリの確認方法
            lib = importlib.import_module(library_name.split('-')[0])
            version = getattr(lib, "__version__", "不明")
            return {
                "name": library_name,
                "installed": True,
                "version": version
            }
    except ImportError:
        return {
            "name": library_name,
            "installed": False,
            "version": None
        }

def check_all_libraries():
    """すべての必要なライブラリを確認"""
    return [check_library(lib) for lib in REQUIRED_LIBRARIES]

def check_pip():
    """pipコマンドの確認"""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "--version"],
            capture_output=True,
            text=True,
            check=True
        )
        return {
            "installed": True,
            "version": result.stdout.strip()
        }
    except (subprocess.SubprocessError, FileNotFoundError):
        return {
            "installed": False,
            "version": None
        }

def get_system_info():
    """システム情報を取得"""
    return {
        "platform": platform.system(),
        "platform_version": platform.version(),
        "processor": platform.processor()
    }

def main():
    """環境チェックを実行してJSON形式で出力"""
    environment_data = {
        "python": check_python_version(),
        "pip": check_pip(),
        "libraries": check_all_libraries(),
        "system": get_system_info()
    }

    # ライブラリのインストール状況の要約
    missing_libraries = [lib["name"] for lib in environment_data["libraries"] if not lib["installed"]]
    environment_data["summary"] = {
        "python_compatible": environment_data["python"]["is_compatible"],
        "pip_installed": environment_data["pip"]["installed"],
        "all_libraries_installed": len(missing_libraries) == 0,
        "missing_libraries": missing_libraries
    }

    # JSON形式で出力
    print(json.dumps(environment_data, ensure_ascii=False, indent=2))
    return environment_data

if __name__ == "__main__":
    main()
