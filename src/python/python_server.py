#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# GPU使用の完全無効化
import os
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_FORCE_CPU_ONLY"] = "1"

# PyTorchスレッド数の制限
import torch
torch.set_num_threads(1)

# プロセス生成方式の明示的指定
import multiprocessing
multiprocessing.set_start_method('spawn', force=True)

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
from contextlib import redirect_stdout, redirect_stderr
import io
import gc
import psutil  # メモリ使用量の取得用
import platform  # プラットフォーム情報取得用

# StringIOの拡張クラス（キャプチャ用）
class NonClosingStringIO(io.StringIO):
    """StringIOの拡張クラス。close()メソッドをオーバーライドして何もしないようにします。
    これにより、withブロックを抜けてもバッファの内容が保持されます。"""
    def close(self):
        # 実際には何もしない（close操作を無視する）
        pass

# Win32コンソール出力用（フォールバック用）
try:
    import win32console
except ImportError:
    # インストールされていない場合は無視
    win32console = None

# エラー出力をUTF-8でログファイルに保存（最優先）
stderr_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(stderr_log_dir, exist_ok=True)
stderr_log_path = os.path.join(stderr_log_dir, f'stderr_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

# 標準エラー出力をファイルに直接リダイレクト（確実に出力されるように）
try:
    sys.stderr = open(stderr_log_path, "w", encoding="utf-8", errors="replace", buffering=1)
    # 確認用メッセージを出力し、即座にフラッシュする
    print(f"標準エラー出力をログファイルにリダイレクトしました: {stderr_log_path}", file=sys.stderr, flush=True)
    print(f"Python実行環境: {sys.executable}", file=sys.stderr, flush=True)
    print(f"カレントディレクトリ: {os.getcwd()}", file=sys.stderr, flush=True)
    print(f"システムエンコーディング: {sys.getdefaultencoding()}", file=sys.stderr, flush=True)
except Exception as e:
    # 標準エラー出力のリダイレクトに失敗した場合のバックアップ
    backup_log = os.path.join(stderr_log_dir, f'emergency_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    with open(backup_log, "w", encoding="utf-8") as f:
        f.write(f"標準エラー出力のリダイレクトに失敗: {str(e)}\n")
        f.write(f"Python実行環境: {sys.executable}\n")
        f.write(f"カレントディレクトリ: {os.getcwd()}\n")
        f.write(f"システムエンコーディング: {sys.getdefaultencoding()}\n")

# ロギング設定
# ログディレクトリを作成
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)

# 現在時刻でログファイル名を作成
log_file = os.path.join(log_dir, f'python_server_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

# 直接ファイルに書き込む緊急ログ機能
def emergency_log(message):
    """重要なメッセージを直接ファイルに書き込む（ロギングシステムに依存しない）"""
    try:
        emergency_log_path = os.path.join(log_dir, f'emergency_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        with open(emergency_log_path, "a", encoding="utf-8") as f:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"[{timestamp}] EMERGENCY: {message}\n")
            f.flush()
        return True
    except Exception as e:
        try:
            # 最後の手段: カレントディレクトリに書き込む
            with open(f'emergency_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log', "a", encoding="utf-8") as f:
                f.write(f"CRITICAL ERROR: {message} (Logger failed: {str(e)})\n")
                f.flush()
        except:
            pass  # もう何もできない
        return False

try:
    # 標準的なロギング設定を試行
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),  # UTF-8でログファイルを作成
            logging.StreamHandler(sys.stderr)  # 標準エラー出力にログを出力
        ]
    )
    
    # ロガー作成
    logger = logging.getLogger('python_server')
    logger.info(f"ログファイルを作成しました: {log_file}")
    
    # 直接ファイルにも書き込んで確認
    emergency_log(f"標準ロギングシステムが初期化されました: {log_file}")
