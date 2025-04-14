#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Python Server for Image Analysis
ElectronアプリケーションのJavaScriptからリクエストを受け取り、
image_analyzer.pyにある画像処理機能を呼び出して結果を返します。
"""

import sys
import os
import json
import uuid
import base64
import traceback
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
import importlib.util
import time
import threading
import cv2
import argparse
import requests  # APIリクエスト用
import hashlib
import numpy as np
from contextlib import redirect_stdout
import io
import gc  # ガベージコレクション
import psutil  # メモリ監視

# ロギング設定
# ログディレクトリを作成
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)

# 現在時刻でログファイル名を作成
log_file = os.path.join(log_dir, f'python_server_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),  # ファイルにログを出力
        logging.StreamHandler(sys.stderr)  # 標準エラー出力にログを出力
    ]
)

# ロガー作成
logger = logging.getLogger('python_server')
logger.info(f"ログファイルを作成しました: {log_file}")

# グローバル変数
image_analyzer = None  # 画像解析モジュールのインスタンス
memory_reporter = None  # メモリレポーター
watchdog = None  # プロセスウォッチドッグ

# 実行ディレクトリをスクリプトのある場所に変更
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

# メモリ使用量をログに記録
def log_memory_usage():
    """現在のメモリ使用量をログに記録"""
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    memory_mb = memory_info.rss / 1024 / 1024
    logger.info(f"メモリ使用量: {memory_mb:.2f} MB")
    return memory_mb

# メモリ使用量に応じた機能制限レベル
class MemoryMode:
    NORMAL = 0      # 通常モード: すべての機能が有効
    CONSERVATIVE = 1  # 保守モード: 一部の高負荷機能を制限
    MINIMAL = 2     # 最小モード: 基本機能のみ有効、解析精度を犠牲に速度優先

# 現在のメモリモード
current_memory_mode = MemoryMode.NORMAL

def check_memory_status():
    """メモリ使用状況に応じて動的に機能制限モードを調整"""
    global current_memory_mode

    memory_mb = log_memory_usage()

    # メモリ使用量のしきい値
    CONSERVATIVE_THRESHOLD = 350  # 350MB
    MINIMAL_THRESHOLD = 450       # 450MB

    # メモリ使用量に基づいてモードを決定
    previous_mode = current_memory_mode

    if memory_mb > MINIMAL_THRESHOLD:
        new_mode = MemoryMode.MINIMAL
    elif memory_mb > CONSERVATIVE_THRESHOLD:
        new_mode = MemoryMode.CONSERVATIVE
    else:
        new_mode = MemoryMode.NORMAL

    # モードが変更された場合はログに記録
    if new_mode != previous_mode:
        current_memory_mode = new_mode
        mode_names = {
            MemoryMode.NORMAL: "通常",
            MemoryMode.CONSERVATIVE: "保守",
            MemoryMode.MINIMAL: "最小"
        }
        logger.info(f"メモリモードを変更: {mode_names[previous_mode]} → {mode_names[new_mode]} (現在のメモリ: {memory_mb:.2f} MB)")

        # 積極的なメモリ解放を試みる
        if new_mode > previous_mode:
            gc.collect()

    return current_memory_mode

def get_options_for_memory_mode(options, feature_type):
    """現在のメモリモードに応じてオプションを調整"""
    mode = check_memory_status()

    # オプションのコピーを作成
    adjusted_options = {**options}

    if mode == MemoryMode.NORMAL:
        # 通常モード: オプションをそのまま使用
        return adjusted_options

    elif mode == MemoryMode.CONSERVATIVE:
        # 保守モード: 一部の高負荷オプションを制限
        if feature_type in ['text', 'elements']:
            # テキスト認識や要素検出の精度を下げる
            adjusted_options['quality'] = 'medium'
            adjusted_options['max_size'] = 1024  # 画像サイズ制限

        if feature_type == 'color':
            # 色抽出の詳細度を下げる
            adjusted_options['max_colors'] = min(adjusted_options.get('max_colors', 16), 8)

        logger.info(f"保守モード: {feature_type}の処理オプションを調整しました")

    elif mode == MemoryMode.MINIMAL:
        # 最小モード: 基本機能のみ、高速・低メモリ優先
        if feature_type in ['text', 'elements']:
            adjusted_options['quality'] = 'low'
            adjusted_options['max_size'] = 800  # さらに小さく
            adjusted_options['fast_mode'] = True

        if feature_type == 'color':
            adjusted_options['max_colors'] = min(adjusted_options.get('max_colors', 16), 5)
            adjusted_options['simple_algorithm'] = True

        logger.info(f"最小モード: {feature_type}の処理を最小限に制限しました")

    return adjusted_options

def setup_memory_management():
    """メモリ管理のセットアップを行う"""
    # GCの設定を調整
    gc.enable()
    # より積極的なGCを設定
    gc.set_threshold(100, 5, 5)  # デフォルトよりも頻繁にGCを実行

    # TensorFlowとOpenCVの設定
    setup_tensorflow_memory_management()
    optimize_image_libraries()

    # 初期メモリ状況を記録
    log_memory_usage()

    logger.info("メモリ管理の初期化が完了しました")

def setup_tensorflow_memory_management():
    """TensorFlowのメモリ使用量を最適化"""
    try:
        import tensorflow as tf

        # TensorFlowのメモリ使用量を制限
        gpus = tf.config.experimental.list_physical_devices('GPU')
        if gpus:
            # GPU使用時のメモリ制限
            for gpu in gpus:
                try:
                    # メモリ成長を有効化（必要に応じて確保）
                    tf.config.experimental.set_memory_growth(gpu, True)

                    # さらに明示的なメモリ制限を設定（1GB制限）
                    tf.config.experimental.set_virtual_device_configuration(
                        gpu,
                        [tf.config.experimental.VirtualDeviceConfiguration(memory_limit=1024)]
                    )
                    logger.info(f"GPU {gpu} のメモリ制限を設定しました (1024MB)")
                except RuntimeError as e:
                    logger.warning(f"GPU {gpu} の設定中にエラー: {str(e)}")
        else:
            logger.info("GPUが検出されませんでした。CPU処理モードで動作します。")

        # CPU使用時のスレッド数制限
        tf.config.threading.set_intra_op_parallelism_threads(2)
        tf.config.threading.set_inter_op_parallelism_threads(2)

        # メモリ使用量の厳格な制限を適用
        # (実験的機能、TensorFlowのバージョンによっては利用できない場合があります)
        try:
            if hasattr(tf.config.experimental, 'set_jit_xla_optimization_disabled'):
                tf.config.experimental.set_jit_xla_optimization_disabled(True)
            # キャッシュサイズを制限
            if hasattr(tf.config.optimizer, 'set_jit'):
                tf.config.optimizer.set_jit(False)  # JIT（Just-In-Time）コンパイルを無効化
            logger.info("TensorFlow追加メモリ最適化を適用しました")
        except Exception as e:
            logger.warning(f"TensorFlow追加設定エラー（無視可能）: {str(e)}")

        # TensorFlowのログレベルを設定
        tf.get_logger().setLevel('ERROR')

        logger.info("TensorFlowのメモリ設定を最適化しました")
    except ImportError:
        logger.warning("TensorFlowが見つかりません")
    except Exception as e:
        logger.error(f"TensorFlowのメモリ設定中にエラー: {str(e)}")

def optimize_image_libraries():
    """画像処理ライブラリのメモリ使用を最適化"""
    # OpenCVのメモリ使用を最適化
    try:
        # OpenCVのキャッシュサイズを制限（メガバイト単位）
        cv2.setUseOptimized(True)
        cv2.setNumThreads(2)  # スレッド数を制限
        logger.info("OpenCVの設定を最適化しました")
    except Exception as e:
        logger.error(f"OpenCVの最適化中にエラー: {str(e)}")

    # PILのメモリ使用を最適化
    try:
        from PIL import Image, ImageFile

        # 不完全な画像の読み込みを許可
        ImageFile.LOAD_TRUNCATED_IMAGES = True

        # キャッシュサイズの制限
        Image.MAX_IMAGE_PIXELS = 100000000  # 1億ピクセルまで許可（デフォルトよりも小さい）
        logger.info("PILの設定を最適化しました")
    except Exception as e:
        logger.error(f"PILの最適化中にエラー: {str(e)}")

def initialize_image_analyzer():
    """画像解析モジュールを初期化する"""
    global image_analyzer

    try:
        # 画像解析モジュールのパスを特定
        script_dir = os.path.dirname(os.path.abspath(__file__))
        analyzer_path = os.path.join(script_dir, 'image_analyzer.py')

        if not os.path.exists(analyzer_path):
            logger.error(f"image_analyzer.py が見つかりません: {analyzer_path}")
            return False

        # モジュールを動的にインポート
        spec = importlib.util.spec_from_file_location("image_analyzer", analyzer_path)
        image_analyzer_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(image_analyzer_module)

        # モジュールをグローバル変数に設定
        image_analyzer = image_analyzer_module

        logger.info("image_analyzer モジュールが正常に初期化されました")
        return True

    except Exception as e:
        logger.error(f"画像解析モジュールの初期化中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        return False

def read_request() -> Optional[Dict[str, Any]]:
    """標準入力からJSONリクエストを読み取る"""
    try:
        line = sys.stdin.readline()
        if not line:
            return None

        return json.loads(line)

    except json.JSONDecodeError as e:
        logger.error(f"JSONデコードエラー: {str(e)}")
        return None

    except Exception as e:
        logger.error(f"リクエスト読み取り中にエラーが発生しました: {str(e)}")
        return None

def send_response(request_id: str, result: Any = None, error: str = None):
    """JSONレスポンスを標準出力に送信する"""
    response = {
        "id": request_id,
        "result": result,
        "error": error
    }

    # 関数開始時の詳細なデバッグログを追加
    logger.debug(f"===== send_response開始 =====")
    logger.debug(f"リクエストID: {request_id}")
    logger.debug(f"レスポンスタイプ: {'成功' if error is None else 'エラー'}")
    logger.debug(f"結果データタイプ: {type(result).__name__ if result is not None else 'None'}")

    try:
        # データの概要をログに記録
        if result is not None:
            if isinstance(result, dict):
                logger.info(f"Python→JS送信データ構造: キー={list(result.keys())}")

                # 画像解析結果データの構造をさらに詳細に検証
                if 'colors' in result:
                    if isinstance(result['colors'], list):
                        logger.info(f"Python→JS送信色情報: {len(result['colors'])}色")
                        for i, color in enumerate(result['colors'][:3]):  # 最初の3色だけ表示
                            if isinstance(color, dict):
                                logger.info(f"色{i+1}: {color.get('hex', 'なし')} ({color.get('role', 'なし')})")
                    else:
                        logger.warning(f"警告: colors値が配列ではありません: {type(result['colors']).__name__}")

                if 'text' in result:
                    if isinstance(result['text'], str):
                        logger.info(f"Python→JS送信テキスト: '{result['text'][:50]}...'" if len(result['text']) > 50 else result['text'])
                    else:
                        logger.warning(f"警告: textデータが文字列ではありません: {type(result['text']).__name__}")

                if 'textBlocks' in result:
                    if isinstance(result['textBlocks'], list):
                        logger.info(f"Python→JS送信テキストブロック: {len(result['textBlocks'])}個")
                        if len(result['textBlocks']) > 0:
                            logger.info(f"最初のブロック: {result['textBlocks'][0]}")
                    else:
                        logger.warning(f"警告: textBlocksデータが配列ではありません: {type(result['textBlocks']).__name__}")

                # analyze_all応答の詳細ログ
                if 'colors' in result and 'text' in result and 'textBlocks' in result:
                    logger.info(f"Python→JS送信analyze_all応答検証: colors={len(result['colors'])}, text長={len(result['text']) if isinstance(result['text'], str) else 'N/A'}, textBlocks={len(result['textBlocks']) if isinstance(result['textBlocks'], list) else 'N/A'}")

                # データの完全性検証とフォールバック
                logger.info(f"Python→JS送信データの完全性検証:")

                # 各主要プロパティのチェックと必要に応じて修正
                if 'colors' in result and not isinstance(result['colors'], list):
                    logger.warning(f"警告: colorsデータを配列に変換します: {type(result['colors']).__name__} → list")
                    result['colors'] = []

                if 'text' in result:
                    if not isinstance(result['text'], str):
                        logger.warning(f"警告: textデータを文字列に変換します: {type(result['text']).__name__} → str")
                        result['text'] = str(result['text'])

                if 'textBlocks' in result and not isinstance(result['textBlocks'], list):
                    logger.warning(f"警告: textBlocksデータを配列に変換します: {type(result['textBlocks']).__name__} → list")
                    result['textBlocks'] = []

                if 'elements' in result and not isinstance(result['elements'], list):
                    logger.warning(f"警告: elementsデータを配列に変換します: {type(result['elements']).__name__} → list")
                    if isinstance(result['elements'], dict) and 'elements' in result['elements']:
                        result['elements'] = result['elements']['elements']
                    else:
                        result['elements'] = []

                if 'sections' in result and not isinstance(result['sections'], list):
                    logger.warning(f"警告: sectionsデータを配列に変換します: {type(result['sections']).__name__} → list")
                    if isinstance(result['sections'], dict) and 'sections' in result['sections']:
                        result['sections'] = result['sections']['sections']
                    else:
                        result['sections'] = []

            # 配列の場合は色情報として処理（extract_colorsの直接返り値対応）
            elif isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
                logger.info(f"Python→JS送信データ構造: 配列（要素数={len(result)}）")
                # 配列が色情報である可能性をチェック（最初の要素にhexキーがあるか）
                if 'hex' in result[0] or 'rgb' in result[0]:
                    logger.info(f"Python→JS送信色情報: {len(result)}色")
                    for i, color in enumerate(result[:3]):  # 最初の3色だけ表示
                        logger.info(f"色{i+1}: {color.get('hex', 'なし')} ({color.get('role', 'なし')})")

                # API応答の場合は配列のままreturnするが、colorsの場合はオブジェクトに変換する可能性
                # extract_colors_from_imageの直接の呼び出し結果への対応
                if 'hex' in result[0] and request_id.startswith('analyze_'):
                    logger.info(f"色情報データを構造化: 配列→オブジェクト変換")
                    result = {"colors": result}

            # データサイズの記録
            try:
                json_string = json.dumps(result)
                json_size = len(json_string)
                logger.debug(f"結果データサイズ: 約{json_size/1024:.2f}KB")
                # 大きなJSONの場合はプレビューを出力
                if json_size > 10000:  # 10KB以上の場合
                    logger.debug(f"大きなJSONデータのプレビュー: {json_string[:500]}...")
            except Exception as size_err:
                logger.debug(f"データサイズ計算エラー: {str(size_err)}")

        # 送信前の最終確認
        logger.info(f"Python→JS送信直前: request_id={request_id}, 成功={error is None}")

        # 最終的なレスポンス構造のチェック
        try:
            response_keys = list(response.keys())
            logger.info(f"最終レスポンス構造: {response_keys}")

            # 結果データがdictでキーを持つ場合
            if isinstance(response['result'], dict):
                result_keys = list(response['result'].keys())
                logger.info(f"結果データのキー: {result_keys}")

            # リクエストIDに基づいてコマンドタイプをログに出力
            if 'analyze_all' in request_id:
                logger.info(f"analyze_all応答の送信確認: 構造={response_keys}, resultのキー={list(response['result'].keys()) if isinstance(response['result'], dict) else 'dict以外'}")
        except Exception as check_err:
            logger.error(f"レスポンス確認エラー: {str(check_err)}")

        # JSONをシリアライズして標準出力に送信
        json_response = json.dumps(response)
        logger.debug(f"JSONシリアライズ成功: {len(json_response)}バイト")
        print(json_response + '\n', flush=True)
        logger.debug(f"標準出力への書き込み完了")

    except Exception as e:
        logger.error(f"レスポンス送信中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())  # スタックトレースを追加
        # 緊急フォールバックとしてエラーレスポンスを送信
        fallback_response = {
            "id": request_id,
            "result": None,
            "error": f"レスポンス送信エラー: {str(e)}"
        }
        print(json.dumps(fallback_response), flush=True)
    finally:
        logger.debug(f"===== send_response終了 =====")

def handle_check_environment(request_id: str, params: Dict[str, Any]):
    """Pythonサーバー環境が正常に動作しているか確認する"""
    try:
        # モジュール依存関係のチェック
        missing_modules = []

        for module_name in ["numpy", "cv2", "PIL"]:
            try:
                importlib.import_module(module_name)
            except ImportError:
                missing_modules.append(module_name)

        # 画像解析モジュールの状態をチェック
        analyzer_status = "正常" if image_analyzer else "未初期化"

        result = {
            "status": "ok" if not missing_modules and analyzer_status == "正常" else "error",
            "python_version": sys.version,
            "missing_modules": missing_modules,
            "analyzer_status": analyzer_status,
            "timestamp": datetime.now().isoformat()
        }

        send_response(request_id, result)

    except Exception as e:
        logger.error(f"環境チェック中にエラーが発生しました: {str(e)}")
        send_response(request_id, None, f"環境チェックエラー: {str(e)}")

def handle_setup_environment(request_id: str, params: Dict[str, Any]):
    """Pythonサーバー環境をセットアップする"""
    try:
        # 必要に応じて依存関係のインストールを含むセットアップ作業
        # （実際のデプロイメントでは、このロジックはセキュリティを考慮して調整が必要）

        # 画像解析モジュールを初期化
        init_success = initialize_image_analyzer()

        result = {
            "status": "ok" if init_success else "error",
            "timestamp": datetime.now().isoformat()
        }

        send_response(request_id, result)

    except Exception as e:
        logger.error(f"環境セットアップ中にエラーが発生しました: {str(e)}")
        send_response(request_id, None, f"環境セットアップエラー: {str(e)}")

def base64_to_image_data(image_data_base64: str) -> Tuple[Any, str]:
    """Base64形式の画像データをOpenCVのイメージオブジェクトに変換する"""
    try:
        # Base64部分だけを抽出
        if ',' in image_data_base64:
            header, image_data_base64 = image_data_base64.split(',', 1)

        # Base64形式から画像データに変換
        image_data = base64.b64decode(image_data_base64)

        # 画像データの形式を特定
        format_type = 'jpeg'  # デフォルト
        if image_data_base64.startswith('/9j/'):
            format_type = 'jpeg'
        elif image_data_base64.startswith('iVBORw0K'):
            format_type = 'png'
        elif image_data_base64.startswith('R0lGOD'):
            format_type = 'gif'
        elif image_data_base64.startswith('Qk0'):
            format_type = 'bmp'

        # バイナリデータからOpenCVの形式に変換
        nparr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise ValueError("画像のデコードに失敗しました")

        return image, format_type
    except Exception as e:
        logger.error(f"Base64画像データの変換中にエラーが発生しました: {str(e)}")
        raise

def handle_extract_colors(request_id: str, params: Dict[str, Any]):
    """画像から主要な色を抽出する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data = None
        # 複数の可能なキー名をチェック
        for key in ['image_data', 'imageData', 'image']:
            if key in params and params[key]:
                image_data = params[key]
                logger.info(f"受信パラメータのキー: {list(params.keys())}")
                logger.info(f"画像データ形式: {type(image_data).__name__}")
                logger.info(f"画像データサイズ: {len(image_data) if isinstance(image_data, str) else 'N/A'}")
                logger.info(f"画像データプレビュー: {image_data[:50]}..." if isinstance(image_data, str) and len(image_data) > 50 else 'N/A')
                break

        options = params.get('options', {})

        if not image_data:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data)

        # image_analyzer.pyのextract_colors_from_image関数を呼び出す
        # オプションのimageを除外して衝突回避
        if 'image' in options:
            logger.warning("[debug] options に 'image' が含まれているため除去します")
            options.pop('image')

        colors = image_analyzer.extract_colors_from_image(image=image, **options)

        # 抽出結果のデータ型と構造を詳細に検証
        logger.info(f"色抽出結果（生データ）: {len(colors)}色")
        logger.info(f"色抽出結果データ型: {type(colors).__name__}")

        if len(colors) > 0:
            logger.info(f"最初の色データ構造: {type(colors[0]).__name__}")
            if isinstance(colors[0], dict):
                logger.info(f"最初の色データキー: {list(colors[0].keys())}")
                logger.info(f"最初の色データ値: hex={colors[0].get('hex', 'なし')}, rgb={colors[0].get('rgb', 'なし')}")

        # JavaScriptに返す際のデータ構造を修正（colors配列をcolorsプロパティの値とする）
        logger.debug(f"色抽出結果をJSに適した形式に変換: {len(colors)}色 → colors辞書プロパティ")
        result = {"colors": colors}

        send_response(request_id, result)

    except Exception as e:
        logger.error(f"色抽出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"色抽出エラー: {str(e)}")

def handle_extract_text(request_id: str, params: Dict[str, Any]):
    """画像からテキストを抽出する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        logger.info(f"テキスト抽出リクエスト受信: {request_id}")

        # パラメータを取得
        image_data = None
        # 複数の可能なキー名をチェック
        for key in ['image_data', 'imageData', 'image']:
            if key in params and params[key]:
                image_data = params[key]
                logger.info(f"受信パラメータのキー: {list(params.keys())}")
                logger.info(f"画像データ形式: {type(image_data).__name__}")
                logger.info(f"画像データサイズ: {len(image_data) if isinstance(image_data, str) else 'N/A'}")
                logger.info(f"画像データプレビュー: {image_data[:50]}..." if isinstance(image_data, str) and len(image_data) > 50 else 'N/A')
                break

        options = params.get('options', {})

        if not image_data:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data)

        # image_analyzer.pyのextract_text_from_image関数を呼び出す
        # オプションのimageを除外して衝突回避
        if 'image' in options:
            logger.warning("[debug] options に 'image' が含まれているため除去します")
            options.pop('image')

        text_result = image_analyzer.extract_text_from_image(image=image, **options)

        # 抽出結果のデータ型と構造を詳細に検証
        logger.info(f"テキスト抽出結果（生データ）: {type(text_result).__name__}")

        if isinstance(text_result, dict):
            logger.info(f"テキスト結果キー: {list(text_result.keys())}")

            if 'text' in text_result:
                logger.info(f"抽出テキスト: '{text_result['text']}'")

            if 'textBlocks' in text_result:
                logger.info(f"テキストブロック数: {len(text_result['textBlocks'])}")
                if len(text_result['textBlocks']) > 0:
                    logger.info(f"最初のブロック構造: {type(text_result['textBlocks'][0]).__name__}")
                    if isinstance(text_result['textBlocks'][0], dict):
                        logger.info(f"最初のブロックキー: {list(text_result['textBlocks'][0].keys())}")
                        logger.info(f"最初のブロックテキスト: '{text_result['textBlocks'][0].get('text', 'なし')}'")

        # 必要なキーが存在することを確認
        if isinstance(text_result, dict):
            if 'text' not in text_result:
                logger.warning("'text'キーがありません。追加します。")
                text_result['text'] = ""
            if 'textBlocks' not in text_result:
                logger.warning("'textBlocks'キーがありません。追加します。")
                text_result['textBlocks'] = []
        else:
            logger.warning("テキスト結果が辞書ではありません。整形します。")
            if isinstance(text_result, str):
                text_result = {'text': text_result, 'textBlocks': []}
            else:
                text_result = {'text': "", 'textBlocks': []}

        send_response(request_id, text_result)

    except Exception as e:
        logger.error(f"テキスト抽出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, {'text': '', 'textBlocks': [], 'error': str(e)}, f"テキスト抽出エラー: {str(e)}")

def handle_analyze_sections(request_id: str, params: Dict[str, Any]):
    """画像のセクションを分析する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data_base64 = params.get('image_data', '')
        options = params.get('options', {})

        if not image_data_base64:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data_base64)

        # image_analyzer.pyのanalyze_sections関数を呼び出す
        # オプションのimageを除外して衝突回避
        if 'image' in options:
            logger.warning("[debug] options に 'image' が含まれているため除去します")
            options.pop('image')

        sections = image_analyzer.analyze_image_sections(image=image, **options)

        send_response(request_id, sections)

    except Exception as e:
        logger.error(f"セクション分析中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"セクション分析エラー: {str(e)}")

def handle_analyze_layout(request_id: str, params: Dict[str, Any]):
    """画像のレイアウトパターンを分析する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data_base64 = params.get('image_data', '')
        options = params.get('options', {})

        if not image_data_base64:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data_base64)

        # image_analyzer.pyのanalyze_layout_pattern関数を呼び出す
        # オプションのimageを除外して衝突回避
        if 'image' in options:
            logger.warning("[debug] options に 'image' が含まれているため除去します")
            options.pop('image')

        layout = image_analyzer.analyze_layout_pattern(image=image, **options)

        send_response(request_id, layout)

    except Exception as e:
        logger.error(f"レイアウト分析中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"レイアウト分析エラー: {str(e)}")

def handle_detect_main_sections(request_id: str, params: Dict[str, Any]):
    """画像のメインセクションを検出する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data_base64 = params.get('image_data', '')
        options = params.get('options', {})

        if not image_data_base64:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data_base64)

        # オプションのimageを除外して衝突回避
        if 'image' in options:
            logger.warning("[debug] options に 'image' が含まれているため除去します")
            options.pop('image')

        # image_analyzer.pyのdetect_main_sections関数を呼び出す
        sections = image_analyzer.detect_main_sections(image=image, **options)

        send_response(request_id, sections)

    except Exception as e:
        logger.error(f"メインセクション検出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"メインセクション検出エラー: {str(e)}")

def handle_detect_card_elements(request_id: str, params: Dict[str, Any]):
    """画像からカード要素を検出する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data_base64 = params.get('image_data', '')
        options = params.get('options', {})

        if not image_data_base64:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data_base64)

        # image_analyzer.pyのdetect_card_elements関数を呼び出す
        # オプションのimageを除外して衝突回避
        if 'image' in options:
            logger.warning("[debug] options に 'image' が含まれているため除去します")
            options.pop('image')

        cards = image_analyzer.detect_card_elements(image=image, **options)

        send_response(request_id, cards)

    except Exception as e:
        logger.error(f"カード要素検出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"カード要素検出エラー: {str(e)}")

def handle_detect_elements(request_id: str, params: Dict[str, Any]):
    """画像から特徴的な要素を検出する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data_base64 = params.get('image_data', '')
        options = params.get('options', {})

        if not image_data_base64:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data_base64)

        # image_analyzer.pyのdetect_feature_elements関数を呼び出す
        # オプションのimageを除外して衝突回避
        if 'image' in options:
            logger.warning("[debug] options に 'image' が含まれているため除去します")
            options.pop('image')

        elements = image_analyzer.detect_feature_elements(image=image, **options)

        send_response(request_id, elements)

    except Exception as e:
        logger.error(f"特徴的要素検出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"特徴的要素検出エラー: {str(e)}")

def clean_options(options):
    """imageキーを除去した安全なoptionsを返す"""
    return {k: v for k, v in options.items() if k != 'image'}

def analyze_all(image, options):
    """画像の総合分析を行う内部関数"""
    colors = []
    text_content = ''
    text_blocks = []
    sections = {'sections': []}
    layout = {"width": 1200, "height": 800, "type": "standard"}
    elements = {"elements": []}

    # メモリモードを確認
    memory_mode = check_memory_status()

    try:
        # 色抽出（メモリモードに応じて調整）
        color_options = get_options_for_memory_mode(clean_options(options), 'color')
        colors = image_analyzer.extract_colors_from_image(image=image, **color_options)
        # 中間オブジェクトの明示的解放
        gc.collect()
    except Exception as e:
        logger.error(f"[debug] 色抽出失敗: {str(e)}")

    try:
        # メモリモードが最小の場合、テキスト抽出を簡略化
        if memory_mode == MemoryMode.MINIMAL:
            # 簡易テキスト抽出（最小限の処理）
            logger.info("最小メモリモード: テキスト抽出を簡略化します")
            text_content = "Memory conservation mode - text extraction limited"
            text_blocks = []
        else:
            # 通常のテキスト抽出
            text_options = get_options_for_memory_mode(clean_options(options), 'text')
            text_result = image_analyzer.extract_text_from_image(image=image, **text_options)
            if isinstance(text_result, dict):
                text_content = text_result.get('text', '')
                text_blocks = text_result.get('textBlocks', [])

        # 中間オブジェクトの明示的解放
        if 'temp_image' in locals():
            del temp_image
        gc.collect()
    except Exception as e:
        logger.error(f"[debug] テキスト抽出失敗: {str(e)}")

    try:
        # メモリモードに応じてセクション分析を調整
        if memory_mode < MemoryMode.MINIMAL:
            section_options = get_options_for_memory_mode(clean_options(options), 'sections')
            sections = image_analyzer.analyze_image_sections(image=image, **section_options)
            if not isinstance(sections, dict):
                sections = {'sections': []}
        else:
            # 最小モードではセクション分析をスキップ
            logger.info("最小メモリモード: セクション分析をスキップします")
            sections = {'sections': []}

        # 中間オブジェクトの明示的解放
        gc.collect()
    except Exception as e:
        logger.error(f"[debug] セクション抽出失敗: {str(e)}")

    try:
        # レイアウト分析は比較的軽量なので、すべてのモードで実行
        layout_options = get_options_for_memory_mode(clean_options(options), 'layout')
        layout = image_analyzer.analyze_layout_pattern(image=image, **layout_options)
        if not isinstance(layout, dict):
            layout = {"width": 1200, "height": 800, "type": "standard"}
        # 中間オブジェクトの明示的解放
        gc.collect()
    except Exception as e:
        logger.error(f"[debug] レイアウト解析失敗: {str(e)}")

    try:
        # 要素検出（メモリモードに応じて調整）
        if memory_mode < MemoryMode.MINIMAL:
            element_options = get_options_for_memory_mode(clean_options(options), 'elements')
            elements = image_analyzer.detect_feature_elements(image=image, **element_options)
            if isinstance(elements, list):
                elements = {"elements": elements}
            elif not isinstance(elements, dict):
                elements = {"elements": []}
        else:
            # 最小モードでは要素検出をスキップ
            logger.info("最小メモリモード: 要素検出をスキップします")
            elements = {"elements": []}

        # 中間オブジェクトの明示的解放
        gc.collect()
    except Exception as e:
        logger.error(f"[debug] 要素検出失敗: {str(e)}")

    # メモリ使用状況を記録
    memory_status = "normal"
    if memory_mode == MemoryMode.CONSERVATIVE:
        memory_status = "conservative"
    elif memory_mode == MemoryMode.MINIMAL:
        memory_status = "minimal"

    return {
        "colors": colors,
        "text": text_content,
        "textBlocks": text_blocks,
        "sections": sections.get("sections", []),
        "layout": layout,
        "elements": elements.get("elements", []),
        "timestamp": datetime.now().isoformat(),
        "status": "success",
        "memory_mode": memory_status
    }

def handle_analyze_all(request_id, params):
    """すべての画像解析処理を一括で行う"""
    try:
        # 処理前にガベージコレクションを実行
        gc.collect()

        # メモリ使用量をロギング
        log_memory_usage()

        # ウォッチドッグに活動を通知
        if watchdog:
            watchdog.update()

        # 元のコード...
        logger.info(f"analyze_allリクエスト受信 (ID: {request_id[:8] if len(request_id) > 8 else request_id})")

        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        logger.info(f"[debug] 受信データ構造: キー={list(params.keys())}")
        image_data = None
        for key in ['image', 'image_data', 'imageData']:
            if key in params and params[key]:
                image_data = params[key]
                logger.info(f"[debug] 画像データを'{key}'キーから取得")
                break

        options = params.get('options', {})

        if not image_data:
            logger.warning("[debug] 画像データが提供されていません - 空の結果を返します")
            empty_result = {
                "colors": [],
                "text": "",
                "textBlocks": [],
                "sections": [],
                "layout": {"width": 1200, "height": 800, "type": "standard"},
                "elements": [],
                "timestamp": datetime.now().isoformat(),
                "status": "no_image"
            }
            return send_response(request_id, empty_result)

        try:
            image, _ = base64_to_image_data(image_data)
            logger.info("[debug] 画像データのデコードに成功")
        except Exception as decode_err:
            logger.error(f"[debug] 画像デコード失敗: {str(decode_err)}")
            traceback.print_exc()
            raise ValueError(f"画像デコード失敗: {str(decode_err)}")

        # 画像分析の実行
        result = analyze_all(image, options)

        # 中身がなさすぎる場合 fallback させる
        if not result.get("text") and not result.get("colors") and not result.get("elements"):
            result["success"] = False
            result["context"] = "fallback_from_analyzeAll"
            result["error"] = "画像分析エラー: 情報が取得できませんでした"
        else:
            result["success"] = True

        return send_response(request_id, result)

    except Exception as e:
        logger.error(f"analyze_all処理中にエラー: {str(e)}")
        logger.error(traceback.format_exc())
        return send_response(request_id, {"success": False, "error": str(e)}, None)
    finally:
        # 大きなオブジェクトを明示的に解放
        if 'image' in locals():
            del image
        if 'result' in locals():
            del result
        gc.collect()

        # メモリ使用量をロギング
        log_memory_usage()

def handle_compress_analysis(request_id: str, params: Dict[str, Any]):
    """画像解析結果を圧縮して重要な情報だけを抽出する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        analysis_data = params.get('analysis_data', {})
        options = params.get('options', {})

        if not analysis_data:
            raise ValueError("解析データが提供されていません")

        # 圧縮処理を実行
        logger.info("!!!!! 圧縮処理の直前 !!!!!")
        logger.error("!!!!! 圧縮処理の直前 !!!!!")  # errorレベルにして確実に出力
        compressed_data = image_analyzer.compress_analysis_results(analysis_data, options)
        logger.info("!!!!! 圧縮処理の直後 !!!!!")
        logger.error("!!!!! 圧縮処理の直後 !!!!!")  # errorレベルにして確実に出力

        # デバッグ: 圧縮データの全容をログに出力
        logger.info("===== 圧縮・構造化データの全容 (compress_analysis) =====")
        logger.info(json.dumps(compressed_data, ensure_ascii=False, default=str))
        logger.info("===== 圧縮・構造化データの出力終了 =====")

        # タイムスタンプを追加
        if 'timestamp' not in compressed_data:
            compressed_data['timestamp'] = datetime.now().isoformat()

        send_response(request_id, compressed_data)

    except Exception as e:
        logger.error(f"解析結果圧縮中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"解析結果圧縮エラー: {str(e)}")

def handle_compare_images(request_id: str, params: Dict[str, Any]):
    """元画像とレンダリング画像を比較して類似度を評価する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        original_image_data = params.get('original_image', '')
        rendered_image_data = params.get('rendered_image', '')

        if not original_image_data or not rendered_image_data:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        original_image, _ = base64_to_image_data(original_image_data)
        rendered_image, _ = base64_to_image_data(rendered_image_data)

        # 画像比較を実行
        comparison_result = image_analyzer.compare_images(original_image, rendered_image)

        # 差分ヒートマップをBase64に変換
        if comparison_result.get('success') and 'diff_heatmap' in comparison_result:
            heatmap = comparison_result['diff_heatmap']
            _, buffer = cv2.imencode('.png', heatmap)
            heatmap_base64 = base64.b64encode(buffer).decode('utf-8')
            comparison_result['diff_heatmap_base64'] = heatmap_base64
            # バッファを明示的に解放
            buffer = None
            del comparison_result['diff_heatmap']  # OpenCV画像は直接JSONシリアライズできないので削除

        # フィードバックを生成
        feedback = image_analyzer.generate_feedback(comparison_result)
        comparison_result['feedback'] = feedback

        send_response(request_id, comparison_result)

    except Exception as e:
        logger.error(f"画像比較中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"画像比較エラー: {str(e)}")
    finally:
        # 明示的なリソース解放
        if 'original_image' in locals():
            del original_image
        if 'rendered_image' in locals():
            del rendered_image
        if 'heatmap' in locals():
            del heatmap
        gc.collect()

def handle_exit(request_id: str, params: Dict[str, Any]):
    """サーバーを終了する"""
    logger.info(f"終了リクエストを受信しました (ID: {request_id})")

    # 正常終了のレスポンスを送信
    send_response(request_id, {"status": "shutting_down"})

    # 少し遅延して終了（レスポンスが確実に送信されるように）
    def delayed_exit():
        time.sleep(0.5)
        sys.exit(0)

    # 別スレッドで遅延終了を実行
    threading.Thread(target=delayed_exit, daemon=True).start()

def handle_check_memory(request_id: str, params: Dict[str, Any]):
    """メモリ使用量をチェックし、必要に応じて自動再起動を要求する"""
    try:
        process = psutil.Process()
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024

        logger.info(f"現在のメモリ使用量: {memory_mb:.2f} MB")

        # 指定した閾値を超えたらシャットダウンをリクエスト
        if memory_mb > 500:  # 500MB
            logger.warning(f"メモリ使用量が閾値を超えました ({memory_mb:.2f} MB)。終了をリクエストします。")
            return send_response(request_id, {"memory_usage_mb": memory_mb, "restart_needed": True})

        return send_response(request_id, {"memory_usage_mb": memory_mb, "restart_needed": False})
    except Exception as e:
        logger.error(f"メモリチェック中にエラー: {str(e)}")
        logger.error(traceback.format_exc())
        return send_response(request_id, None, f"メモリチェックエラー: {str(e)}")

"""
プロセスのウォッチドッグ機能
"""
class ProcessWatchdog:
    def __init__(self, timeout=300):  # 5分
        self.timeout = timeout
        self.last_activity = time.time()
        self.thread = None
        self.running = False

    def start(self):
        if self.running:
            return

        self.running = True
        self.thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.thread.start()
        logger.info(f"ウォッチドッグを開始しました (タイムアウト: {self.timeout}秒)")

    def update(self):
        """アクティビティを記録"""
        self.last_activity = time.time()

    def _watchdog_loop(self):
        while self.running:
            try:
                now = time.time()
                elapsed = now - self.last_activity

                if elapsed > self.timeout:
                    logger.critical(f"ウォッチドッグタイムアウト: {elapsed:.1f}秒間のアクティビティなし")
                    logger.critical("プロセスは停止状態の可能性があります。終了します。")
                    # 強制終了
                    os._exit(1)

                time.sleep(10)  # 10秒ごとにチェック

            except Exception as e:
                logger.error(f"ウォッチドッグエラー: {str(e)}")
                time.sleep(30)  # エラー後は長めに待機

"""
定期的なメモリ使用量レポート
"""
class MemoryReporter:
    def __init__(self, interval=300):  # デフォルト5分間隔
        self.interval = interval
        self.running = False
        self.thread = None
        self.peak_memory = 0

    def start(self):
        if self.running:
            return

        self.running = True
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.thread.start()
        logger.info("メモリ使用量モニタリングを開始しました")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        logger.info(f"メモリモニタリング停止: 最大使用量 {self.peak_memory:.2f} MB")

    def _monitor_loop(self):
        process = psutil.Process()

        while self.running:
            try:
                # 現在のメモリ使用量を取得
                memory_info = process.memory_info()
                memory_mb = memory_info.rss / 1024 / 1024

                # 最大値を更新
                if memory_mb > self.peak_memory:
                    self.peak_memory = memory_mb

                # 詳細なメモリログ
                logger.info(f"現在のメモリ使用量: {memory_mb:.2f} MB (ピーク: {self.peak_memory:.2f} MB)")

                # CPU使用率もログに記録
                cpu_percent = process.cpu_percent(interval=0.1)
                logger.info(f"現在のCPU使用率: {cpu_percent:.1f}%")

                # 間隔を空けて次のチェック
                for _ in range(self.interval):
                    if not self.running:
                        break
                    time.sleep(1)

            except Exception as e:
                logger.error(f"メモリモニタリング中にエラー: {str(e)}")
                time.sleep(10)  # エラー後は少し長めに待機

def main():
    """メインループ関数"""
    global memory_reporter, watchdog

    # メモリ管理の初期化
    setup_memory_management()

    # メモリモニタリングの開始
    memory_reporter = MemoryReporter(interval=300)
    memory_reporter.start()

    # ウォッチドッグを開始
    watchdog = ProcessWatchdog(timeout=600)  # 10分
    watchdog.start()

    # 画像解析モジュールを初期化
    init_success = initialize_image_analyzer()

    if not init_success:
        logger.error("画像解析モジュールの初期化に失敗しました。サーバーを終了します。")
        sys.exit(1)

    logger.info("リクエスト待機中...")

    try:
        # リクエストハンドラーのマップ
        handlers = {
            'extract_colors': handle_extract_colors,
            'extract_text': handle_extract_text,
            'analyze_sections': handle_analyze_sections,
            'analyze_layout': handle_analyze_layout,
            'detect_main_sections': handle_detect_main_sections,
            'detect_card_elements': handle_detect_card_elements,
            'detect_elements': handle_detect_elements,
            'analyze_all': handle_analyze_all,
            'compress_analysis': handle_compress_analysis,
            'compare_images': handle_compare_images,
            'check_environment': handle_check_environment,
            'setup_environment': handle_setup_environment,
            'exit': handle_exit,
            'check_memory': handle_check_memory
        }

        # リクエスト処理ループ
        while True:
            # ウォッチドッグに活動を通知
            watchdog.update()

            # リクエスト読み取り
            request = read_request()

            if not request:
                logger.warning("空のリクエストを受信しました。終了します。")
                break

            request_id = request.get('id', 'unknown')
            command = request.get('command')

            logger.info(f"リクエスト受信: {command} (ID: {request_id[:8] if len(request_id) > 8 else request_id})")

            # コマンドに対応するハンドラーを呼び出す
            handler = handlers.get(command)
            if handler:
                handler(request_id, request)
            else:
                logger.error(f"未知のコマンド: {command}")
                send_response(request_id, None, f"未知のコマンド: {command}")

            # リクエスト処理後にGCを実行
            gc.collect()

    except KeyboardInterrupt:
        logger.info("ユーザーによる終了を検出しました")
    except Exception as e:
        logger.error(f"予期せぬエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
    finally:
        # クリーンアップ処理
        if memory_reporter:
            memory_reporter.stop()
        logger.info("Pythonサーバーが終了しました。")

if __name__ == "__main__":
    main()
