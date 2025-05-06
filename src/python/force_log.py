#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
緊急ログ出力ユーティリティ
ログが出力されない問題を解決するために、ファイルシステムに直接アクセスします
"""

import os
import sys
import datetime
import traceback
import platform
import glob

def force_log(message):
    """強制的にログを書き込む"""
    try:
        # カレントディレクトリを取得
        current_dir = os.getcwd()
        # スクリプトのディレクトリを取得
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # ログディレクトリの候補
        log_dirs = [
            os.path.join(script_dir, 'logs'),
            os.path.join(os.path.dirname(script_dir), 'logs'),
            os.path.join(current_dir, 'logs'),
            script_dir,
            current_dir
        ]
        
        # 書き込み可能なディレクトリを探す
        writable_dir = None
        for d in log_dirs:
            try:
                if not os.path.exists(d):
                    os.makedirs(d, exist_ok=True)
                test_file = os.path.join(d, 'test_write.tmp')
                with open(test_file, 'w') as f:
                    f.write('test')
                os.remove(test_file)
                writable_dir = d
                break
            except:
                continue
        
        if not writable_dir:
            # どのディレクトリも書き込めない場合、一時ディレクトリを使用
            import tempfile
            writable_dir = tempfile.gettempdir()
        
        # タイムスタンプでファイル名を作成
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = os.path.join(writable_dir, f'force_log_{timestamp}.log')
        
        # ファイルに書き込む
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"[{datetime.datetime.now().isoformat()}] {message}\n")
            f.flush()
        
        return log_file
    except Exception as e:
        # 本当に最後の手段: 標準エラー出力に書き込む
        try:
            sys.stderr.write(f"CRITICAL ERROR in force_log: {str(e)}\n")
            sys.stderr.flush()
        except:
            pass
        return None

def scan_log_files():
    """既存のログファイルをスキャンして結果を返す"""
    log_info = []
    
    try:
        # スクリプトのディレクトリを取得
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # ログディレクトリの候補
        log_dirs = [
            os.path.join(script_dir, 'logs'),
            os.path.join(os.path.dirname(script_dir), 'logs'),
            os.path.join(os.getcwd(), 'logs'),
            script_dir,
            os.getcwd()
        ]
        
        for log_dir in log_dirs:
            if not os.path.exists(log_dir):
                continue
                
            # ログファイルのパターン
            log_patterns = [
                '*.log',
                'python_server_*.log',
                'stderr_*.log',
                'emergency_*.log',
                'force_log_*.log',
                'startup_*.log',
                'critical_error_*.log'
            ]
            
            for pattern in log_patterns:
                files = glob.glob(os.path.join(log_dir, pattern))
                for file_path in files:
                    try:
                        size = os.path.getsize(file_path)
                        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(file_path))
                        
                        # ファイル内容のサンプル（最初の数行）
                        content_sample = ""
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                                lines = []
                                for i, line in enumerate(f):
                                    if i >= 5:  # 最初の5行だけ取得
                                        break
                                    lines.append(line.strip())
                                content_sample = "\n".join(lines)
                        except:
                            content_sample = "<読み取りエラー>"
                        
                        log_info.append({
                            'path': file_path,
                            'size': size,
                            'modified': mtime.isoformat(),
                            'sample': content_sample
                        })
                    except Exception as file_err:
                        log_info.append({
                            'path': file_path,
                            'error': str(file_err)
                        })
    except Exception as e:
        force_log(f"ログファイルスキャン中にエラー: {str(e)}\n{traceback.format_exc()}")
    
    return log_info

def collect_system_info():
    """システム情報を収集"""
    info = {}
    
    try:
        info['python_version'] = sys.version
        info['platform'] = platform.platform()
        info['executable'] = sys.executable
        info['cwd'] = os.getcwd()
        info['script_dir'] = os.path.dirname(os.path.abspath(__file__))
        info['encoding'] = sys.getdefaultencoding()
        info['stdout_encoding'] = getattr(sys.stdout, 'encoding', 'unknown')
        info['stderr_encoding'] = getattr(sys.stderr, 'encoding', 'unknown')
        
        # 環境変数
        info['env'] = {
            'PATH': os.environ.get('PATH', ''),
            'PYTHONPATH': os.environ.get('PYTHONPATH', ''),
            'TEMP': os.environ.get('TEMP', ''),
            'TMP': os.environ.get('TMP', '')
        }
        
        # インストール済みモジュール
        import pkg_resources
        info['installed_packages'] = [
            {'name': d.project_name, 'version': d.version}
            for d in pkg_resources.working_set
        ]
    except Exception as e:
        force_log(f"システム情報収集中にエラー: {str(e)}\n{traceback.format_exc()}")
    
    return info

def check_log_permissions():
    """ログディレクトリのパーミッションを確認"""
    results = {}
    
    try:
        # スクリプトのディレクトリを取得
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # ログディレクトリの候補
        log_dirs = [
            os.path.join(script_dir, 'logs'),
            os.path.join(os.path.dirname(script_dir), 'logs'),
            os.path.join(os.getcwd(), 'logs'),
            script_dir,
            os.getcwd()
        ]
        
        for log_dir in log_dirs:
            if not os.path.exists(log_dir):
                results[log_dir] = {
                    'exists': False,
                    'can_create': None
                }
                try:
                    os.makedirs(log_dir, exist_ok=True)
                    results[log_dir]['can_create'] = True
                except:
                    results[log_dir]['can_create'] = False
                continue
            
            # 読み取り権限
            can_read = os.access(log_dir, os.R_OK)
            # 書き込み権限
            can_write = os.access(log_dir, os.W_OK)
            # 実行権限（ディレクトリ内のファイル一覧取得に必要）
            can_execute = os.access(log_dir, os.X_OK)
            
            # 書き込みテスト
            write_test = None
            try:
                test_file = os.path.join(log_dir, 'perm_test.tmp')
                with open(test_file, 'w') as f:
                    f.write('test')
                os.remove(test_file)
                write_test = True
            except:
                write_test = False
            
            # 部品の一覧
            try:
                contents = os.listdir(log_dir)
                file_count = len([f for f in contents if os.path.isfile(os.path.join(log_dir, f))])
                dir_count = len([d for d in contents if os.path.isdir(os.path.join(log_dir, d))])
            except:
                contents = None
                file_count = None
                dir_count = None
            
            results[log_dir] = {
                'exists': True,
                'can_read': can_read,
                'can_write': can_write,
                'can_execute': can_execute,
                'write_test': write_test,
                'file_count': file_count,
                'dir_count': dir_count
            }
    except Exception as e:
        force_log(f"パーミッション確認中にエラー: {str(e)}\n{traceback.format_exc()}")
    
    return results

def main():
    """メイン処理"""
    try:
        # タイムスタンプ
        timestamp = datetime.datetime.now().isoformat()
        
        # 診断情報の収集
        system_info = collect_system_info()
        log_files = scan_log_files()
        permissions = check_log_permissions()
        
        # レポートの作成
        report = {
            'timestamp': timestamp,
            'system_info': system_info,
            'log_files': log_files,
            'permissions': permissions
        }
        
        # レポートをログに書き込む
        import json
        log_file = force_log(f"ログ診断レポート: {json.dumps(report, indent=2)}")
        
        print(f"診断レポートを作成しました: {log_file}")
        print(f"Pythonパス: {sys.executable}")
        print(f"現在の作業ディレクトリ: {os.getcwd()}")
        print(f"スクリプトディレクトリ: {os.path.dirname(os.path.abspath(__file__))}")
        
        if log_file:
            print(f"ログファイル: {log_file}")
        else:
            print("ログファイルの作成に失敗しました")
    except Exception as e:
        print(f"診断エラー: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main() 