except Exception as logging_error:
    # ロギングシステムの初期化に失敗した場合
    emergency_log(f"ロギングシステムの初期化に失敗: {str(logging_error)}")
    
    # シンプルなロガーを作成
    class SimpleLogger:
        def __init__(self, name):
            self.name = name
        
        def _log(self, level, message):
            emergency_log(f"[{level}] {self.name}: {message}")
        
        def debug(self, message): self._log("DEBUG", message)
        def info(self, message): self._log("INFO", message)
        def warning(self, message): self._log("WARNING", message)
        def error(self, message, exc_info=False): 
            self._log("ERROR", message)
            if exc_info:
                emergency_log(traceback.format_exc())
        def critical(self, message): self._log("CRITICAL", message)
    
    # シンプルなロガーを使用
    logger = SimpleLogger('python_server')
    logger.info("シンプルロギングシステムを使用します（標準ロギングシステムの初期化に失敗）")

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
        analyzer_path = os.path.join(script_dir, 'modules', 'image_analyzer.py')

        logger.info(f"画像解析モジュールのパス: {analyzer_path}")

        # パスが見つからない場合の代替パスを試す（パッケージ化されたアプリケーション用）
        if not os.path.exists(analyzer_path):
            logger.warning(f"標準パスで画像解析モジュールが見つかりません。代替パスを試行します。")
            # 親ディレクトリのmodulesディレクトリを試す
            parent_dir = os.path.dirname(script_dir)
            analyzer_path = os.path.join(parent_dir, 'modules', 'image_analyzer.py')
            logger.info(f"代替パス: {analyzer_path}")

            # それでも見つからない場合は、extraResourcesの相対パスを試す
            if not os.path.exists(analyzer_path):
                logger.warning(f"代替パスでも見つかりません。リソースパスを試行します。")
                analyzer_path = os.path.join(script_dir, '..', 'modules', 'image_analyzer.py')
                analyzer_path = os.path.abspath(analyzer_path)
                logger.info(f"リソースパス: {analyzer_path}")

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
    try:
        # 緊急ログに確実に記録
        emergency_log(f"=== send_response 開始: ID={request_id} ===")
        
        logger.info(f"===== send_response 詳細ステップログ開始 ID:{request_id} =====")
        print(f"[PYTHON_DEBUG] send_response 詳細ステップログ開始: ID={request_id}", file=sys.stderr, flush=True)
        
        # ステップ1: レスポンス構造体の構築
        logger.info("ステップ1: レスポンス構造体の構築")
        print("[PYTHON_DEBUG] ステップ1: レスポンス構造体の構築", file=sys.stderr, flush=True)
        emergency_log("ステップ1: レスポンス構造体の構築")
        
        response = {
            "id": request_id,
            "result": result,
            "error": error
        }
        logger.info("ステップ1完了: レスポンス構造体の構築完了")
        print("[PYTHON_DEBUG] ステップ1完了: レスポンス構造体の構築完了", file=sys.stderr, flush=True)
        
        # ステップ2: データ内容の検証とログ記録
        logger.info("ステップ2: データ内容の検証")
        print("[PYTHON_DEBUG] ステップ2: データ内容の検証", file=sys.stderr, flush=True)
        emergency_log("ステップ2: データ内容の検証")
        
        # データサイズの事前計測を追加
        result_size_estimate = 0
        try:
            if result is not None:
                # シリアライズ可能かどうかテスト
                test_json = json.dumps(result)
                result_size_estimate = len(test_json)
                logger.info(f"事前テスト: JSONシリアライズ成功 - サイズ: {result_size_estimate}バイト")
                print(f"[PYTHON_DEBUG] 事前テスト: JSONシリアライズ成功 - サイズ: {result_size_estimate}バイト", file=sys.stderr, flush=True)
                
                # 大きすぎるデータの場合は自動的にファイルベースに切り替え
                if result_size_estimate > 1024 * 1024:  # 1MB以上
                    logger.warning(f"大きすぎるデータ（{result_size_estimate}バイト）のため、ファイルベース通信に切り替え")
                    print(f"[PYTHON_DEBUG] 大きすぎるデータ（{result_size_estimate}バイト）のため、ファイルベース通信に切り替え", file=sys.stderr, flush=True)
                    emergency_log(f"大きすぎるデータ（{result_size_estimate}バイト）のため、ファイルベース通信に切り替え")
                    
                    # 結果をファイルに保存
                    response_file = os.path.join(log_dir, f'response_{request_id}.json')
                    with open(response_file, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False)
                    
                    # ファイルを指すシンプルな応答を作成
                    response = {
                        "id": request_id,
                        "file_response": response_file,
                        "response_size": result_size_estimate
                    }
                    logger.info(f"大きなデータをファイルに保存: {response_file}")
                    emergency_log(f"大きなデータをファイルに保存: {response_file}")
        except Exception as test_err:
            logger.error(f"シリアライズテスト失敗: {test_err}", exc_info=True)
            print(f"[PYTHON_DEBUG] シリアライズテスト失敗: {test_err}", file=sys.stderr, flush=True)
            emergency_log(f"シリアライズテスト失敗: {test_err}\n{traceback.format_exc()}")
            
            # シリアライズできない場合はエラーとして処理
            response = {
                "id": request_id,
                "error": f"データをJSONに変換できません: {str(test_err)}"
            }
        
        if result is not None:
            if isinstance(result, dict):
                keys_info = f"キー={list(result.keys())}"
                logger.info(f"Python→JS送信データ構造: {keys_info}")
                print(f"[PYTHON_DEBUG] 送信データ構造: {keys_info}", file=sys.stderr, flush=True)
                emergency_log(f"送信データ構造: {keys_info}")
                
                # 大きなレスポンスの詳細情報
                if result_size_estimate > 10240:  # 10KB以上
                    size_info = f"{result_size_estimate}バイト"
                    logger.info(f"大きなレスポンス: {size_info}")
                    print(f"[PYTHON_DEBUG] 大きなレスポンス: {size_info}", file=sys.stderr, flush=True)
                    emergency_log(f"大きなレスポンス: {size_info}")
            else:
                type_info = f"{type(result).__name__}"
                logger.info(f"Python→JS送信データ型: {type_info}")
                emergency_log(f"送信データ型: {type_info}")
        logger.info("ステップ2完了: データ内容の検証完了")
        print("[PYTHON_DEBUG] ステップ2完了: データ内容の検証完了", file=sys.stderr, flush=True)
        
        # ステップ3: JSON形式に変換
        logger.info("ステップ3: JSON形式に変換")
        print("[PYTHON_DEBUG] ステップ3: JSON形式に変換", file=sys.stderr, flush=True)
        emergency_log("ステップ3: JSON形式に変換")
        
        try:
            output = json.dumps(response, ensure_ascii=False)
            size_info = f"JSONエンコード後のサイズ: {len(output)}バイト"
            logger.info(f"ステップ3完了: {size_info}")
            print(f"[PYTHON_DEBUG] ステップ3完了: {size_info}", file=sys.stderr, flush=True)
            emergency_log(f"ステップ3完了: {size_info}")
        except Exception as json_err:
            # JSON変換に失敗した場合のフォールバック
            logger.error(f"JSON変換失敗: {json_err}", exc_info=True)
            print(f"[PYTHON_DEBUG] JSON変換失敗: {json_err}", file=sys.stderr, flush=True)
            emergency_log(f"JSON変換失敗: {json_err}\n{traceback.format_exc()}")
            
            # 最小限の情報だけを持つ応答を作成
            fallback_response = {
                "id": request_id,
                "error": f"データをJSONに変換できません: {str(json_err)}"
            }
            output = json.dumps(fallback_response, ensure_ascii=False)
            logger.info(f"フォールバックJSON作成: {len(output)}バイト")
            emergency_log(f"フォールバックJSON作成: {len(output)}バイト")
        
        # ステップ4: 環境に応じた送信処理
        logger.info("ステップ4: 環境に応じた送信処理")
        print("[PYTHON_DEBUG] ステップ4: 環境に応じた送信処理", file=sys.stderr, flush=True)
        emergency_log("ステップ4: 環境に応じた送信処理")
        
        # Windows環境では特別な処理を追加
        if os.name == 'nt':
            try:
                # ログ出力が確実に見える対策として追加
                logger.info("WINDOWS RESPONSE START")
                print("WINDOWS RESPONSE START", file=sys.stderr, flush=True)
                sys.stderr.flush()
                emergency_log("WINDOWS RESPONSE START")
                
                # Windows専用の改良送信処理
                logger.info("ステップ4.1: Windows専用バイナリモード送信")
                print("[PYTHON_DEBUG] ステップ4.1: Windows専用バイナリモード送信", file=sys.stderr, flush=True)
                emergency_log("ステップ4.1: Windows専用バイナリモード送信")
                
                # msvcrtを使用してバイナリモードに設定（標準的な方法）
                import msvcrt
                msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
                
                # データにデリミタを追加してUTF-8でエンコード
                data_bytes = (output + '__END__').encode('utf-8')
                
                # 書き込みとフラッシュを分割して実行
                sys.stdout.buffer.write(data_bytes)
                sys.stdout.buffer.flush()
                
                size_info = f"Windows専用バイナリ送信: {len(data_bytes)}バイト"
                logger.info(f"ステップ4.1完了: {size_info}")
                print(f"[PYTHON_DEBUG] ステップ4.1完了: {size_info}", file=sys.stderr, flush=True)
                emergency_log(f"ステップ4.1完了: {size_info}")
                
                # 大きなデータの場合は短い遅延を入れて送信バッファがフラッシュされる時間を確保
                if len(data_bytes) > 100000:  # 100KB以上
                    time.sleep(0.1)
                
                # ログ出力が確実に見える対策として追加
                logger.info("WINDOWS RESPONSE END")
                print("WINDOWS RESPONSE END", file=sys.stderr, flush=True)
                sys.stderr.flush()
                emergency_log("WINDOWS RESPONSE END")
                
            except Exception as windows_error:
                # Windows特有のエラーをキャッチ
                error_msg = f"Windows環境での送信エラー: {str(windows_error)}"
                logger.error(error_msg, exc_info=True)
                print(f"[PYTHON_DEBUG] {error_msg}", file=sys.stderr, flush=True)
                sys.stderr.flush()  # 確実にログを出力
                emergency_log(error_msg)
                
                # 2番目の試行: ファイル経由の通信
                try:
                    fallback_msg = "フォールバック: ファイル経由の通信を試行"
                    logger.info(fallback_msg)
                    print(f"[PYTHON_DEBUG] {fallback_msg}", file=sys.stderr, flush=True)
                    emergency_log(fallback_msg)
                    
                    # ファイルに応答を書き込む
                    fallback_file = os.path.join(log_dir, f'fallback_response_{request_id}.json')
                    with open(fallback_file, 'w', encoding='utf-8') as f:
                        f.write(output)
                    
                    # ファイル情報のみを含む簡易応答を作成
                    file_response = {
                        "id": request_id,
                        "file_response": fallback_file,
                        "fallback": True
                    }
                    
                    # 簡易応答をJSON化して標準出力に送信
                    simple_output = json.dumps(file_response, ensure_ascii=False)
                    print(simple_output + '__END__', flush=True)
                    
                    logger.info(f"フォールバック: ファイル応答送信完了: {fallback_file}")
                    print(f"[PYTHON_DEBUG] フォールバック: ファイル応答送信完了: {fallback_file}", file=sys.stderr, flush=True)
                    emergency_log(f"フォールバック: ファイル応答送信完了: {fallback_file}")
                except Exception as final_error:
                    error_msg = f"すべての出力方法が失敗: {str(final_error)}"
                    logger.critical(error_msg)
                    print(f"[PYTHON_DEBUG] {error_msg}", file=sys.stderr, flush=True)
                    emergency_log(error_msg)
        else:
            # 非Windows環境では通常の処理
            logger.info("ステップ4.1: 非Windows環境での通常送信")
            print("[PYTHON_DEBUG] ステップ4.1: 非Windows環境での通常送信", file=sys.stderr, flush=True)
            emergency_log("非Windows環境での通常送信")
            
            print(output + '__END__', flush=True)
            
            logger.info("ステップ4.1完了: 非Windows環境での送信完了")
            print("[PYTHON_DEBUG] ステップ4.1完了: 非Windows環境での送信完了", file=sys.stderr, flush=True)
            emergency_log("非Windows環境での送信完了")
            
        # 送信完了ログ
        logger.info(f"===== send_response 詳細ステップログ完了 ID:{request_id} =====")
        print(f"[PYTHON_DEBUG] send_response 詳細ステップログ完了: ID={request_id}", file=sys.stderr, flush=True)
        sys.stderr.flush()  # 最終的に確実にログを出力
        emergency_log(f"=== send_response 完了: ID={request_id} ===")
    except Exception as e:
        error_msg = f"send_response中に予期しないエラー: {str(e)}"
        logger.error(error_msg, exc_info=True)
        emergency_log(f"{error_msg}\n{traceback.format_exc()}")
        try:
            print(f"[PYTHON_DEBUG] {error_msg}", file=sys.stderr, flush=True)
        except:
            pass

