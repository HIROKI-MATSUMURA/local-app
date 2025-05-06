#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
超シンプルなログ出力スクリプト
外部ライブラリを使用せず、基本的なPython機能だけでログを出力します
"""

import os
import sys
import datetime
import traceback

def write_log(message):
    """ログをできるだけ確実に書き込む"""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # 書き込み先の候補
    log_paths = [
        # カレントディレクトリ
        f"simple_log_{timestamp}.log",
        # スクリプトと同じディレクトリ
        os.path.join(os.path.dirname(os.path.abspath(__file__)), f"simple_log_{timestamp}.log"),
        # 一時ディレクトリ
        os.path.join(os.environ.get('TEMP', ''), f"simple_log_{timestamp}.log"),
        os.path.join(os.environ.get('TMP', ''), f"simple_log_{timestamp}.log"),
        # logsディレクトリ
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", f"simple_log_{timestamp}.log"),
    ]
    
    # 各パスを試す
    for path in log_paths:
        try:
            # ディレクトリが存在しない場合は作成を試みる
            dir_path = os.path.dirname(path)
            if dir_path and not os.path.exists(dir_path):
                try:
                    os.makedirs(dir_path, exist_ok=True)
                except:
                    pass
            
            # ファイルに書き込み
            with open(path, 'w', encoding='utf-8') as f:
                f.write(f"=== シンプルログ {timestamp} ===\n\n")
                f.write(f"メッセージ: {message}\n\n")
                f.write(f"Pythonパス: {sys.executable}\n")
                f.write(f"Pythonバージョン: {sys.version}\n")
                f.write(f"カレントディレクトリ: {os.getcwd()}\n")
                f.write(f"スクリプトパス: {__file__}\n")
                f.write(f"標準出力エンコーディング: {getattr(sys.stdout, 'encoding', 'unknown')}\n")
                f.write(f"標準エラー出力エンコーディング: {getattr(sys.stderr, 'encoding', 'unknown')}\n\n")
                
                # ファイルシステム情報
                f.write("=== ファイルシステム情報 ===\n")
                try:
                    script_dir = os.path.dirname(os.path.abspath(__file__))
                    f.write(f"スクリプトディレクトリ: {script_dir}\n")
                    
                    # logsディレクトリの確認
                    logs_dir = os.path.join(script_dir, "logs")
                    f.write(f"ログディレクトリパス: {logs_dir}\n")
                    f.write(f"ログディレクトリ存在: {os.path.exists(logs_dir)}\n")
                    
                    if os.path.exists(logs_dir):
                        # ファイル一覧
                        try:
                            files = os.listdir(logs_dir)
                            f.write(f"ログディレクトリ内ファイル数: {len(files)}\n")
                            f.write("ファイル一覧（最大10件）:\n")
                            for i, file in enumerate(sorted(files, reverse=True)):
                                if i >= 10:
                                    break
                                file_path = os.path.join(logs_dir, file)
                                size = os.path.getsize(file_path)
                                mtime = datetime.datetime.fromtimestamp(os.path.getmtime(file_path))
                                f.write(f"  - {file}: {size}バイト, 更新: {mtime.isoformat()}\n")
                        except Exception as e:
                            f.write(f"ファイル一覧取得エラー: {str(e)}\n")
                except Exception as e:
                    f.write(f"ファイルシステム情報取得エラー: {str(e)}\n")
                
                # 環境変数
                f.write("\n=== 環境変数 ===\n")
                for key in ['PATH', 'PYTHONPATH', 'TEMP', 'TMP', 'APPDATA', 'USERPROFILE']:
                    f.write(f"{key}: {os.environ.get(key, 'なし')}\n")
                
            print(f"ログを書き込みました: {path}")
            return path
        except Exception as e:
            print(f"ログ書き込みエラー ({path}): {str(e)}")
            continue
    
    # すべて失敗した場合
    print("すべてのログ書き込み試行が失敗しました")
    return None

def main():
    """メイン処理"""
    try:
        message = "シンプルログ機能テスト"
        if len(sys.argv) > 1:
            message = sys.argv[1]
        
        log_path = write_log(message)
        if log_path:
            print(f"成功: ログを書き込みました: {log_path}")
        else:
            print("失敗: ログを書き込めませんでした")
    except Exception as e:
        print(f"エラー: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main() 