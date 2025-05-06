#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
ファイルベースの出力システム
標準出力が機能しない場合の代替手段
"""

import os
import sys
import json
import time
import datetime
import uuid
import traceback

# 出力ディレクトリのパス
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "output"
)

def ensure_output_dir():
    """出力ディレクトリが存在することを確認"""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
    return OUTPUT_DIR

def write_output(data, prefix="output"):
    """データを出力ファイルに書き込む"""
    try:
        ensure_output_dir()
        
        # 一意のファイル名を生成
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        filename = f"{prefix}_{timestamp}_{unique_id}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        # メタデータを追加
        if isinstance(data, dict):
            data.update({
                "_meta": {
                    "timestamp": datetime.datetime.now().isoformat(),
                    "python_executable": sys.executable,
                    "working_directory": os.getcwd(),
                }
            })
        
        # JSONとして書き込み
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 成功ログ
        with open(os.path.join(OUTPUT_DIR, "write_log.txt"), 'a', encoding='utf-8') as f:
            f.write(f"[{datetime.datetime.now().isoformat()}] 書き込み成功: {filepath}\n")
        
        return filepath
    except Exception as e:
        # エラーログ
        error_path = os.path.join(OUTPUT_DIR, "error_log.txt")
        try:
            with open(error_path, 'a', encoding='utf-8') as f:
                f.write(f"[{datetime.datetime.now().isoformat()}] 書き込みエラー: {str(e)}\n")
                f.write(traceback.format_exc() + "\n")
        except:
            pass
        return None

def read_input(prefix="input", delete_after_read=True):
    """入力ディレクトリからファイルを読み込む"""
    try:
        ensure_output_dir()
        
        # 指定されたプレフィックスのファイルを検索
        pattern = f"{prefix}_*.json"
        files = []
        
        for filename in os.listdir(OUTPUT_DIR):
            if filename.startswith(prefix) and filename.endswith('.json'):
                filepath = os.path.join(OUTPUT_DIR, filename)
                files.append((filepath, os.path.getmtime(filepath)))
        
        if not files:
            return None
        
        # 最も古いファイルを選択
        oldest_file = sorted(files, key=lambda x: x[1])[0][0]
        
        # ファイルを読み込む
        with open(oldest_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 読み込み後に削除（オプション）
        if delete_after_read:
            os.remove(oldest_file)
            
            # 削除ログ
            with open(os.path.join(OUTPUT_DIR, "read_log.txt"), 'a', encoding='utf-8') as f:
                f.write(f"[{datetime.datetime.now().isoformat()}] 読み込み・削除: {oldest_file}\n")
        
        return data
    except Exception as e:
        # エラーログ
        error_path = os.path.join(OUTPUT_DIR, "error_log.txt")
        try:
            with open(error_path, 'a', encoding='utf-8') as f:
                f.write(f"[{datetime.datetime.now().isoformat()}] 読み込みエラー: {str(e)}\n")
                f.write(traceback.format_exc() + "\n")
        except:
            pass
        return None

def create_response(request_id, result=None, error=None):
    """レスポンスデータを作成して出力ファイルに書き込む"""
    response = {
        "id": request_id,
        "result": result,
        "error": error,
        "timestamp": datetime.datetime.now().isoformat()
    }
    
    return write_output(response, prefix="response")

def process_request(request_file):
    """リクエストファイルを処理"""
    try:
        # リクエストを読み込む
        with open(request_file, 'r', encoding='utf-8') as f:
            request = json.load(f)
        
        # リクエストIDを取得
        request_id = request.get('id', str(uuid.uuid4()))
        
        # コマンドを取得
        command = request.get('command')
        
        if not command:
            return create_response(request_id, error="コマンドがありません")
        
        # コマンドを処理
        if command == "echo":
            message = request.get('message', '')
            return create_response(request_id, result={"echo": message})
        
        elif command == "test":
            return create_response(request_id, result={"status": "ok", "test": "成功"})
        
        else:
            return create_response(request_id, error=f"不明なコマンド: {command}")
    
    except Exception as e:
        # 例外の処理
        error_message = f"リクエスト処理エラー: {str(e)}"
        traceback_str = traceback.format_exc()
        
        try:
            request_id = "error"
            if 'request' in locals() and isinstance(request, dict) and 'id' in request:
                request_id = request['id']
            
            return create_response(request_id, error=error_message)
        except:
            # 重大なエラー - 緊急ログに記録
            emergency_log = os.path.join(OUTPUT_DIR, "emergency.log")
            try:
                with open(emergency_log, 'a', encoding='utf-8') as f:
                    f.write(f"[{datetime.datetime.now().isoformat()}] 重大なエラー: {error_message}\n")
                    f.write(traceback_str + "\n")
            except:
                pass
            return None

def watch_for_requests(interval=1.0):
    """リクエストファイルを監視して処理"""
    print(f"リクエスト監視を開始します... 監視ディレクトリ: {OUTPUT_DIR}")
    
    while True:
        try:
            # リクエストファイルを検索
            files = []
            
            if os.path.exists(OUTPUT_DIR):
                for filename in os.listdir(OUTPUT_DIR):
                    if filename.startswith("request_") and filename.endswith('.json'):
                        filepath = os.path.join(OUTPUT_DIR, filename)
                        files.append(filepath)
            
            # リクエストファイルを処理
            for request_file in files:
                try:
                    # レスポンスを作成
                    response_file = process_request(request_file)
                    
                    # リクエストファイルを削除
                    os.remove(request_file)
                    
                    # 処理ログ
                    with open(os.path.join(OUTPUT_DIR, "request_log.txt"), 'a', encoding='utf-8') as f:
                        f.write(f"[{datetime.datetime.now().isoformat()}] リクエスト処理: {request_file} -> {response_file}\n")
                
                except Exception as e:
                    # エラーログ
                    error_path = os.path.join(OUTPUT_DIR, "error_log.txt")
                    try:
                        with open(error_path, 'a', encoding='utf-8') as f:
                            f.write(f"[{datetime.datetime.now().isoformat()}] リクエスト処理エラー ({request_file}): {str(e)}\n")
                            f.write(traceback.format_exc() + "\n")
                    except:
                        pass
            
            # 待機
            time.sleep(interval)
        
        except Exception as e:
            # 監視エラー
            try:
                error_path = os.path.join(OUTPUT_DIR, "error_log.txt")
                with open(error_path, 'a', encoding='utf-8') as f:
                    f.write(f"[{datetime.datetime.now().isoformat()}] 監視エラー: {str(e)}\n")
                    f.write(traceback.format_exc() + "\n")
            except:
                pass
            
            # 少し長めに待機して連続エラーを防止
            time.sleep(5)

def main():
    """メイン処理"""
    try:
        # 出力ディレクトリを確保
        ensure_output_dir()
        
        # 起動メッセージ
        startup_message = {
            "status": "starting",
            "timestamp": datetime.datetime.now().isoformat(),
            "info": {
                "python_executable": sys.executable,
                "working_directory": os.getcwd(),
                "output_directory": OUTPUT_DIR
            }
        }
        
        startup_file = write_output(startup_message, prefix="startup")
        print(f"起動情報を記録しました: {startup_file}")
        
        # 標準出力テスト
        test_message = {
            "message": "このメッセージが表示されれば標準出力は機能しています。",
            "timestamp": datetime.datetime.now().isoformat()
        }
        print(f"標準出力テスト: {json.dumps(test_message, ensure_ascii=False)}")
        
        # リクエスト監視を開始
        watch_for_requests()
    
    except Exception as e:
        # 重大なエラー
        try:
            error_path = os.path.join(OUTPUT_DIR, "critical_error.log")
            with open(error_path, 'a', encoding='utf-8') as f:
                f.write(f"[{datetime.datetime.now().isoformat()}] 重大なエラー: {str(e)}\n")
                f.write(traceback.format_exc() + "\n")
        except:
            pass
        
        print(f"重大なエラー: {str(e)}")
        traceback.print_exc()
        
        # エラーコードで終了
        sys.exit(1)

if __name__ == "__main__":
    main() 