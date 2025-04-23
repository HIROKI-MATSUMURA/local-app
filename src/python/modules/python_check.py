#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Python環境チェックスクリプト

このスクリプトは以下の機能を提供します：
1. Pythonバージョンの確認（3.8以上推奨）
2. requirements.txtから依存パッケージのリスト読み込み
3. 各パッケージのインストール状態とバージョン確認
4. 結果をJSON形式で標準出力（Electron用）または人間が読みやすい形式で出力

使用方法:
    python python_check.py             # 標準出力（人間可読形式）
    python python_check.py --json      # JSON形式で出力（Electron連携用）
"""

import sys
import os
import json
import importlib.util
import importlib.metadata
import platform
import re
from packaging import version
import subprocess

# Pythonの最小要求バージョン
MIN_PYTHON_VERSION = "3.8.0"

# 結果を格納する変数
results = {
    "python_version": {
        "installed": "",
        "required": MIN_PYTHON_VERSION,
        "is_compatible": False,
        "message": ""
    },
    "packages": [],
    "overall_status": "fail",
    "summary": {
        "installed_count": 0,
        "missing_count": 0,
        "incompatible_count": 0
    }
}

def check_python_version():
    """Pythonのバージョンを確認します"""
    version = sys.version_info
    version_str = f"{version.major}.{version.minor}.{version.micro}"
    return {
        "version": version_str,
        "is_compatible": version.major >= 3 and version.minor >= 6
    }

def check_library(library_name):
    """指定されたライブラリがインストールされているか確認します"""
    spec = importlib.util.find_spec(library_name)
    if spec is not None:
        try:
            lib = importlib.import_module(library_name)
            version = getattr(lib, "__version__", "バージョン不明")
            return {"installed": True, "version": version}
        except ImportError:
            return {"installed": True, "version": "バージョン不明"}
    return {"installed": False}

def check_image_processing_libs():
    """画像処理に必要なライブラリをチェックします"""
    libraries = {
        "numpy": {"required": True},
        "opencv-python": {"module_name": "cv2", "required": True},
        "pillow": {"module_name": "PIL", "required": True},
        "scikit-image": {"module_name": "skimage", "required": True},
        "tensorflow": {"required": False},
        "keras": {"required": False}
    }

    results = {}
    for lib, config in libraries.items():
        module_name = config.get("module_name", lib)
        check_result = check_library(module_name)
        check_result["required"] = config["required"]
        results[lib] = check_result

    return results

def check_pip_availability():
    """pipが利用可能かチェックします"""
    try:
        subprocess.check_output([sys.executable, "-m", "pip", "--version"])
        return {"available": True}
    except:
        return {"available": False}

def read_requirements():
    """requirements.txtからパッケージリストを読み込む"""
    requirements = []
    req_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requirements.txt")

    try:
        with open(req_file_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    # バージョン指定を取得
                    match = re.match(r"([^<>=]+)([<>=]+)(.+)", line)
                    if match:
                        package_name = match.group(1).strip()
                        operator = match.group(2).strip()
                        required_version = match.group(3).strip()
                        requirements.append({
                            "name": package_name,
                            "required_version": required_version,
                            "operator": operator
                        })
                    else:
                        requirements.append({
                            "name": line,
                            "required_version": None,
                            "operator": None
                        })
    except FileNotFoundError:
        print(f"警告: requirements.txtが見つかりません: {req_file_path}")
        # 基本的な依存パッケージのリストをデフォルトとして使用
        default_packages = [
            "numpy", "opencv-python", "scikit-image", "pillow",
            "tensorflow", "matplotlib", "pytesseract"
        ]
        for pkg in default_packages:
            requirements.append({
                "name": pkg,
                "required_version": None,
                "operator": None
            })

    return requirements

def check_package(package_info):
    """パッケージのインストール状態とバージョンをチェックする"""
    package_name = package_info["name"]
    required_version = package_info["required_version"]
    operator = package_info["operator"]

    # 結果オブジェクトの初期化
    result = {
        "name": package_name,
        "is_installed": False,
        "installed_version": None,
        "required_version": required_version,
        "is_compatible": False,
        "message": ""
    }

    # まずimportlib.utilを使用してパッケージの有無を確認
    spec = importlib.util.find_spec(package_name)

    # パッケージ名の変換（opencv-pythonはcvとしてインポートされるなど）
    package_import_names = {
        "opencv-python": "cv2",
        "pillow": "PIL",
        "scikit-image": "skimage"
    }

    if not spec and package_name in package_import_names:
        spec = importlib.util.find_spec(package_import_names[package_name])

    if spec:
        result["is_installed"] = True

        # バージョン情報の取得を試みる
        try:
            # importlib.metadataを使用（Python 3.8以上）
            installed_version = importlib.metadata.version(package_name)
            result["installed_version"] = installed_version

            # バージョン要件のチェック
            if required_version:
                if operator == ">=":
                    is_compatible = version.parse(installed_version) >= version.parse(required_version)
                elif operator == "==":
                    is_compatible = version.parse(installed_version) == version.parse(required_version)
                elif operator == ">":
                    is_compatible = version.parse(installed_version) > version.parse(required_version)
                elif operator == "<":
                    is_compatible = version.parse(installed_version) < version.parse(required_version)
                elif operator == "<=":
                    is_compatible = version.parse(installed_version) <= version.parse(required_version)
                else:
                    is_compatible = True  # オペレータが不明な場合は互換性ありとする

                result["is_compatible"] = is_compatible

                if is_compatible:
                    result["message"] = f"パッケージ {package_name} バージョン {installed_version} は要件を満たしています"
                else:
                    result["message"] = f"パッケージ {package_name} バージョン {installed_version} は要件 {operator}{required_version} を満たしていません"
            else:
                # バージョン指定がない場合
                result["is_compatible"] = True
                result["message"] = f"パッケージ {package_name} がインストールされています (バージョン {installed_version})"
        except Exception as e:
            # バージョン取得に失敗した場合
            result["message"] = f"パッケージ {package_name} はインストールされていますが、バージョン情報を取得できませんでした: {str(e)}"
            result["is_compatible"] = True  # 一応互換性ありとする
    else:
        # パッケージがインストールされていない場合
        result["message"] = f"パッケージ {package_name} がインストールされていません"

    return result

def check_all_packages(requirements):
    """すべてのパッケージをチェックする"""
    for req in requirements:
        package_result = check_package(req)
        results["packages"].append(package_result)

        # カウンターを更新
        if package_result["is_installed"]:
            results["summary"]["installed_count"] += 1
            if not package_result["is_compatible"]:
                results["summary"]["incompatible_count"] += 1
        else:
            results["summary"]["missing_count"] += 1

def determine_overall_status():
    """システム全体の互換性ステータスを判定する"""
    # Pythonバージョンが互換性がない場合は失敗
    if not results["python_version"]["is_compatible"]:
        results["overall_status"] = "fail"
        return

    # 必須パッケージがない場合は失敗
    if results["summary"]["missing_count"] > 0:
        results["overall_status"] = "warning"

    # 互換性のないパッケージがある場合は警告
    if results["summary"]["incompatible_count"] > 0:
        results["overall_status"] = "warning"

    # すべてのチェックをパスした場合は成功
    if (results["summary"]["missing_count"] == 0 and
        results["summary"]["incompatible_count"] == 0):
        results["overall_status"] = "pass"

def print_human_readable_results():
    """人間が読みやすい形式で結果を出力する"""
    print("\n===== Python環境チェック結果 =====\n")

    # Pythonバージョン情報
    python_info = results["python_version"]
    print(f"Python バージョン: {python_info['version']}")
    print(f"ステータス: {'✅ OK' if python_info['is_compatible'] else '❌ 互換性なし'}")
    print(f"メッセージ: {python_info['message']}")

    print("\n----- パッケージのステータス -----\n")

    # パッケージ情報
    for pkg in results["packages"]:
        status = "✅ OK" if pkg["is_installed"] and pkg["is_compatible"] else "❌ 問題あり"
        print(f"{pkg['name']}: {status}")
        print(f"  インストール: {'はい' if pkg['is_installed'] else 'いいえ'}")
        if pkg["installed_version"]:
            print(f"  インストール済みバージョン: {pkg['installed_version']}")
        if pkg["required_version"]:
            print(f"  必要なバージョン: {pkg['required_version']}")
        print(f"  メッセージ: {pkg['message']}")
        print()

    # サマリー
    print("----- サマリー -----")
    print(f"インストール済みパッケージ: {results['summary']['installed_count']}")
    print(f"不足しているパッケージ: {results['summary']['missing_count']}")
    print(f"互換性のないパッケージ: {results['summary']['incompatible_count']}")
    print(f"全体のステータス: {results['overall_status']}")

    # 推奨アクション
    print("\n----- 推奨アクション -----")
    if results["overall_status"] == "pass":
        print("✅ 全ての要件を満たしています。特に対応は必要ありません。")
    elif results["overall_status"] == "warning":
        print("⚠️ いくつかの問題が見つかりました。python_installer.pyを実行して問題を解決してください。")
    else:
        print("❌ 重大な問題が見つかりました。Python 3.8以上をインストールし、python_installer.pyを実行してください。")

def main():
    """メイン関数: すべてのチェックを実行して結果を出力します"""
    result = {
        "system": platform.system(),
        "python": check_python_version(),
        "pip": check_pip_availability(),
        "libraries": check_image_processing_libs(),
        "script_path": os.path.abspath(__file__)
    }

    print(json.dumps(result, indent=2, ensure_ascii=False))

    # 必要なライブラリが不足している場合の警告
    missing_required = [
        lib for lib, info in result["libraries"].items()
        if info["required"] and not info.get("installed", False)
    ]

    if missing_required:
        print("\n警告: 以下の必要なライブラリがインストールされていません:")
        for lib in missing_required:
            print(f" - {lib}")
        print("\nこれらのライブラリをインストールするには以下のコマンドを実行してください:")
        print(f"{sys.executable} -m pip install " + " ".join(missing_required))
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())
