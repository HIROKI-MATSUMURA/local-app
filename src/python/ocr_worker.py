#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# GPU使用の完全無効化
import os
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_FORCE_CPU_ONLY"] = "1"

# PyTorchスレッド数の制限
import torch
torch.set_num_threads(1)

# EasyOCRインスタンスの再利用
global_reader = None

"""
OCR処理専用ワーカースクリプト
Windows環境でのエンコーディング問題を回避するため、
独立プロセスでEasyOCRを実行するためのスクリプト

使用方法:
  python ocr_worker.py [画像ファイルパス] [--options JSON形式オプション]
"""

import sys
import os
import io
import json
import traceback
import argparse
import time
import cv2

# 標準出力をUTF-8に強制設定
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='backslashreplace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='backslashreplace')

# Windows環境での警告抑制
if os.name == 'nt':
    import warnings
    warnings.filterwarnings("ignore", category=UnicodeWarning)

def get_reader(languages=['ja', 'en']):
    """EasyOCRのリーダーインスタンスを取得、または初期化"""
    global global_reader
    if global_reader is None:
        try:
            import easyocr
            global_reader = easyocr.Reader(languages, verbose=False, gpu=False)
        except Exception as e:
            raise Exception(f"OCRエンジンの初期化に失敗: {str(e)}")
    return global_reader

