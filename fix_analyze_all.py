import re
import os

# ファイルパスを指定
file_path = 'src/python/python_server.py'

# ファイルを読み込む
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# handle_analyze_all関数を抽出
pattern = re.compile(r'def handle_analyze_all\([^)]*\):(.*?)(?=def |$)', re.DOTALL)
match = pattern.search(content)

if match:
    # 元の関数のコード
    original_function = match.group(0)
    print("元の関数を見つけました。")
    
    # 修正された関数のコード
    # try-except内でsend_responseを呼び出すように修正する
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
    
    # ファイルに書き込む
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("handle_analyze_all関数を修正しました。")
    print("修正内容:")
    print("1. send_response()をtryブロック内に移動")
    print("2. 例外処理の追加")
    print("3. ログ出力の強化")
else:
    print("handle_analyze_all関数が見つかりませんでした。") 