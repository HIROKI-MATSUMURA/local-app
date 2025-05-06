import difflib
import sys

def main():
    # ファイルパス
    original = 'src/python/python_server.py.bak'
    modified = 'src/python/python_server.py'
    
    try:
        # ファイルを読み込む
        with open(original, 'r', encoding='utf-8') as f:
            original_content = f.readlines()
        
        with open(modified, 'r', encoding='utf-8') as f:
            modified_content = f.readlines()
        
        # diffを作成
        diff = difflib.unified_diff(
            original_content, 
            modified_content,
            fromfile='修正前',
            tofile='修正後',
            n=3  # 前後3行のコンテキスト
        )
        
        # 結果を表示
        print("修正前と修正後の違い:")
        print("=====================")
        
        has_diff = False
        for line in diff:
            has_diff = True
            if line.startswith('+'):
                # 追加された行
                print(f"\033[92m{line}\033[0m", end='')  # 緑色
            elif line.startswith('-'):
                # 削除された行
                print(f"\033[91m{line}\033[0m", end='')  # 赤色
            else:
                # 変更なしの行
                print(line, end='')
        
        if not has_diff:
            print("変更はありません。")
            
        # handle_analyze_all関数の現在の状態
        found = False
        print("\n\nhandle_analyze_all関数の現在の状態:")
        print("==============================")
        
        in_function = False
        function_content = []
        
        for line in modified_content:
            if "def handle_analyze_all" in line:
                in_function = True
                found = True
            
            if in_function:
                function_content.append(line)
                
            if in_function and line.strip() == "" and len(function_content) > 1:
                if function_content[-2].strip() == "":
                    in_function = False
        
        if found:
            for line in function_content:
                print(line, end='')
        else:
            print("handle_analyze_all関数が見つかりませんでした。")
            
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 