# オプションをクリーンアップする関数を追加
def clean_options(options: Dict[str, Any]) -> Dict[str, Any]:
    """オプション辞書をクリーンアップして安全に使えるようにする"""
    if not options or not isinstance(options, dict):
        return {}
    
    # 安全なオプションを作成
    clean_opts = options.copy()
    
    # 'image'キーがある場合は削除（競合防止）
    if 'image' in clean_opts:
        del clean_opts['image']
    
    # その他の危険な値や無効な値を削除/変換
    for key in list(clean_opts.keys()):
        # Noneや空オブジェクトを削除
        if clean_opts[key] is None:
            del clean_opts[key]
        # 不正な形式の値を修正
        elif key == 'language' and not isinstance(clean_opts[key], str):
            clean_opts[key] = str(clean_opts[key])
    
    return clean_opts

def handle_exit(request_id: str, params: Dict[str, Any]):
    """サーバーを終了する"""
    try:
        result = {
            "status": "ok",
            "message": "Pythonサーバーを終了します",
            "timestamp": datetime.now().isoformat()
        }
        
        send_response(request_id, result)
        
        # 終了メッセージをログに記録
        logger.info("exitコマンドを受信しました。サーバーを終了します。")
        
    except Exception as e:
        logger.error(f"終了処理中にエラーが発生しました: {str(e)}")
        send_response(request_id, None, f"終了処理エラー: {str(e)}")

