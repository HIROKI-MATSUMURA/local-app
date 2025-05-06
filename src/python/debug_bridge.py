#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
JavaScript-Python間のデバッグブリッジ
標準出力の問題をトラブルシューティングするためのユーティリティ
"""

import os
import sys
import json
import time
import datetime
import threading
import traceback

# ステータスファイルのパス
STATUS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "python_status.json"
)

def write_status(status, details=None):
    """ステータス情報をファイルに書き込む"""
    try:
        data = {
            "status": status,
            "timestamp": datetime.datetime.now().isoformat(),
            "details": details or {},
            "python_executable": sys.executable,
            "working_directory": os.getcwd(),
        }
        
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return True
    except Exception as e:
        print(f"ステータス書き込みエラー: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False

def heartbeat_thread():
    """定期的にステータスファイルを更新するスレッド"""
    count = 0
    while True:
        try:
            count += 1
            write_status("running", {
                "heartbeat_count": count,
                "uptime_seconds": time.time() - start_time
            })
            time.sleep(2)  # 2秒ごとに更新
        except Exception as e:
            print(f"ハートビートエラー: {str(e)}", file=sys.stderr)
            time.sleep(5)  # エラー時は5秒待機

def test_stdout():
    """標準出力のテスト"""
    try:
        print("=== 標準出力テスト ===")
        print(f"タイムスタンプ: {datetime.datetime.now().isoformat()}")
        print(f"Pythonパス: {sys.executable}")
        print(f"カレントディレクトリ: {os.getcwd()}")
        print("テスト完了")
        
        # UTF-8文字も出力
        print("UTF-8テスト: こんにちは世界！")
        
        # JSONデータの出力テスト
        test_data = {
            "message": "テストメッセージ",
            "timestamp": datetime.datetime.now().isoformat(),
            "random_value": 12345
        }
        print(f"JSON出力テスト: {json.dumps(test_data, ensure_ascii=False)}")
        
        # 終了マーカー
        print("__END__")
        sys.stdout.flush()
        
        return True
    except Exception as e:
        print(f"標準出力テストエラー: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False

def main():
    """メイン処理"""
    global start_time
    start_time = time.time()
    
    try:
        # 起動ステータスを記録
        write_status("starting")
        print(f"デバッグブリッジを起動します... ({datetime.datetime.now().isoformat()})")
        sys.stdout.flush()
        
        # ハートビートスレッドを開始
        heartbeat = threading.Thread(target=heartbeat_thread, daemon=True)
        heartbeat.start()
        
        # 標準出力テスト
        test_stdout()
        
        # メインループ - 標準入力からのコマンドを処理
        print("コマンド待機中...")
        sys.stdout.flush()
        
        while True:
            try:
                line = sys.stdin.readline().strip()
                if not line:
                    # 標準入力が閉じられた場合
                    write_status("shutdown", {"reason": "stdin_closed"})
                    break
                
                # コマンドの解析
                if line == "test_stdout":
                    test_stdout()
                elif line == "exit":
                    write_status("shutdown", {"reason": "exit_command"})
                    break
                else:
                    print(f"不明なコマンド: {line}")
                    sys.stdout.flush()
            
            except Exception as e:
                print(f"コマンド処理エラー: {str(e)}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
        
        print("デバッグブリッジを終了します")
        sys.stdout.flush()
        
    except Exception as e:
        # 重大なエラー - ステータスファイルに記録
        write_status("error", {
            "error": str(e),
            "traceback": traceback.format_exc()
        })
        
        print(f"重大なエラー: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

if __name__ == "__main__":
    main() 