def easyocr_process(image_path, options=None):
    """EasyOCRを使用して画像からテキスト抽出"""
    start_time = time.time()
    
    # オプションがない場合は空辞書を設定
    if options is None:
        options = {}
    
    result = {
        "text": "",
        "textBlocks": [],
        "status": "not_processed"
    }
    
    # アウトプットキャプチャ用クラス
    class NullIO(io.StringIO):
        def write(self, txt):
            pass
    
    # 元の標準出力を保存しNullIOに置き換え
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    null_output = NullIO()
    sys.stdout = null_output
    sys.stderr = null_output
    
    try:
        # 画像読み込み
        image = cv2.imread(image_path)
        if image is None:
            # 標準出力を元に戻す
            sys.stdout = original_stdout
            sys.stderr = original_stderr
            
            result["status"] = "image_load_error"
            result["error"] = f"画像ファイルの読み込みに失敗しました: {image_path}"
            return result
        
        # OCRリーダーの取得
        try:
            # 言語設定（オプションから取得またはデフォルト）
            languages = options.get('languages', ['ja', 'en'])
            
            # OCR実行直前でPyTorchスレッド数を再設定（重要）
            import torch
            torch.set_num_threads(1)
            print(f"[WORKER] OCR実行前にPyTorchスレッド数を制限: {torch.get_num_threads()}スレッド", file=original_stderr, flush=True)
            
            # グローバルリーダーを取得
            reader = get_reader(languages)
        except ImportError as e:
            # 標準出力を元に戻す
            sys.stdout = original_stdout
            sys.stderr = original_stderr
            
            result["status"] = "import_error"
            result["error"] = f"EasyOCRモジュールのインポートに失敗: {str(e)}"
            return result
        except Exception as e:
            # 標準出力を元に戻す
            sys.stdout = original_stdout
            sys.stderr = original_stderr
            
            result["status"] = "init_error"
            result["error"] = f"OCRエンジンの初期化に失敗: {str(e)}"
            return result
        
        # テキスト認識の実行
        try:
            # 認識開始時間
            ocr_start_time = time.time()
            
            # OCR処理ステップごとの詳細ログ
            print(f"[WORKER] テキスト認識開始...", file=original_stderr, flush=True)
            
            # テキスト認識実行
            ocr_results = reader.readtext(image)
            
            # 認識終了時間と所要時間計算
            ocr_end_time = time.time()
            ocr_duration = ocr_end_time - ocr_start_time
            print(f"[WORKER] テキスト認識完了: 所要時間={ocr_duration:.2f}秒", file=original_stderr, flush=True)
        except Exception as e:
            # 標準出力を元に戻す
            sys.stdout = original_stdout
            sys.stderr = original_stderr
            
            result["status"] = "ocr_error"
            result["error"] = f"テキスト認識処理に失敗: {str(e)}"
            result["traceback"] = traceback.format_exc()
            return result
        
        # 標準出力を元に戻す
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        
        # 結果の検証
        if ocr_results is None:
            result["status"] = "no_result"
            result["error"] = "OCR処理が結果を返しませんでした"
            return result
        
        print(f"[WORKER] OCR結果検証中: 型={type(ocr_results).__name__}, 長さ={len(ocr_results) if isinstance(ocr_results, list) else 'N/A'}", file=sys.stderr, flush=True)
        
        if not isinstance(ocr_results, list):
            result["status"] = "invalid_result_type"
            result["error"] = f"OCR結果が不正な型です: {type(ocr_results).__name__}"
            return result
        
        if len(ocr_results) == 0:
            result["status"] = "no_text_detected"
            result["ocr_duration"] = ocr_duration
            return result
        
        # 認識結果の処理
        print(f"[WORKER] OCR結果の後処理開始: {len(ocr_results)}個の検出結果", file=sys.stderr, flush=True)
        full_text = []
        text_blocks = []
        
        for i, detection in enumerate(ocr_results):
            # 検出結果の構造確認
            if not isinstance(detection, (list, tuple)) or len(detection) < 3:
                continue
            
            # 各検出結果の処理開始
            print(f"[WORKER] 検出結果{i+1}の処理中...", file=sys.stderr, flush=True) if i < 3 else None
            
            bbox, text, confidence = detection
            
            # テキスト内容の確認
            if not text or not isinstance(text, str):
                continue
            
            text = text.strip()
            if not text:
                continue
            
            # 有効なテキストを追加
            full_text.append(text)
            
            # 境界ボックスの処理
            try:
                if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
                    # 座標計算
                    x_values = [point[0] for point in bbox]
                    y_values = [point[1] for point in bbox]
                    
                    x_min = min(x_values)
                    y_min = min(y_values)
                    x_max = max(x_values)
                    y_max = max(y_values)
                    
                    text_blocks.append({
                        "id": f"block_{i+1}",
                        "text": text,
                        "confidence": float(confidence),
                        "bounds": {
                            "x": int(x_min),
                            "y": int(y_min),
                            "width": int(x_max - x_min),
                            "height": int(y_max - y_min)
                        }
                    })
            except Exception:
                # 境界ボックス処理のエラーは無視して次へ
                pass
        
        print(f"[WORKER] 後処理完了: テキスト長={len(' '.join(full_text))}, ブロック数={len(text_blocks)}", file=sys.stderr, flush=True)
        
        # 最終結果の設定
        combined_text = " ".join(full_text)
        result["text"] = combined_text
        result["textBlocks"] = text_blocks
        result["ocr_duration"] = ocr_duration
        
        # ステータスの設定
        if not combined_text:
            result["status"] = "empty_text"
        else:
            result["status"] = "success"
        
        # 処理時間の記録
        end_time = time.time()
        result["processing_time"] = end_time - start_time
        
        print(f"[WORKER] OCR処理完了: 状態={result['status']}, 全体処理時間={result['processing_time']:.2f}秒", file=sys.stderr, flush=True)
        return result
        
    except Exception as e:
        # 予期せぬエラー時は標準出力を確実に戻す
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        
        result["status"] = "unexpected_error"
        result["error"] = f"予期せぬエラーが発生: {str(e)}"
        result["traceback"] = traceback.format_exc()
        return result

def main():
    """メイン処理"""
    # コマンドライン引数の解析
    parser = argparse.ArgumentParser(description='OCR処理ワーカー')
    parser.add_argument('image_path', help='OCR処理する画像ファイルのパス')
    parser.add_argument('--options', help='JSON形式のオプション', default='{}')
    args = parser.parse_args()
    
    # オプションのパース
    try:
        options = json.loads(args.options)
    except json.JSONDecodeError:
        options = {}
    
    # OCR処理の実行
    result = easyocr_process(args.image_path, options)
    
    # 結果をJSON形式で標準出力に出力
    json.dump(result, sys.stdout, ensure_ascii=False)
    return 0

if __name__ == "__main__":
    sys.exit(main()) 