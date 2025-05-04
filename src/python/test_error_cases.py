#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
エラーケースをテストするスクリプト
破損した画像や非対応形式の画像を使用してOCR処理のエラーを再現します
"""

import sys
import os
import json
import base64
import traceback
import logging
from datetime import datetime
import io
import cv2
import numpy as np

# ロギング設定
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f'error_test_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger('error_test')

# 標準エラー出力をUTF-8でログファイルに保存
stderr_log_path = os.path.join(log_dir, f'stderr_test_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
sys.stderr = open(stderr_log_path, "w", encoding="utf-8", errors="replace", buffering=1)
print(f"標準エラー出力をログファイルにリダイレクトしました: {stderr_log_path}", file=sys.stderr, flush=True)
print(f"Python実行環境: {sys.executable}", file=sys.stderr, flush=True)
print(f"カレントディレクトリ: {os.getcwd()}", file=sys.stderr, flush=True)

# image_analyzer.pyをインポート
try:
    import importlib.util
    script_dir = os.path.dirname(os.path.abspath(__file__))
    analyzer_path = os.path.join(script_dir, 'modules', 'image_analyzer.py')
    
    if not os.path.exists(analyzer_path):
        logger.error(f"image_analyzer.py が見つかりません: {analyzer_path}")
        print(f"image_analyzer.py が見つかりません: {analyzer_path}", file=sys.stderr, flush=True)
        sys.exit(1)
        
    spec = importlib.util.spec_from_file_location("image_analyzer", analyzer_path)
    image_analyzer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(image_analyzer)
    logger.info("image_analyzer モジュールが正常に読み込まれました")
    print("image_analyzer モジュールが正常に読み込まれました", file=sys.stderr, flush=True)
except Exception as e:
    logger.error(f"image_analyzer モジュールの読み込みに失敗: {e}")
    print(f"image_analyzer モジュールの読み込みに失敗: {e}", file=sys.stderr, flush=True)
    traceback.print_exc()
    sys.exit(1)

def create_corrupted_image(filename, content="This is not a valid image file"):
    """
    破損した画像ファイルを作成
    """
    try:
        with open(filename, 'w') as f:
            f.write(content)
        logger.info(f"破損した画像ファイルを作成しました: {filename}")
        print(f"破損した画像ファイルを作成しました: {filename}", file=sys.stderr, flush=True)
        return os.path.abspath(filename)
    except Exception as e:
        logger.error(f"破損ファイル作成エラー: {e}")
        print(f"破損ファイル作成エラー: {e}", file=sys.stderr, flush=True)
        return None

def read_corrupted_image(filename):
    """
    破損した画像を読み込む
    """
    try:
        logger.info(f"画像ファイルを読み込みます: {filename}")
        image = cv2.imread(filename)
        if image is None:
            logger.warning(f"画像読み込み失敗: {filename}")
            print(f"画像読み込み失敗: {filename}", file=sys.stderr, flush=True)
        return image
    except Exception as e:
        logger.error(f"画像読み込みエラー: {e}")
        print(f"画像読み込みエラー: {e}", file=sys.stderr, flush=True)
        return None

def create_random_noise_image(filename, width=300, height=200):
    """
    ランダムノイズの画像を作成
    """
    try:
        # ランダムノイズ画像を生成
        noise = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
        
        # 画像を保存
        cv2.imwrite(filename, noise)
        logger.info(f"ノイズ画像を作成しました: {filename}")
        print(f"ノイズ画像を作成しました: {filename}", file=sys.stderr, flush=True)
        return os.path.abspath(filename)
    except Exception as e:
        logger.error(f"ノイズ画像作成エラー: {e}")
        print(f"ノイズ画像作成エラー: {e}", file=sys.stderr, flush=True)
        return None

def file_to_base64(file_path):
    """
    ファイルをBase64エンコードする
    """
    try:
        with open(file_path, "rb") as file:
            encoded = base64.b64encode(file.read()).decode('utf-8')
            return encoded
    except Exception as e:
        logger.error(f"Base64エンコードエラー: {e}")
        print(f"Base64エンコードエラー: {e}", file=sys.stderr, flush=True)
        return None

def test_corrupted_image_ocr():
    """
    破損した画像でOCR処理をテストする
    """
    logger.info("===== 破損画像OCRテスト開始 =====")
    print("===== 破損画像OCRテスト開始 =====", file=sys.stderr, flush=True)
    
    # 破損画像を作成
    corrupted_file = create_corrupted_image("corrupted.jpg")
    if not corrupted_file:
        return
    
    try:
        # 画像読み込み
        image = read_corrupted_image(corrupted_file)
        
        # OCR処理
        if image is not None:
            logger.info("OCR処理を開始します")
            result = image_analyzer.extract_text_with_easyocr(image)
            logger.info(f"OCR結果: {result}")
        else:
            logger.warning("画像が読み込めないため、OCR処理をスキップします")
            
        # Base64エンコード処理
        base64_data = file_to_base64(corrupted_file)
        if base64_data:
            logger.info("Base64エンコードした画像でテキスト抽出を試行")
            result = image_analyzer.extract_text(base64_data)
            logger.info(f"テキスト抽出結果: {result}")
    except Exception as e:
        logger.error(f"OCRテストエラー: {e}")
        print(f"OCRテストエラー: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
    finally:
        # クリーンアップ
        try:
            if os.path.exists(corrupted_file):
                os.remove(corrupted_file)
        except:
            pass
            
    logger.info("===== 破損画像OCRテスト終了 =====")
    print("===== 破損画像OCRテスト終了 =====", file=sys.stderr, flush=True)

def test_noise_image_ocr():
    """
    ノイズ画像でOCR処理をテストする
    """
    logger.info("===== ノイズ画像OCRテスト開始 =====")
    print("===== ノイズ画像OCRテスト開始 =====", file=sys.stderr, flush=True)
    
    # ノイズ画像を作成
    noise_file = create_random_noise_image("noise.jpg")
    if not noise_file:
        return
    
    try:
        # 画像読み込み
        image = cv2.imread(noise_file)
        
        # OCR処理
        if image is not None:
            logger.info("OCR処理を開始します")
            result = image_analyzer.extract_text_with_easyocr(image)
            logger.info(f"OCR結果: {result}")
        else:
            logger.warning("画像が読み込めないため、OCR処理をスキップします")
    except Exception as e:
        logger.error(f"ノイズ画像OCRテストエラー: {e}")
        print(f"ノイズ画像OCRテストエラー: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
    finally:
        # クリーンアップ
        try:
            if os.path.exists(noise_file):
                os.remove(noise_file)
        except:
            pass
            
    logger.info("===== ノイズ画像OCRテスト終了 =====")
    print("===== ノイズ画像OCRテスト終了 =====", file=sys.stderr, flush=True)

def test_all_error_cases():
    """すべてのエラーケースをテストする"""
    logger.info("========== エラーケーステスト開始 ==========")
    print("========== エラーケーステスト開始 ==========", file=sys.stderr, flush=True)
    
    # 破損画像テスト
    test_corrupted_image_ocr()
    
    # ノイズ画像テスト
    test_noise_image_ocr()
    
    logger.info("========== エラーケーステスト終了 ==========")
    print("========== エラーケーステスト終了 ==========", file=sys.stderr, flush=True)

if __name__ == "__main__":
    try:
        print("エラーケーステスト開始", file=sys.stdout)
        print("エラーケーステスト開始", file=sys.stderr, flush=True)
        test_all_error_cases()
    except Exception as e:
        logger.error(f"テスト実行中にエラーが発生: {e}")
        print(f"テスト実行中にエラーが発生: {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
    finally:
        # 標準エラー出力のクローズ
        if hasattr(sys.stderr, 'close'):
            sys.stderr.close() 