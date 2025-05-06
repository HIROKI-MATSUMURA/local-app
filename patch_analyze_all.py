import re
import os
import sys

def main():
    # ファイルパスを指定
    file_path = 'src/python/python_server.py'
    
    try:
        # ファイルを読み込む
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            print(f"ファイルを読み込みました: {len(content)}バイト")
        
        # handle_analyze_all関数を探す
        # より緩いパターンを使用
        pattern = re.compile(r'def\s+handle_analyze_all\s*\([^)]*\).*?(?=def\s+|$)', re.DOTALL)
        match = pattern.search(content)
        
        if match:
            original_function = match.group(0)
            print(f"handle_analyze_all関数を見つけました: {len(original_function)}バイト")
            print("最初の100文字:")
            print(original_function[:100] + "...")
            
            # 新しい関数の定義
            fixed_function = '''def handle_analyze_all(request_id, image_path, options=None):
    """ 画像からテキストと色を抽出して結果を返す """
    
    if options is None:
        options = {}
    
    try:
        logging.info(f"Windows環境: analyze_all関数の実行開始 {request_id}")
        
        # OCRでテキスト抽出
        text_data = handle_extract_text(None, image_path, options)
        logging.info(f"OCR完了: {len(text_data)} 文字抽出")
        
        # 色抽出
        colors_options = clean_options(options.get('colors', {}))
        extracted_colors = handle_extract_colors(None, image_path, colors_options)
        logging.info(f"色抽出完了: {len(extracted_colors)} 色")
        
        # 結果を作成
        result = {
            'text': text_data,
            'colors': extracted_colors
        }
        
        # 重要: レスポンスの送信をtryブロック内で行う
        send_response(request_id, 'analyze_all', result)
        logging.info(f"analyze_all完了: レスポンス送信済み")
        
    except Exception as e:
        error_msg = f"analyze_all内で例外発生: {str(e)}"
        logging.exception(error_msg)
        send_error(request_id, 'analyze_all', error_msg)
'''
            
            # 関数を置換
            new_content = content.replace(original_function, fixed_function)
            
            # 元のファイルをバックアップ
            backup_path = file_path + '.bak'
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(content)
                print(f"元のファイルをバックアップしました: {backup_path}")
            
            # 修正したファイルを書き込む
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
                print(f"修正したファイルを保存しました: {file_path}")
            
            print("\n修正内容:")
            print("1. send_response()をtryブロック内に移動")
            print("2. 例外処理の追加と強化")
            print("3. ログ出力の強化")
        else:
            # 完全一致しなかった場合、別のアプローチ
            print("関数が正規表現で見つかりませんでした。直接書き込みを試みます。")
            
            # 関数名前だけを探す
            basic_pattern = re.compile(r'def\s+handle_analyze_all\s*\(')
            if basic_pattern.search(content):
                print("関数名は見つかりました。完全置換を試みます。")
                
                # 見つかった場所から次の関数定義までを削除して置き換え
                parts = re.split(r'(def\s+handle_analyze_all\s*\([^)]*\).*?)(?=def\s+)', content, flags=re.DOTALL)
                if len(parts) >= 3:
                    new_content = parts[0] + fixed_function + ''.join(parts[2:])
                    
                    # バックアップ
                    with open(file_path + '.bak2', 'w', encoding='utf-8') as f:
                        f.write(content)
                    
                    # 書き込み
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    
                    print("別方法で関数を置換しました。")
                else:
                    print("関数のパターン分割に失敗しました。")
            else:
                print("handle_analyze_all関数が見つかりませんでした。ファイルの内容を確認してください。")
    
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 