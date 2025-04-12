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

# ロギング設定
# ログディレクトリを作成
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)

# 現在時刻でログファイル名を作成
log_file = os.path.join(log_dir, f'python_server_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

logging.basicConfig(
    level=logging.INFO,
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

    try:
        # JSONをシリアライズして標準出力に送信
        json_response = json.dumps(response)
        print(json_response, flush=True)

    except Exception as e:
        logger.error(f"レスポンス送信中にエラーが発生しました: {str(e)}")
        # 緊急フォールバックとしてエラーレスポンスを送信
        fallback_response = {
            "id": request_id,
            "result": None,
            "error": f"レスポンス送信エラー: {str(e)}"
        }
        print(json.dumps(fallback_response), flush=True)

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
    """画像から色を抽出する"""
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

        # image_analyzer.pyのextract_colors関数を呼び出す
        colors = image_analyzer.extract_colors_from_image(image, **options)

        send_response(request_id, colors)

    except Exception as e:
        logger.error(f"色抽出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"色抽出エラー: {str(e)}")

def handle_extract_text(request_id: str, params: Dict[str, Any]):
    """画像からテキストを抽出する"""
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

        # image_analyzer.pyのextract_text関数を呼び出す
        text_result = image_analyzer.extract_text_from_image(image, **options)

        send_response(request_id, text_result)

    except Exception as e:
        logger.error(f"テキスト抽出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"テキスト抽出エラー: {str(e)}")

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
        sections = image_analyzer.analyze_image_sections(image, **options)

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
        layout = image_analyzer.analyze_layout_pattern(image, **options)

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

        # image_analyzer.pyのdetect_main_sections関数を呼び出す
        sections = image_analyzer.detect_main_sections(image, **options)

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
        cards = image_analyzer.detect_card_elements(image, **options)

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
        elements = image_analyzer.detect_feature_elements(image, **options)

        send_response(request_id, elements)

    except Exception as e:
        logger.error(f"特徴的要素検出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"特徴的要素検出エラー: {str(e)}")

def handle_analyze_all(request_id: str, params: Dict[str, Any]):
    """画像の総合的な解析を行う"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data = params.get('image', '')
        analysis_type = params.get('type', 'all')  # all/basic/features/compress
        options = params.get('options', {})

        if not image_data:
            raise ValueError("画像データが提供されていません")

        # Base64データを画像に変換
        image, _ = base64_to_image_data(image_data)

        # compressタイプの場合は、まず通常の解析を行い、その結果を圧縮する
        if analysis_type == 'compress':
            # 通常の解析を実行
            colors = image_analyzer.extract_colors_from_image(image, **options)
            text = image_analyzer.extract_text_from_image(image, **options)
            sections = image_analyzer.analyze_image_sections(image, **options)
            layout = image_analyzer.analyze_layout_pattern(image, **options)
            elements = image_analyzer.detect_feature_elements(image, **options)

            # 結果を集約
            analysis_data = {
                "colors": colors,
                "text": text,
                "sections": sections,
                "layout": layout,
                "elements": elements,
                "timestamp": datetime.now().isoformat()
            }

            # 圧縮処理を実行
            compressed_data = image_analyzer.compress_analysis_results(analysis_data, options)

            # デバッグ: 圧縮データの全容をログに出力
            logger.info("===== 圧縮・構造化データの全容 (analyze_all) =====")
            logger.info(json.dumps(compressed_data, ensure_ascii=False, default=str))
            logger.info("===== 圧縮・構造化データの出力終了 =====")

            # 圧縮形式オプションに基づいてフォーマット変換
            format_type = options.get('format_type', 'structured')
            if format_type == 'semantic':
                compressed_data['semanticTags'] = image_analyzer.convert_to_semantic_format(compressed_data)
            elif format_type == 'template':
                compressed_data['templateFormat'] = image_analyzer.convert_to_template_format(compressed_data)

            # タイムスタンプを追加
            if 'timestamp' not in compressed_data:
                compressed_data['timestamp'] = datetime.now().isoformat()

            send_response(request_id, compressed_data)
            return

        # 通常の解析プロセス
        # 各解析処理を実行
        colors = image_analyzer.extract_colors_from_image(image, **options)
        text = image_analyzer.extract_text_from_image(image, **options)
        sections = image_analyzer.analyze_image_sections(image, **options)
        layout = image_analyzer.analyze_layout_pattern(image, **options)
        elements = image_analyzer.detect_feature_elements(image, **options)

        # 結果を集約
        result = {
            "colors": colors,
            "text": text,
            "sections": sections,
            "layout": layout,
            "elements": elements,
            "timestamp": datetime.now().isoformat()
        }

        send_response(request_id, result)

    except Exception as e:
        logger.error(f"総合分析中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"総合分析エラー: {str(e)}")

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
        compressed_data = image_analyzer.compress_analysis_results(analysis_data, options)

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
