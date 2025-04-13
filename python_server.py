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

# 実行ディレクトリをスクリプトのある場所に変更
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

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
        print(json_response, flush=True)
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
    """Base64エンコードされた画像データをデコードする"""
    if not image_analyzer:
        raise ValueError("画像解析モジュールが初期化されていません")

    try:
        # Base64形式チェック
        if ',' in image_data_base64:
            # Data URI形式の場合（例: data:image/jpeg;base64,/9j/4AAQSkZ...）
            header, encoded = image_data_base64.split(',', 1)
            image_format = header.split(';')[0].split('/')[1] if ';' in header and '/' in header.split(';')[0] else 'jpeg'
        else:
            # 純粋なBase64文字列の場合
            encoded = image_data_base64
            image_format = 'jpeg'  # デフォルト形式

        # Base64をデコードして画像データを取得
        image_bytes = base64.b64decode(encoded)

        # image_analyzer.pyの関数を使用して画像データを変換
        image = image_analyzer.decode_image(image_bytes)

        return image, image_format

    except Exception as e:
        logger.error(f"画像データのデコード中にエラーが発生しました: {str(e)}")
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

def handle_analyze_all(request_id, params):
    try:
        logger.error(f"!!!!! handle_analyze_all 呼び出し: request_id={request_id} !!!!!")
        logger.error(f"!!!!! params内容: {list(params.keys() if params else [])} !!!!!")
        logger.error(f"!!!!! type値: {params.get('type', 'not_found')} !!!!!")

        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        logger.info(f"[debug] 受信データ構造: キー={list(params.keys())}")
        image_data = None
        for key in ['image', 'image_data', 'imageData']:
            if key in params and params[key]:
                image_data = params[key]
                logger.info(f"[debug] 画像データを'{key}'キーから取得")
                break

        analysis_type = params.get('type', 'all')
        options = params.get('options', {})

        if not image_data:
            logger.warning("[debug] 画像データが提供されていません - 空の結果を返します")
            empty_result = {
                "colors": [],
                "text": "",
                "textBlocks": [],
                "sections": [],
                "layout": {"width": 1200, "height": 800, "type": "standard"},
                "elements": {"elements": []},
                "timestamp": datetime.now().isoformat(),
                "status": "no_image"
            }
            send_response(request_id, empty_result)
            return

        try:
            image, _ = base64_to_image_data(image_data)
            logger.info("[debug] 画像データのデコードに成功")
        except Exception as decode_err:
            logger.error(f"[debug] 画像デコード失敗: {str(decode_err)}")
            traceback.print_exc()
            raise ValueError(f"画像デコード失敗: {str(decode_err)}")

        def analyze_all(image, options):
            colors = []
            text_content = ''
            text_blocks = []
            sections = {'sections': []}
            layout = {"width": 1200, "height": 800, "type": "standard"}
            elements = {"elements": []}

            try:
                colors = image_analyzer.extract_colors_from_image(image=image, **clean_options(options))
            except Exception as e:
                logger.error(f"[debug] 色抽出失敗: {str(e)}")

            try:
                text_result = image_analyzer.extract_text_from_image(image=image, **clean_options(options))
                if isinstance(text_result, dict):
                    text_content = text_result.get('text', '')
                    text_blocks = text_result.get('textBlocks', [])
            except Exception as e:
                logger.error(f"[debug] テキスト抽出失敗: {str(e)}")

            try:
                sections = image_analyzer.analyze_image_sections(image=image, **clean_options(options))
                if not isinstance(sections, dict):
                    sections = {'sections': []}
            except Exception as e:
                logger.error(f"[debug] セクション抽出失敗: {str(e)}")

            try:
                layout = image_analyzer.analyze_layout_pattern(image=image, **clean_options(options))
                if not isinstance(layout, dict):
                    layout = {"width": 1200, "height": 800, "type": "standard"}
            except Exception as e:
                logger.error(f"[debug] レイアウト解析失敗: {str(e)}")

            try:
                elements = image_analyzer.detect_feature_elements(image=image, **clean_options(options))
                if isinstance(elements, list):
                    elements = {"elements": elements}
                elif not isinstance(elements, dict):
                    elements = {"elements": []}
            except Exception as e:
                logger.error(f"[debug] 要素検出失敗: {str(e)}")

            return {
                "colors": colors,
                "text": text_content,
                "textBlocks": text_blocks,
                "sections": sections.get("sections", []),
                "layout": layout,
                "elements": elements.get("elements", []),
                "timestamp": datetime.now().isoformat(),
                "status": "success"
            }

        result = analyze_all(image, options)

        try:
            json_dump = json.dumps(result, ensure_ascii=False, indent=2)
            logger.info("===== 最終送信データ (一部) =====")
            logger.info(json_dump[:1000] + ('...' if len(json_dump) > 1000 else ''))
        except Exception as json_err:
            logger.error(f"[debug] JSONシリアライズエラー: {str(json_err)}")

        logger.error("✅ send_response を呼び出します（タイムアウト直前かも）")
        send_response(request_id, result)

    except Exception as e:
        logger.error(f"総合分析中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, {
            "colors": [],
            "text": "",
            "textBlocks": [],
            "sections": [],
            "layout": {"width": 1200, "height": 800, "type": "standard"},
            "elements": [],
            "timestamp": datetime.now().isoformat(),
            "status": "error",
            "error": str(e)
        }, f"総合分析エラー: {str(e)}")
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
            del comparison_result['diff_heatmap']  # OpenCV画像は直接JSONシリアライズできないので削除

        # フィードバックを生成
        feedback = image_analyzer.generate_feedback(comparison_result)
        comparison_result['feedback'] = feedback

        send_response(request_id, comparison_result)

    except Exception as e:
        logger.error(f"画像比較中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"画像比較エラー: {str(e)}")

def handle_exit(request_id: str, params: Dict[str, Any]):
    """Pythonサーバーを終了する"""
    try:
        # 終了のための応答を送信
        send_response(request_id, {"status": "ok", "message": "Python server shutting down"})

        # 数秒後に強制終了するタイマーを設定（応答が送信される時間を確保）
        def delayed_exit():
            time.sleep(1)
            sys.exit(0)

        exit_timer = threading.Timer(1, delayed_exit)
        exit_timer.daemon = True
        exit_timer.start()

    except Exception as e:
        logger.error(f"終了処理中にエラーが発生しました: {str(e)}")
        send_response(request_id, None, f"終了処理エラー: {str(e)}")
        # エラーが発生しても1秒後に終了
        time.sleep(1)
        sys.exit(1)

# コマンドハンドラーのマッピング
COMMAND_HANDLERS = {
    "check_environment": handle_check_environment,
    "setup_environment": handle_setup_environment,
    "extract_colors": handle_extract_colors,
    "extract_text": handle_extract_text,
    "analyze_sections": handle_analyze_sections,
    "analyze_layout": handle_analyze_layout,
    "detect_main_sections": handle_detect_main_sections,
    "detect_card_elements": handle_detect_card_elements,
    "detect_elements": handle_detect_elements,
    "analyze_all": handle_analyze_all,
    "compress_analysis": handle_compress_analysis,
    "compare_images": handle_compare_images,
    "exit": handle_exit
}

def main():


    """メインの実行ループ"""
    logger.info("Pythonサーバーを起動しています...")

    # 画像解析モジュールを初期化
    init_success = initialize_image_analyzer()

    if not init_success:
        logger.error("画像解析モジュールの初期化に失敗しました。サーバーを終了します。")
        sys.exit(1)

    logger.info("リクエスト待機中...")

    # コマンドライン引数のパース
    parser = argparse.ArgumentParser(description='Python処理サーバー')
    parser.add_argument('--debug', action='store_true', help='デバッグモードを有効化')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        logger.debug("デバッグモードが有効です")

    while True:
        try:
            # リクエストの読み取り
            request = read_request()

            if request is None:
                # 標準入力が閉じられた場合は終了
                logger.info("標準入力が閉じられました。サーバーを終了します。")
                break

            # リクエストの処理
            request_id = request.get('id', str(uuid.uuid4()))
            command = request.get('command')

            # 🔥🔥🔥 ここに入れる 🔥🔥🔥
            logger.error(f"🔥🔥🔥 Pythonサーバーで受け取ったコマンド: {command}")
            logger.error(f"🔥🔥🔥 リクエストID: {request_id}")
            logger.error(f"🔥🔥🔥 パラメータのキー: {list(request.keys()) if request else 'None'}")



            # リクエストの処理
            request_id = request.get('id', str(uuid.uuid4()))
            command = request.get('command')

            if not command:
                logger.error(f"コマンドが指定されていません: {request}")
                send_response(request_id, None, "コマンドが指定されていません")
                continue

            # コマンドハンドラーの取得
            handler = COMMAND_HANDLERS.get(command)

            if handler:
                # ハンドラーの実行
                handler(request_id, request)
            else:
                logger.error(f"不明なコマンド: {command}")
                send_response(request_id, None, f"不明なコマンド: {command}")

        except Exception as e:
            logger.error(f"リクエスト処理中に予期せぬエラーが発生しました: {str(e)}")
            logger.error(traceback.format_exc())

            # できればリクエストIDを使用してエラーレスポンスを送信
            try:
                if 'request' in locals() and request and 'id' in request:
                    send_response(request.get('id'), None, f"サーバーエラー: {str(e)}")
            except:
                pass

    logger.info("Pythonサーバーが終了しました。")

if __name__ == "__main__":
    main()