def handle_check_memory(request_id: str, params: Dict[str, Any]):
    """メモリ使用状況を確認する"""
    try:
        # 現在のプロセスのメモリ使用状況を取得
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        
        # システム全体のメモリ情報
        system_memory = psutil.virtual_memory()
        
        result = {
            "status": "ok",
            "process_memory": {
                "rss": memory_info.rss,  # 物理メモリ使用量 (バイト)
                "rss_mb": round(memory_info.rss / (1024 * 1024), 2),  # MB単位
                "vms": memory_info.vms,  # 仮想メモリ使用量 (バイト)
                "vms_mb": round(memory_info.vms / (1024 * 1024), 2),  # MB単位
            },
            "system_memory": {
                "total": system_memory.total,  # 合計物理メモリ (バイト)
                "total_gb": round(system_memory.total / (1024**3), 2),  # GB単位
                "available": system_memory.available,  # 利用可能な物理メモリ (バイト)
                "available_gb": round(system_memory.available / (1024**3), 2),  # GB単位
                "used_percent": system_memory.percent,  # 使用率 (%)
            },
            "platform": platform.platform(),
            "python_version": sys.version,
            "timestamp": datetime.now().isoformat()
        }
        
        # GPU情報の取得を試みる
        try:
            if torch.cuda.is_available():
                result["gpu"] = {
                    "device_count": torch.cuda.device_count(),
                    "current_device": torch.cuda.current_device(),
                    "device_name": torch.cuda.get_device_name(0),
                    "is_available": True
                }
            else:
                result["gpu"] = {
                    "is_available": False,
                    "reason": "CUDA not available"
                }
        except Exception as gpu_error:
            result["gpu"] = {
                "is_available": False,
                "error": str(gpu_error)
            }
        
        # ガベージコレクションの実行
        gc_count = gc.collect()
        result["gc_collected"] = gc_count
        
        send_response(request_id, result)
        
    except Exception as e:
        logger.error(f"メモリ確認中にエラーが発生しました: {str(e)}")
        error_info = {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        send_response(request_id, error_info)

def handle_compare_images(request_id: str, params: Dict[str, Any]):
    """2つの画像を比較する"""
    try:
        if not image_analyzer:
            raise ValueError("画像解析モジュールが初期化されていません")

        # パラメータを取得
        image_data1 = params.get('image_data1', '')
        image_data2 = params.get('image_data2', '')
        options = params.get('options', {})

        if not image_data1 or not image_data2:
            raise ValueError("比較する2つの画像データが必要です")

        # Base64データを画像に変換
        image1, _ = base64_to_image_data(image_data1)
        image2, _ = base64_to_image_data(image_data2)

        # オプションのimageを除外して衝突回避
        clean_opts = clean_options(options)

        # 画像比較処理を実行
        # この関数はimage_analyzer.pyに実装されている必要があります
        comparison_result = image_analyzer.compare_images(image1, image2, **clean_opts)

        send_response(request_id, comparison_result)

    except Exception as e:
        logger.error(f"画像比較中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"画像比較エラー: {str(e)}")

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

        # OCR実行前に明示的にPyTorchスレッド数を再設定
        try:
            import torch
            torch.set_num_threads(1)
            logger.info(f"OCR実行前にPyTorchスレッド数を制限: {torch.get_num_threads()}スレッド")
            print(f"[PYTHON_DEBUG] OCR実行前にPyTorchスレッド数を制限: {torch.get_num_threads()}スレッド", file=sys.stderr, flush=True)
            
            # GPUの無効化を明示的に再確認
            if 'CUDA_VISIBLE_DEVICES' in os.environ:
                logger.info(f"GPU無効化設定を確認: CUDA_VISIBLE_DEVICES={os.environ['CUDA_VISIBLE_DEVICES']}")
                print(f"[PYTHON_DEBUG] GPU無効化設定を確認: CUDA_VISIBLE_DEVICES={os.environ['CUDA_VISIBLE_DEVICES']}", file=sys.stderr, flush=True)
        except Exception as thread_err:
            logger.warning(f"PyTorchスレッド設定エラー: {str(thread_err)}")
            print(f"[PYTHON_DEBUG] PyTorchスレッド設定エラー: {str(thread_err)}", file=sys.stderr, flush=True)
        
        # ガベージコレクションをOCR実行前に実行
        try:
            import gc
            gc.collect()
            logger.info("OCR実行前にガベージコレクションを実行")
            print("[PYTHON_DEBUG] OCR実行前にガベージコレクションを実行", file=sys.stderr, flush=True)
        except Exception as gc_err:
            logger.warning(f"ガベージコレクション実行エラー: {str(gc_err)}")
            print(f"[PYTHON_DEBUG] ガベージコレクション実行エラー: {str(gc_err)}", file=sys.stderr, flush=True)

        # 標準出力をキャプチャするためのバッファを作成
        output_buffer = NonClosingStringIO()
        
        logger.info("テキスト抽出処理開始")
        print("[PYTHON_DEBUG] テキスト抽出処理開始", file=sys.stderr, flush=True)
        
        try:
            # 出力をキャプチャしながらOCR実行
            with redirect_stdout(output_buffer), redirect_stderr(output_buffer):
                # verbose=False で進捗バーを無効化
                text_options = clean_options(options).copy()
                text_options['verbose'] = False
                
                logger.info("extract_text_from_image関数の呼び出し直前")
                print("[PYTHON_DEBUG] extract_text_from_image関数の呼び出し直前", file=sys.stderr, flush=True)
                
                # OCR実行
                text_result = image_analyzer.extract_text_from_image(image=image, **text_options)
                
                logger.info("extract_text_from_image関数の呼び出し完了")
                print("[PYTHON_DEBUG] extract_text_from_image関数の呼び出し完了", file=sys.stderr, flush=True)
                
                # withブロック内でバッファ内容を取得する（重要）
                try:
                    captured_output = output_buffer.getvalue()
                    if captured_output:
                        logger.debug(f"キャプチャした出力（先頭300文字）: {captured_output[:300]}...")
                except Exception as buffer_err:
                    logger.error(f"バッファ読み取りエラー: {buffer_err}")
        except Exception as redirect_err:
            logger.error(f"出力リダイレクトエラー: {redirect_err}", exc_info=True)
            print(f"[PYTHON_DEBUG] 出力リダイレクトエラー: {redirect_err}", file=sys.stderr, flush=True)
            # リダイレクトなしで処理を続行
            text_options = clean_options(options).copy()
            text_options['verbose'] = False
            
            logger.info("リダイレクトなしでのOCR処理再試行")
            print("[PYTHON_DEBUG] リダイレクトなしでのOCR処理再試行", file=sys.stderr, flush=True)
            text_result = image_analyzer.extract_text_from_image(image=image, **text_options)
            logger.info("リダイレクトなしでのOCR処理完了")
            print("[PYTHON_DEBUG] リダイレクトなしでのOCR処理完了", file=sys.stderr, flush=True)
        
        # OCR結果のデータ構造を検証
        logger.info(f"OCR結果タイプ: {type(text_result).__name__}")
        print(f"[PYTHON_DEBUG] OCR結果タイプ: {type(text_result).__name__}", file=sys.stderr, flush=True)
        
        if isinstance(text_result, dict):
            logger.info(f"OCR結果構造: キー={list(text_result.keys())}")
            print(f"[PYTHON_DEBUG] OCR結果構造: キー={list(text_result.keys())}", file=sys.stderr, flush=True)
        
        logger.info("テキスト抽出完了")
        print("[PYTHON_DEBUG] テキスト抽出完了", file=sys.stderr, flush=True)
        
        send_response(request_id, text_result)

    except Exception as e:
        logger.error(f"テキスト抽出中にエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        send_response(request_id, None, f"テキスト抽出エラー: {str(e)}")

def analyze_all(image, options):
    # 開始時間を記録
    start_time = time.time()
    
    result = {
        'success': True,
        'status': 'ok',
        'text': '',
        'textBlocks': [],
        'colors': [],
        'timestamp': datetime.now().isoformat()
    }
            
    logger.info(f"総合分析の実行 - オプション: {options}")
    print(f"総合分析の実行 - オプション: {options}", file=sys.stderr, flush=True)
            
    try:
        # 出力キャプチャバッファを作成
        output_buffer = NonClosingStringIO()
                
        # テキスト抽出
        if not options.get('skip_text', False):
            try:
                logger.info("テキスト抽出処理開始")
                print("テキスト抽出処理開始", file=sys.stderr, flush=True)
                
                # OCR実行前に明示的にPyTorchスレッド数を再設定
                try:
                    import torch
                    torch.set_num_threads(1)
                    logger.info(f"OCR実行前にPyTorchスレッド数を制限: {torch.get_num_threads()}スレッド")
                    print(f"[PYTHON_DEBUG] OCR実行前にPyTorchスレッド数を制限: {torch.get_num_threads()}スレッド", file=sys.stderr, flush=True)
                    
                    # GPUの無効化を明示的に再確認
                    if 'CUDA_VISIBLE_DEVICES' in os.environ:
                        logger.info(f"GPU無効化設定を確認: CUDA_VISIBLE_DEVICES={os.environ['CUDA_VISIBLE_DEVICES']}")
                        print(f"[PYTHON_DEBUG] GPU無効化設定を確認: CUDA_VISIBLE_DEVICES={os.environ['CUDA_VISIBLE_DEVICES']}", file=sys.stderr, flush=True)
                except Exception as thread_err:
                    logger.warning(f"PyTorchスレッド設定エラー: {str(thread_err)}")
                    print(f"[PYTHON_DEBUG] PyTorchスレッド設定エラー: {str(thread_err)}", file=sys.stderr, flush=True)
                
                # ガベージコレクションをOCR実行前に実行
                try:
                    import gc
                    gc.collect()
                    logger.info("OCR実行前にガベージコレクションを実行")
                    print("[PYTHON_DEBUG] OCR実行前にガベージコレクションを実行", file=sys.stderr, flush=True)
                except Exception as gc_err:
                    logger.warning(f"ガベージコレクション実行エラー: {str(gc_err)}")
                    print(f"[PYTHON_DEBUG] ガベージコレクション実行エラー: {str(gc_err)}", file=sys.stderr, flush=True)
                
                try:
                    # 出力をキャプチャしながらOCR実行
                    with redirect_stdout(output_buffer), redirect_stderr(output_buffer):
                        # verbose=False で進捗バーを無効化
                        text_options = clean_options(options).copy()
                        text_options['verbose'] = False
                        
                        logger.info("extract_text_from_image関数の呼び出し直前")
                        print("[PYTHON_DEBUG] extract_text_from_image関数の呼び出し直前", file=sys.stderr, flush=True)
                        
                        # OCR実行
                        text_result = image_analyzer.extract_text_from_image(image=image, **text_options)
                        
                        logger.info("extract_text_from_image関数の呼び出し完了")
                        print("[PYTHON_DEBUG] extract_text_from_image関数の呼び出し完了", file=sys.stderr, flush=True)
                        
                        # withブロック内でバッファ内容を取得する（重要）
                        try:
                            captured_output = output_buffer.getvalue()
                            if captured_output:
                                logger.debug(f"キャプチャした出力（先頭300文字）: {captured_output[:300]}...")
                        except Exception as buffer_err:
                            logger.error(f"バッファ読み取りエラー: {buffer_err}")
                except Exception as redirect_err:
                    logger.error(f"出力リダイレクトエラー: {redirect_err}", exc_info=True)
                    print(f"[PYTHON_DEBUG] 出力リダイレクトエラー: {redirect_err}", file=sys.stderr, flush=True)
                    # リダイレクトなしで処理を続行
                    text_options = clean_options(options).copy()
                    text_options['verbose'] = False
                    
                    logger.info("リダイレクトなしでのOCR処理再試行")
                    print("[PYTHON_DEBUG] リダイレクトなしでのOCR処理再試行", file=sys.stderr, flush=True)
                    text_result = image_analyzer.extract_text_from_image(image=image, **text_options)
                    logger.info("リダイレクトなしでのOCR処理完了")
                    print("[PYTHON_DEBUG] リダイレクトなしでのOCR処理完了", file=sys.stderr, flush=True)
                
                # OCR結果のデータ構造を検証
                logger.info(f"OCR結果タイプ: {type(text_result).__name__}")
                print(f"[PYTHON_DEBUG] OCR結果タイプ: {type(text_result).__name__}", file=sys.stderr, flush=True)
                
                if isinstance(text_result, dict):
                    logger.info(f"OCR結果構造: キー={list(text_result.keys())}")
                    print(f"[PYTHON_DEBUG] OCR結果構造: キー={list(text_result.keys())}", file=sys.stderr, flush=True)
                
                logger.info("テキスト抽出完了")
                print("[PYTHON_DEBUG] テキスト抽出完了", file=sys.stderr, flush=True)
                
                # 結果をマージ
                if isinstance(text_result, dict):
                    if 'text' in text_result:
                        result['text'] = text_result.get('text', '')
                    if 'textBlocks' in text_result:
                        result['textBlocks'] = text_result.get('textBlocks', [])
                    if 'ocr_status' in text_result:
                        result['ocr_status'] = text_result.get('ocr_status')
                else:
                    logger.warning(f"テキスト抽出結果が辞書型ではありません: {type(text_result)}")
            except Exception as text_err:
                logger.error(f"テキスト抽出エラー: {str(text_err)}", exc_info=True)
                result['text_error'] = str(text_err)
        
        # 色抽出
        if not options.get('skip_colors', False):
            try:
                logger.info("色抽出処理開始")
                print("色抽出処理開始", file=sys.stderr, flush=True)
                colors_result = image_analyzer.extract_colors_from_image(image, **options)
                
                # 型チェックを追加して適切に処理
                if isinstance(colors_result, dict):
                    # 辞書型の場合はcolorsキーの値を取得
                    result['colors'] = colors_result.get('colors', [])
                elif isinstance(colors_result, list):
                    # リスト型の場合はそのまま使用
                    result['colors'] = colors_result
                else:
                    # その他の型の場合は空リストにフォールバック
                    logger.warning(f"予期しない色抽出結果の型: {type(colors_result)}")
                    result['colors'] = []
                    
                logger.info(f"色抽出完了: {len(result['colors'])}色")
            except Exception as color_err:
                logger.error(f"色抽出エラー: {str(color_err)}", exc_info=True)
                result['color_error'] = str(color_err)
        
        # 実行時間を記録
        end_time = time.time()
        result['processing_time_ms'] = int((end_time - start_time) * 1000)
        
        return result
    except Exception as e:
        logger.error(f"analyze_all内部処理エラー: {str(e)}", exc_info=True)
        return {
            'success': False,
            'error': f"総合分析エラー: {str(e)}",
            'text': '',
            'textBlocks': [],
            'colors': []
        }

def handle_analyze_all(request_id: str, params: Dict[str, Any]):
    """画像から総合分析を行い、テキストと色情報を返す"""
    try:
        # パフォーマンス計測用タイムスタンプ
        timestamps = {
            "start": time.time(),
            "steps": {}
        }
        
        logger.info(f"===== analyze_all処理開始: ID={request_id} =====")
        emergency_log(f"===== analyze_all処理開始: ID={request_id} =====")
        
        # 画像データを取得
        image_data = params.get('image_data', '')
        options = params.get('options', {})
        clean_opts = clean_options(options)
        
        if not image_data:
            raise ValueError("画像データが提供されていません")
        
        # 開始時間を記録
        start_time = time.time()
        timestamps["steps"]["params_processed"] = time.time() - timestamps["start"]
        
        # 画像をデコード
        logger.info("画像データのデコード開始")
        image, format_name = base64_to_image_data(image_data)
        logger.info(f"画像データのデコード完了: 形式={format_name}")
        timestamps["steps"]["image_decoded"] = time.time() - timestamps["start"]
        
        # 総合分析を実行
        logger.info("総合分析の実行...")
        analysis_start = time.time()
        result = analyze_all(image, clean_opts)
        analysis_duration = time.time() - analysis_start
        timestamps["steps"]["analysis_completed"] = time.time() - timestamps["start"]
        logger.info(f"総合分析の実行完了: 処理時間={analysis_duration:.2f}秒")
        emergency_log(f"総合分析の実行完了: 処理時間={analysis_duration:.2f}秒")

        # 結果の確認
        if result.get('error'):
            logger.warning(f"analyze_all関数内でエラーが発生しましたが、部分的な結果を返します: {result['error']}")
            print(f"analyze_all関数内でエラーが発生しましたが、部分的な結果を返します: {result['error']}", file=sys.stderr, flush=True)
        
        # タイムスタンプ情報を結果に追加
        result['performance'] = {
            'total_processing_time': time.time() - timestamps["start"],
            'steps': timestamps["steps"]
        }
        
        # Windows環境向けに追加のデバッグ情報
        if os.name == 'nt':
            try:
                result_size = len(json.dumps(result))
                logger.info(f"Windows環境: analyze_all関数完了 - 結果サイズ: {result_size}バイト")
                logger.info(f"Windows環境: 結果内容サンプル: colors={len(result.get('colors', []))}個, textBlocks={len(result.get('textBlocks', []))}個")
                print(f"Windows環境: analyze_all関数完了 - 結果サイズ: {result_size}バイト", file=sys.stderr, flush=True)
                sys.stderr.flush()
            except Exception as size_err:
                logger.error(f"結果サイズ計算エラー: {size_err}")
                print(f"[PYTHON_DEBUG] 結果サイズ計算エラー: {size_err}", file=sys.stderr, flush=True)
                emergency_log(f"結果サイズ計算エラー: {size_err}")
                
        timestamps["steps"]["pre_send"] = time.time() - timestamps["start"]
        
        # 送信処理に詳細なエラーハンドリングを追加
        try:
            logger.info("結果を送信します")
            send_start = time.time()
            send_response(request_id, result)
            send_duration = time.time() - send_start
            logger.info(f"結果送信完了: 送信処理時間={send_duration:.2f}秒")
            emergency_log(f"結果送信完了: 送信処理時間={send_duration:.2f}秒")
            timestamps["steps"]["send_completed"] = time.time() - timestamps["start"]
            logger.info(f"===== analyze_all処理完了: ID={request_id}, 総処理時間={(time.time() - timestamps['start']):.2f}秒 =====")
            emergency_log(f"===== analyze_all処理完了: ID={request_id}, 総処理時間={(time.time() - timestamps['start']):.2f}秒 =====")
        except Exception as send_err:
            logger.error(f"send_response中に例外: {send_err}", exc_info=True)
            emergency_log(f"CRITICAL: send_response中に例外: {send_err}\n{traceback.format_exc()}")
            # 例外が発生しても処理を継続し、クライアントにエラーを通知
            try:
                error_result = {
                    "success": False,
                    "error": f"結果送信中にエラー: {str(send_err)}",
                    "timestamp": datetime.now().isoformat()
                }
                print(f"[PYTHON_DEBUG] 送信エラー発生、フォールバック応答を試行", file=sys.stderr, flush=True)
                send_response(request_id, error_result)
            except Exception as fallback_err:
                logger.critical(f"フォールバック送信も失敗: {fallback_err}")
                emergency_log(f"DOUBLE FAILURE: フォールバック送信も失敗: {fallback_err}")
    except Exception as e:
        error_msg = f"analyze_all処理中にエラーが発生: {str(e)}"
        logger.error(error_msg, exc_info=True)
        print(error_msg, file=sys.stderr, flush=True)
        try:
            send_response(request_id, None, error=error_msg)
        except Exception as resp_err:
            logger.critical(f"エラー送信中に例外: {resp_err}")
            emergency_log(f"CRITICAL: エラー送信中に例外: {resp_err}")

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

def handle_compress_analysis(request_id: str, params: Dict[str, Any]):
    """
    画像解析結果を圧縮する
    """
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

def main():
    """メインの実行ループ"""
    try:
        startup_msg = "Pythonサーバーを起動しています..."
        logger.info(startup_msg)
        emergency_log(startup_msg)
        print(f"[PYTHON_DEBUG] {startup_msg}", file=sys.stderr, flush=True)
        
        # 起動情報を直接ファイルに記録
        startup_file = os.path.join(log_dir, f'startup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        with open(startup_file, 'w', encoding='utf-8') as f:
            f.write(f"Python実行環境: {sys.executable}\n")
            f.write(f"カレントディレクトリ: {os.getcwd()}\n")
            f.write(f"システムエンコーディング: {sys.getdefaultencoding()}\n")
            f.write(f"Python: {sys.version}\n")
            f.write(f"Platform: {platform.platform()}\n")
            f.write(f"Log directory: {log_dir}\n")
            f.write(f"Startup time: {datetime.now().isoformat()}\n")
            
        # Windows環境での特別な標準出力処理
        if os.name == 'nt' and not sys.stdin.isatty():
            logger.info("Windows環境でElectronから呼び出されました。標準出力をバイナリモードに設定します。")
            emergency_log("Windows環境でElectronから呼び出されました。標準出力をバイナリモードに設定します。")
            print("[PYTHON_DEBUG] Windows環境での標準出力設定を変更します", file=sys.stderr, flush=True)
            
            # 標準出力をNULLデバイスにリダイレクトする代わりに、バイナリモードに設定
            import msvcrt
            msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
            
            # 初期化テスト
            test_message = {"status": "initialized", "platform": "windows", "timestamp": datetime.now().isoformat()}
            try:
                test_json = json.dumps(test_message, ensure_ascii=False)
                test_bytes = (test_json + '__END__').encode('utf-8')
                sys.stdout.buffer.write(test_bytes)
                sys.stdout.buffer.flush()
                logger.info("Windows標準出力初期化テスト成功")
                emergency_log("Windows標準出力初期化テスト成功")
            except Exception as stdout_err:
                logger.error(f"Windows標準出力初期化テスト失敗: {str(stdout_err)}", exc_info=True)
                emergency_log(f"Windows標準出力初期化テスト失敗: {str(stdout_err)}")
        
        # 画像解析モジュールを初期化
        try:
            init_success = initialize_image_analyzer()
            
            if not init_success:
                error_msg = "画像解析モジュールの初期化に失敗しました。終了します。"
                logger.error(error_msg)
                emergency_log(error_msg)
                return
            
            emergency_log("画像解析モジュールの初期化に成功しました。")
        except Exception as init_error:
            error_msg = f"画像解析モジュールの初期化中に例外が発生しました: {str(init_error)}"
            logger.error(error_msg, exc_info=True)
            emergency_log(f"{error_msg}\n{traceback.format_exc()}")
            return
        
        # 起動完了ログ
        startup_complete_msg = "Pythonサーバーの起動が完了しました。リクエスト待機中..."
        logger.info(startup_complete_msg)
        emergency_log(startup_complete_msg)
        print(f"[PYTHON_DEBUG] {startup_complete_msg}", file=sys.stderr, flush=True)
        
        # 通信確認用カウンター
        response_count = 0
        
        # メインループ
        while True:
            try:
                # 標準入力からリクエストを受け取る
                request = read_request()
                
                # リクエストがない場合は終了
                if request is None:
                    shutdown_msg = "標準入力が閉じられました。終了します。"
                    logger.info(shutdown_msg)
                    emergency_log(shutdown_msg)
                    break
                    
                # リクエストIDの取得
                request_id = request.get('id', str(uuid.uuid4()))
                
                # コマンドの取得
                command = request.get('command')
                
                # コマンド名と引数をログに記録
                param_info = {k: v for k, v in request.items() if k not in ['id', 'command', 'image_data']}
                request_msg = f"コマンド受信: {command} (ID: {request_id}) パラメータ: {param_info}"
                logger.info(request_msg)
                emergency_log(f"リクエスト受信: {command} (ID: {request_id})")
                
                # コマンド実行前のタイムスタンプ
                command_start_time = time.time()
                
                if command == 'extract_colors':
                    handle_extract_colors(request_id, request)
                elif command == 'extract_text':
                    handle_extract_text(request_id, request)
                elif command == 'analyze_sections':
                    handle_analyze_sections(request_id, request)
                elif command == 'analyze_layout':
                    handle_analyze_layout(request_id, request)
                elif command == 'detect_main_sections':
                    handle_detect_main_sections(request_id, request)
                elif command == 'detect_card_elements':
                    handle_detect_card_elements(request_id, request)
                elif command == 'detect_elements':
                    handle_detect_elements(request_id, request)
                elif command == 'analyze_all':
                    handle_analyze_all(request_id, request)
                elif command == 'compare_images':
                    handle_compare_images(request_id, request)
                elif command == 'compress_analysis':
                    handle_compress_analysis(request_id, request)
                elif command == 'exit':
                    handle_exit(request_id, request)
                    break
                elif command == 'check_memory':
                    handle_check_memory(request_id, request)
                elif command == 'check_environment':
                    handle_check_environment(request_id, request)
                elif command == 'setup_environment':
                    handle_setup_environment(request_id, request)
                else:
                    error_msg = f"不明なコマンド: {command}"
                    logger.warning(error_msg)
                    emergency_log(error_msg)
                    send_response(request_id, error=error_msg)
                
                # レスポンス送信後の処理
                response_count += 1
                command_duration = time.time() - command_start_time
                logger.info(f"コマンド完了: {command} (ID: {request_id}) 実行時間: {command_duration:.2f}秒, 累計応答数: {response_count}")
                
                # 大きな処理の場合はGCを明示的に実行
                if command_duration > 5.0:  # 5秒以上かかった場合
                    gc_count = gc.collect()
                    logger.info(f"大きな処理後のGC実行: {gc_count}オブジェクト回収")
                
            except Exception as e:
                error_msg = f"リクエスト処理中にエラーが発生: {str(e)}"
                logger.error(error_msg)
                logger.error(traceback.format_exc())
                emergency_log(f"{error_msg}\n{traceback.format_exc()}")
                try:
                    send_response('error', error=f"リクエスト処理中に予期しないエラーが発生: {str(e)}")
                except:
                    emergency_log("エラー応答の送信に失敗しました")
    
    except Exception as main_error:
        # メイン関数でのクリティカルエラー
        error_msg = f"Pythonサーバーのメイン処理でクリティカルエラーが発生: {str(main_error)}"
        try:
            logger.critical(error_msg, exc_info=True)
        except:
            pass
            
        try:
            emergency_log(f"{error_msg}\n{traceback.format_exc()}")
        except:
            # 最後の手段：カレントディレクトリに直接書き込む
            try:
                with open(f'critical_error_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log', 'w', encoding='utf-8') as f:
                    f.write(f"{error_msg}\n{traceback.format_exc()}")
            except:
                pass
    
    finally:
        # 終了処理
        shutdown_msg = "Pythonサーバーが終了しました。"
        try:
            logger.info(shutdown_msg)
            emergency_log(shutdown_msg)
            print(f"[PYTHON_DEBUG] {shutdown_msg}", file=sys.stderr, flush=True)
        except:
            pass

if __name__ == "__main__":
    main()
