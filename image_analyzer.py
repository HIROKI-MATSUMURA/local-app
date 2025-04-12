#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
画像解析モジュール
基本的な画像解析機能を提供します。
"""

import os
import sys
import base64
import json
import traceback
from io import BytesIO
import numpy as np
from PIL import Image
import cv2
import re
import math
from collections import Counter
import logging

try:
    import pytesseract
    from pytesseract import Output
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False

try:
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

try:
    import tensorflow as tf
    import tensorflow.keras as keras
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

try:
    from skimage.metrics import structural_similarity as ssim
    SKIMAGE_SSIM_AVAILABLE = True
except ImportError:
    SKIMAGE_SSIM_AVAILABLE = False

# 定数定義
MAX_COLORS = 5
RESIZE_WIDTH = 300
MIN_SECTION_HEIGHT_RATIO = 0.05

# 色の役割を定義
COLOR_ROLES = {
    'background': '背景色',
    'text': 'テキスト色',
    'accent': 'アクセント色',
    'primary': 'プライマリ色',
    'secondary': 'セカンダリ色'
}

# OCR誤認識補正用の辞書
OCR_CONFUSION_MAP = {
    '0': 'O',
    'O': '0',
    'l': 'I',
    'I': 'l',
    'rn': 'm',
    'm': 'rn',
    '1': 'l',
    'S': '5',
    '5': 'S',
    'G': '6',
    '6': 'G',
    'B': '8',
    '8': 'B',
    'Z': '2',
    '2': 'Z',
    'vv': 'w',
    'w': 'vv',
    'cl': 'd',
    'ri': 'n',
    'nn': 'm'
}

# UIセクションタイプの定義
SECTION_TYPES = {
    'hero': 'ヒーローセクション',
    'header': 'ヘッダーセクション',
    'footer': 'フッターセクション',
    'nav': 'ナビゲーション',
    'card-grid': 'カードグリッド',
    'features': '特徴説明',
    'about': '概要説明',
    'contact': 'コンタクト',
    'testimonials': '推薦文',
    'pricing': '価格表',
    'gallery': 'ギャラリー',
    'cta': 'コールトゥアクション',
    'faq': 'よくある質問',
    'content': '一般コンテンツ'
}

# EasyOCRのreaderインスタンスをキャッシュ
_easyocr_reader = None

# ロガー設定
logger = logging.getLogger('image_analyzer')

def get_easyocr_reader():
    """EasyOCRのreaderインスタンスを取得（キャッシュ対応）"""
    global _easyocr_reader
    if _easyocr_reader is None and EASYOCR_AVAILABLE:
        try:
            # GPU利用可能な場合はGPUを使用
            _easyocr_reader = easyocr.Reader(['ja', 'en'], gpu=True)
        except:
            try:
                # GPU利用失敗時はCPUモードで再試行
                _easyocr_reader = easyocr.Reader(['ja', 'en'], gpu=False)
                logger.info("EasyOCR: CPUモードで動作します")
            except Exception as e:
                logger.error(f"EasyOCR初期化エラー: {e}")
                return None
    return _easyocr_reader


def decode_image(image_data):
    """base64エンコードされた画像データをデコードしてOpenCV画像に変換"""
    import base64
    import cv2
    import numpy as np

    try:
        # bytesの場合も str に変換しない → base64として扱う必要あり
        if isinstance(image_data, bytes):
            # PythonのBridge経由ではbytesで来ることがあるのでここでbase64処理してOK
            decoded = image_data
        elif isinstance(image_data, str):
            if 'base64,' in image_data:
                image_data = image_data.split('base64,')[1]
            decoded = base64.b64decode(image_data)
        else:
            raise ValueError("画像データはbase64文字列またはbytes形式である必要があります")

        nparr = np.frombuffer(decoded, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        raise ValueError(f"画像のデコードエラー: {e}")


def extract_colors(image_data):
    """
    画像から主要な色を抽出

    Args:
        image_data: Base64エンコードされた画像データ、またはOpenCVイメージ

    Returns:
        list: 主要な色のリスト
    """
    try:
        # 画像データのデコード処理
        if isinstance(image_data, str):
            img_data = decode_image(image_data)
            if not img_data:
                return []
            img = img_data['opencv']
        elif isinstance(image_data, dict) and 'opencv' in image_data:
            img = image_data['opencv']
        elif isinstance(image_data, np.ndarray):
            img = image_data
        else:
            return []

        height, width = img.shape[:2]

        # 処理を高速化するためにリサイズ
        scale = RESIZE_WIDTH / width
        small_img = cv2.resize(img, (0, 0), fx=scale, fy=scale)

        # K-meansクラスタリングで色抽出
        if SKLEARN_AVAILABLE:
            # データを準備
            pixels = small_img.reshape(-1, 3)
            pixels = pixels[:, ::-1]  # BGR to RGB

            # K-meansでクラスタリング
            kmeans = KMeans(n_clusters=MAX_COLORS, n_init=10)
            kmeans.fit(pixels)

            # クラスタの中心点（色）を取得
            colors = kmeans.cluster_centers_

            # クラスタのサイズ（ピクセル数）を取得
            labels = kmeans.labels_
            counts = Counter(labels)

            # 結果を整形
            color_info = []
            total_pixels = len(pixels)

            for i in range(MAX_COLORS):
                rgb = colors[i].astype(int)
                hex_color = '#{:02x}{:02x}{:02x}'.format(rgb[0], rgb[1], rgb[2])

                color_info.append({
                    'rgb': f'rgb({rgb[0]},{rgb[1]},{rgb[2]})',
                    'hex': hex_color,
                    'ratio': counts[i] / total_pixels
                })

            # サイズ順にソート
            color_info.sort(key=lambda x: x['ratio'], reverse=True)

            return color_info
        else:
            # scikit-learnが利用できない場合のフォールバック
            # より単純な方法で色を抽出
            # 色のヒストグラムを計算
            pixels = small_img.reshape(-1, 3)
            color_counts = {}

            for pixel in pixels:
                # 色の量子化（類似色をグループ化）
                quantized = (pixel[0] // 25 * 25, pixel[1] // 25 * 25, pixel[2] // 25 * 25)
                key = f"{quantized[2]},{quantized[1]},{quantized[0]}"  # RGB形式
                color_counts[key] = color_counts.get(key, 0) + 1

            # 頻度順にソート
            sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
            top_colors = sorted_colors[:MAX_COLORS]

            # 結果を整形
            color_info = []
            total_pixels = len(pixels)

            for color_key, count in top_colors:
                r, g, b = map(int, color_key.split(','))
                hex_color = '#{:02x}{:02x}{:02x}'.format(r, g, b)

                color_info.append({
                    'rgb': f'rgb({r},{g},{b})',
                    'hex': hex_color,
                    'ratio': count / total_pixels
                })

            return color_info
    except Exception as e:
        logger.error(f"色抽出エラー: {str(e)}")
        traceback.print_exc()
        return []

def extract_text(image_data):
    """
    画像からテキストを抽出

    Args:
        image_data: Base64エンコードされた画像データ、またはOpenCVイメージ

    Returns:
        dict: 抽出したテキスト情報
    """
    try:
        # 画像データのデコード処理
        if isinstance(image_data, str):
            img_data = decode_image(image_data)
            if not img_data:
                return {'text': '', 'textBlocks': []}
            img = img_data
        elif isinstance(image_data, dict) and 'opencv' in image_data:
            img = image_data['opencv']
        elif isinstance(image_data, np.ndarray):
            img = image_data
        else:
            return {'text': '', 'textBlocks': []}

        # まずEasyOCRで試行（利用可能な場合）
        result = None
        if EASYOCR_AVAILABLE:
            try:
                result = extract_text_with_easyocr(img)
                # ログをprintからloggingに変更
                logging.info("EasyOCRでテキスト抽出完了")
            except Exception as e:
                logging.error(f"EasyOCRでのテキスト抽出に失敗: {e}")
                result = None

        # EasyOCR失敗またはインストールされていない場合はTesseractにフォールバック
        if result is None and TESSERACT_AVAILABLE:
            try:
                result = extract_text_with_tesseract(img)
                logging.info("Tesseractでテキスト抽出完了")
            except Exception as e:
                logging.error(f"Tesseractでのテキスト抽出に失敗: {e}")
                result = {'text': '', 'textBlocks': []}
        elif result is None:
            # どちらのOCRも利用できない場合
            result = {'text': '', 'textBlocks': []}

        return result

    except Exception as e:
        logging.error(f"テキスト抽出エラー: {str(e)}")
        traceback.print_exc()
        return {'text': '', 'textBlocks': []}


def extract_text_with_easyocr(image, min_confidence=0.4):
    """
    EasyOCRを使用して画像からテキストを抽出する

    Args:
        image: 入力画像（NumPy配列）
        min_confidence: 検出するテキストの最小信頼度スコア（デフォルト: 0.4）

    Returns:
        dict: 抽出したテキスト情報
    """
    import easyocr
    import numpy as np
    import cv2
    import tempfile
    import os

    # 画像の前処理を行う
    # グレースケールに変換
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # コントラスト強調（CLAHE）
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # バイラテラルフィルタでノイズ低減（エッジは保持）
    filtered = cv2.bilateralFilter(enhanced, 9, 75, 75)

    # 一時ファイルに保存
    temp_filename = 'temp_ocr_image.jpg'
    cv2.imwrite(temp_filename, filtered)

    try:
        # EasyOCRリーダーの初期化
        reader = easyocr.Reader(['ja', 'en'])

        # テキスト検出の実行（detail=1でバウンディングボックス、テキスト、信頼度を取得）
        results = reader.readtext(temp_filename, detail=1, paragraph=False)

        # 結果の整形とフィルタリング
        text_blocks = []
        full_text = []

        for item in results:
            # バージョンによって戻り値の形式が異なるため、安全に処理
            if len(item) == 3:
                bbox, text, confidence = item
            elif len(item) == 2:
                bbox, text = item
                confidence = 0.5  # デフォルト値（中程度の信頼度）
            else:
                continue  # 不正なデータはスキップ

            # 信頼度が閾値以上の場合のみ処理
            if confidence >= min_confidence:
                # テキストの補正処理
                corrected_text = correct_ocr_text(text)

                # 補正後のテキストが空でなければ結果に追加
                if corrected_text:
                    # バウンディングボックスの座標を取得
                    xs = [pt[0] for pt in bbox]
                    ys = [pt[1] for pt in bbox]
                    x = int(min(xs))
                    y = int(min(ys))
                    width = int(max(xs) - x)
                    height = int(max(ys) - y)

                    text_block = {
                        'text': corrected_text,
                        'confidence': float(confidence),
                        'position': {
                            'x': x,
                            'y': y,
                            'width': width,
                            'height': height
                        }
                    }

                    text_blocks.append(text_block)
                    full_text.append(corrected_text)

        # テキストブロックを信頼度でソート
        text_blocks.sort(key=lambda x: x['confidence'], reverse=True)

        return {
            'text': ' '.join(full_text),
            'textBlocks': text_blocks
        }
    except Exception as e:
        logger.error(f"EasyOCRでの処理中にエラーが発生: {e}")
        traceback.print_exc()
        raise
    finally:
        # 一時ファイルの削除
        try:
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
        except:
            pass


def extract_text_with_tesseract(image):
    """
    Tesseractを使用してテキストを抽出する（既存の実装）

    Args:
        image: OpenCV画像

    Returns:
        dict: 抽出したテキスト情報
    """
    if not TESSERACT_AVAILABLE:
        return {'text': '', 'textBlocks': []}

    # Tesseractの設定
    custom_config = r'--oem 3 --psm 11'

    # OpenCV画像をPIL形式に変換
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(image_rgb)

    # Tesseractでテキスト検出
    data = pytesseract.image_to_data(pil_image, config=custom_config, output_type=Output.DICT)

    # 結果を整形
    text_blocks = []
    combined_text = []

    for i in range(len(data['text'])):
        # 空のテキストをスキップ
        if data['text'][i].strip() == '':
            continue

        # テキスト情報を取得
        text = data['text'][i].strip()
        confidence = float(data['conf'][i]) / 100  # 0-1の範囲に正規化

        # 信頼度が低いものはスキップ
        if confidence < 0.3:
            continue

        # テキストの補正処理
        text = correct_ocr_text(text)

        # バウンディングボックスの情報
        x = data['left'][i]
        y = data['top'][i]
        w = data['width'][i]
        h = data['height'][i]

        text_block = {
            'text': text,
            'confidence': confidence,
            'position': {
                'x': x,
                'y': y,
                'width': w,
                'height': h
            }
        }

        text_blocks.append(text_block)
        combined_text.append(text)

    # テキストブロックを信頼度でソート
    text_blocks.sort(key=lambda x: x['confidence'], reverse=True)

    return {
        'text': ' '.join(combined_text),
        'textBlocks': text_blocks
    }


def correct_ocr_text(text):
    """
    OCRで検出したテキストの一般的な誤りを補正する

    Args:
        text (str): 補正するテキスト

    Returns:
        str: 補正されたテキスト
    """
    if not text or not isinstance(text, str):
        return ""

    # 余分な空白を1つに置換
    corrected = re.sub(r'\s+', ' ', text)

    # 全角/半角の統一化（必要に応じて）
    # 数字は半角に統一
    corrected = re.sub(r'[０-９]', lambda x: chr(ord(x.group(0)) - ord('０') + ord('0')), corrected)

    # アルファベットは半角に統一
    corrected = re.sub(r'[ａ-ｚＡ-Ｚ]', lambda x: chr(ord(x.group(0)) - ord('ａ') + ord('a') if 'ａ' <= x.group(0) <= 'ｚ' else ord(x.group(0)) - ord('Ａ') + ord('A')), corrected)

    # 一般的なOCR誤りの修正
    replacements = {
        'l': '1',  # 数字の文脈で
        'O': '0',  # 数字の文脈で
        'ー': '-',
        '，': ',',
        '．': '.',
        '、': ',',
        '。': '.',
    }

    # テキストの文脈に基づいて置換を適用
    # 数字の文脈かどうかを判定（周囲に数字があるか）
    numeric_context = bool(re.search(r'\d[lO]\d|\d[lO]|[lO]\d', corrected))

    if numeric_context:
        for old, new in replacements.items():
            if old in ['l', 'O']:  # 数字の文脈でのみ置換
                corrected = corrected.replace(old, new)

    # その他の置換はすべてのコンテキストで適用
    for old, new in replacements.items():
        if old not in ['l', 'O']:
            corrected = corrected.replace(old, new)

    # 前後の空白を削除
    corrected = corrected.strip()

    return corrected

def classify_section_type(section_data, all_sections=None, text_blocks=None):
    """
    セクションのタイプを分類する

    Args:
        section_data: セクション情報
        all_sections: すべてのセクション情報（位置関係の参照用）
        text_blocks: 画像内のすべてのテキストブロック

    Returns:
        string: セクションタイプ
    """
    # セクションの位置情報
    position = section_data.get('position', {})
    top = position.get('top', 0)
    height = position.get('height', 0)
    width = position.get('width', 0)

    # セクション内のテキスト情報
    section_texts = []
    text_types = {}  # テキストの種類をカウント

    # セクション内のテキストブロックを抽出
    if text_blocks:
        for block in text_blocks:
            block_pos = block.get('position', {})
            block_y = block_pos.get('y', 0)
            block_height = block_pos.get('height', 0)

            # このテキストブロックがセクション内にあるか確認
            if (block_y >= top and block_y < top + height) or \
               (block_y + block_height > top and block_y + block_height <= top + height):
                text = block.get('text', '').lower()
                section_texts.append(text)

                # テキストブロックの役割を取得
                role = block.get('role', '')
                if role:
                    if role not in text_types:
                        text_types[role] = 0
                    text_types[role] += 1

    # セクション位置に基づく基本分類
    section_index = 0
    total_sections = 1
    if all_sections:
        # このセクションのインデックスを特定
        for i, section in enumerate(all_sections):
            if section == section_data:
                section_index = i
                break
        total_sections = len(all_sections)

    # セクションの相対位置
    is_first = section_index == 0
    is_last = section_index == total_sections - 1

    # 1. 位置による基本分類
    if is_first and top < 200:
        basic_type = 'header'
    elif is_last and top > height * (total_sections - 1) * 0.7:
        basic_type = 'footer'
    else:
        basic_type = 'content'

    # 2. テキスト内容による詳細分類
    # テキストを結合して検索しやすくする
    combined_text = ' '.join(section_texts).lower()

    # キーワードベースの分類
    keyword_types = {
        'hero': ['welcome', 'hero', 'banner', 'main', 'top'],
        'about': ['about', 'story', 'mission', 'who we are', 'philosophy'],
        'features': ['features', 'services', 'what we do', 'benefits', 'advantages'],
        'testimonials': ['testimonial', 'review', 'feedback', 'client', 'what people say'],
        'pricing': ['pricing', 'plan', 'subscription', 'package', 'price', 'cost'],
        'contact': ['contact', 'reach', 'message', 'email', 'phone', 'call', 'touch'],
        'gallery': ['gallery', 'portfolio', 'work', 'project', 'image', 'photo'],
        'cta': ['sign up', 'register', 'join', 'subscribe', 'start', 'try', 'get started'],
        'faq': ['faq', 'question', 'answer', 'common', 'ask']
    }

    for type_name, keywords in keyword_types.items():
        for keyword in keywords:
            if keyword in combined_text:
                return type_name

    # 3. 見出しと要素の組み合わせによる分類
    has_heading = 'heading' in text_types
    has_button = 'button' in text_types or 'cta' in combined_text
    has_form = 'text_input' in text_types or 'form' in combined_text
    has_long_text = 'paragraph' in text_types

    # パターンに基づく分類
    if has_heading and has_button and is_first:
        return 'hero'
    elif has_form and ('contact' in combined_text or 'message' in combined_text):
        return 'contact'
    elif has_button and ('sign' in combined_text or 'join' in combined_text):
        return 'cta'
    elif is_first and basic_type == 'header':
        return 'header'
    elif is_last and basic_type == 'footer':
        return 'footer'
    elif has_long_text and 'about' in combined_text:
        return 'about'

    # 4. UI要素パターンによる分類
    # 要素グループのパターンを検出
    if section_data.get('elements'):
        elements = section_data.get('elements', [])

        # カードパターンの検出
        card_count = sum(1 for e in elements if e.get('type') == 'card')
        if card_count >= 2:
            return 'card-grid'

        # ナビゲーションパターンの検出
        has_nav = any(e.get('type') == 'nav' for e in elements)
        if has_nav:
            return 'nav'

    # 5. デフォルト分類
    # どのパターンにも一致しない場合はセクションの位置に基づく基本タイプを返す
    return basic_type


def analyze_sections(image_data):
    """
    画像のセクションを分析

    Args:
        image_data: Base64エンコードされた画像データ、またはOpenCVイメージ

    Returns:
        dict: セクション情報のリスト
    """
    try:
        # 画像データのデコード処理
        if isinstance(image_data, str):
            img_data = decode_image(image_data)
            if not img_data:
                return {'error': 'Failed to decode image', 'sections': []}
            img = img_data
        elif isinstance(image_data, dict) and 'opencv' in image_data:
            img = image_data['opencv']
        elif isinstance(image_data, np.ndarray):
            img = image_data
        else:
            return {'error': 'Invalid image data format', 'sections': []}

        height, width = img.shape[:2]

        # グレースケールに変換
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # ブラー処理
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # 水平方向のエッジを検出
        sobelx = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
        sobelx = np.abs(sobelx)
        normalized_sobelx = cv2.normalize(sobelx, None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)

        # 水平勾配の平均を計算
        gradient_means = np.mean(normalized_sobelx, axis=1)

        # ピークを検出してセクション境界を特定
        peak_indices = []
        min_peak_value = np.mean(gradient_means) * 1.5
        min_peak_distance = height * 0.05  # 最小ピーク間距離

        for i in range(1, len(gradient_means) - 1):
            if gradient_means[i] > min_peak_value and gradient_means[i] > gradient_means[i - 1] and gradient_means[i] > gradient_means[i + 1]:
                if not peak_indices or i - peak_indices[-1] > min_peak_distance:
                    peak_indices.append(i)

        # 追加の境界として上端と下端を設定
        boundaries = [0] + peak_indices + [height - 1]

        # セクション情報を格納するリスト
        sections = []

        # セクションごとの情報を解析
        for i in range(len(boundaries) - 1):
            top = boundaries[i]
            bottom = boundaries[i + 1]

            # セクションの高さが最小値以下の場合はスキップ
            if (bottom - top) < height * MIN_SECTION_HEIGHT_RATIO:
                continue

            # セクション画像を切り出し
            section_img = img[top:bottom, 0:width]

            # セクションの主要色を取得
            dominant_color = get_dominant_color(section_img)

            # セクション情報を作成
            section = {
                'id': f'section_{i+1}',
                'position': {
                    'top': top,
                    'left': 0,
                    'width': width,
                    'height': bottom - top
                },
                'color': {
                    'dominant': dominant_color
                }
            }

            sections.append(section)

        # テキスト情報を抽出してセクションに関連付け（分類用）
        try:
            text_info = extract_text(image_data)
            text_blocks = text_info.get('textBlocks', [])
        except:
            text_blocks = []

        # セクションの種類を分類
        for section in sections:
            section_type = classify_section_type(section, sections, text_blocks)
            section['section_type'] = section_type

        return {
            'sections': sections
        }
    except Exception as e:
        logger.error(f"セクション分析エラー: {str(e)}")
        traceback.print_exc()
        return {
            'error': str(e),
            'sections': []
        }

def get_dominant_color(img):
    """
    画像の主要な色を抽出

    Args:
        img: OpenCV画像

    Returns:
        dict: 主要な色情報
    """
    # 処理を高速化するためにリサイズ
    scale = min(1.0, 100.0 / max(img.shape[0], img.shape[1]))
    small_img = cv2.resize(img, (0, 0), fx=scale, fy=scale)

    # 色の平均を計算
    pixels = small_img.reshape(-1, 3)
    mean_color = np.mean(pixels, axis=0).astype(int)

    # BGR -> RGB
    r, g, b = mean_color[2], mean_color[1], mean_color[0]
    hex_color = '#{:02x}{:02x}{:02x}'.format(r, g, b)

    return {
        'rgb': f'rgb({r},{g},{b})',
        'hex': hex_color
    }

def analyze_layout(image_data):
    """
    画像のレイアウトパターンを分析

    Args:
        image_data: Base64エンコードされた画像データ、またはOpenCVイメージ

    Returns:
        dict: レイアウト分析結果
    """
    try:
        # 画像データのデコード処理
        if isinstance(image_data, str):
            img_data = decode_image(image_data)
            if not img_data:
                return {'error': 'Failed to decode image'}
            img = img_data['opencv']
        elif isinstance(image_data, dict) and 'opencv' in image_data:
            img = image_data['opencv']
        elif isinstance(image_data, np.ndarray):
            img = image_data
        else:
            return {'error': 'Invalid image data format'}

        height, width = img.shape[:2]

        # セクション分析
        sections = analyze_sections(image_data)

        # 画像の基本情報
        layout_info = {
            'layoutType': 'grid',  # デフォルト値
            'confidence': 0.7,
            'layoutDetails': {
                'dimensions': {
                    'width': width,
                    'height': height,
                    'aspectRatio': width / height if height > 0 else 0
                },
                'sections': sections['sections'],
                'styles': {
                    'colors': extract_colors_from_image(image_data)
                }
            }
        }

        # レイアウトパターンを推測
        aspect_ratio = width / height if height > 0 else 0
        num_sections = len(sections['sections'])

        if aspect_ratio > 2.0:
            layout_info['layoutType'] = 'horizontal_scroll'
            layout_info['confidence'] = 0.8
        elif aspect_ratio < 0.5:
            layout_info['layoutType'] = 'vertical_scroll'
            layout_info['confidence'] = 0.8
        elif num_sections == 0:
            layout_info['layoutType'] = 'single_view'
            layout_info['confidence'] = 0.9
        elif num_sections == 1:
            layout_info['layoutType'] = 'header_content'
            layout_info['confidence'] = 0.7
        elif num_sections == 2:
            layout_info['layoutType'] = 'header_content_footer'
            layout_info['confidence'] = 0.8
        elif num_sections >= 3:
            # エッジ検出と線検出でグリッドを推測
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)

            # ハフ変換で線を検出
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, minLineLength=min(width, height)/4, maxLineGap=20)

            if lines is not None and len(lines) > 10:
                # 水平・垂直線の数をカウント
                h_lines = 0
                v_lines = 0

                for line in lines:
                    x1, y1, x2, y2 = line[0]

                    if abs(y2 - y1) < 10:  # 水平線
                        h_lines += 1
                    elif abs(x2 - x1) < 10:  # 垂直線
                        v_lines += 1

                # グリッドパターンの判定
                if h_lines > 5 and v_lines > 5:
                    layout_info['layoutType'] = 'grid'
                    layout_info['confidence'] = 0.9
                elif h_lines > v_lines:
                    layout_info['layoutType'] = 'list'
                    layout_info['confidence'] = 0.8
                else:
                    layout_info['layoutType'] = 'columns'
                    layout_info['confidence'] = 0.7

        return layout_info
    except Exception as e:
        logger.error(f"レイアウト分析エラー: {str(e)}")
        traceback.print_exc()
        return {
            'error': str(e),
            'layoutType': 'unknown',
            'confidence': 0.5,
            'layoutDetails': {
                'dimensions': {'width': 0, 'height': 0, 'aspectRatio': 0},
                'sections': []
            }
        }

def detect_elements(image_data):
    """
    画像からUIの主要な要素を検出

    Args:
        image_data: Base64エンコードされた画像データ、またはOpenCVイメージ

    Returns:
        dict: 検出された要素
    """
    try:
        # 画像データのデコード処理
        if isinstance(image_data, str):
            img_data = decode_image(image_data)
            if not img_data:
                return {'error': 'Failed to decode image', 'elements': []}
            img = img_data['opencv']
        elif isinstance(image_data, dict) and 'opencv' in image_data:
            img = image_data['opencv']
        elif isinstance(image_data, np.ndarray):
            img = image_data
        else:
            return {'error': 'Invalid image data format', 'elements': []}

        height, width = img.shape[:2]

        # グレースケールに変換
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # エッジ検出
        edges = cv2.Canny(gray, 50, 150)

        # 輪郭検出
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 要素検出結果
        elements = []
        min_area = (width * height) * 0.005  # 最小面積

        for contour in contours:
            area = cv2.contourArea(contour)

            # 小さすぎる輪郭は無視
            if area < min_area:
                continue

            # 輪郭の外接矩形を取得
            x, y, w, h = cv2.boundingRect(contour)

            # アスペクト比を計算
            aspect_ratio = w / h if h > 0 else 0

            # 要素の中心部分の画像を抽出
            element_img = img[y:y+h, x:x+w]

            # 要素の種類を推測
            element_type = classify_element(element_img, aspect_ratio)

            # 要素情報を追加
            elements.append({
                'type': element_type,
                'position': {
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h,
                    'center': [x + w // 2, y + h // 2]
                },
                'color': get_dominant_color(element_img)
            })

        return {'elements': elements}
    except Exception as e:
        logger.error(f"要素検出エラー: {str(e)}")
        traceback.print_exc()
        return {'error': str(e), 'elements': []}

def classify_element(element_img, aspect_ratio):
    """
    UI要素の種類を分類

    Args:
        element_img: 要素の画像
        aspect_ratio: アスペクト比

    Returns:
        str: 要素の種類
    """
    # アスペクト比で大まかに分類
    if aspect_ratio > 5.0:
        return 'header'
    elif aspect_ratio > 3.0:
        return 'text_input'
    elif aspect_ratio < 0.3:
        return 'sidebar'
    elif 0.9 < aspect_ratio < 1.1:
        # ほぼ正方形の場合
        # テキストを含むかチェック
        if TESSERACT_AVAILABLE:
            text = pytesseract.image_to_string(element_img)
            if len(text.strip()) > 0:
                return 'button'
        return 'card'
    else:
        # その他の場合
        if element_img.shape[0] < 100:
            return 'button'
        return 'content_section'

def main():
    """
    コマンドライン引数から機能を実行
    """
    if len(sys.argv) < 3:
        print('使用法: python image_analyzer.py [機能] [ファイルパス]')
        return

    command = sys.argv[1]
    file_path = sys.argv[2]

    try:
        # ファイルからバイナリデータを読み込み
        with open(file_path, 'rb') as f:
            image_data = f.read()

        # OpenCVで画像を読み込み
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"画像ファイルを読み込めませんでした: {file_path}")

        result = None

        # コマンドに応じて機能を実行
        if command == 'extract_colors':
            result = extract_colors(img)
        elif command == 'extract_text':
            result = extract_text(img)
        elif command == 'analyze_sections':
            result = analyze_sections(img)
        elif command == 'analyze_layout':
            result = analyze_layout(img)
        elif command == 'detect_elements':
            result = detect_elements(img)
        elif command == 'analyze_all':
            # すべての分析を実行
            layout = analyze_layout(img)
            elements = detect_elements(img)
            text = extract_text(img)

            result = {
                'layout': layout,
                'elements': elements['elements'],
                'text': text
            }
        else:
            result = {'error': f'Unknown command: {command}'}

        # 結果をJSON形式で出力
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'traceback': traceback.format_exc()
        }))

if __name__ == '__main__':
    main()

# Python Bridge インターフェース用の関数
def extract_colors_from_image(image, **options):
    """
    Python Bridgeインターフェース用の色抽出関数

    Args:
        image: decode_imageの結果、または画像データ
        options: 追加オプション

    Returns:
        list: 色情報のリスト
    """
    try:
        # 画像データが直接渡された場合は処理
        if isinstance(image, str):
            image = decode_image(image)

        # 画像データが適切な形式かチェック
        if isinstance(image, dict) and 'opencv' in image:
            colors = extract_colors(image['opencv'])
        elif isinstance(image, np.ndarray):
            colors = extract_colors(image)
        else:
            colors = extract_colors(image)

        # 詳細なログ出力を追加
        logger.info("========== 色抽出結果の詳細ログ開始 ==========")

        # 抽出された色の数
        logger.info(f"抽出された色の数: {len(colors)}")

        # 各色の詳細をログに出力
        for i, color in enumerate(colors):
            logger.info(f"色 {i+1}:")
            logger.info(f"  RGB: {color.get('rgb', '')}")
            logger.info(f"  HEX: {color.get('hex', '')}")
            logger.info(f"  比率: {color.get('ratio', 0):.4f} ({color.get('ratio', 0)*100:.2f}%)")
            if 'role' in color:
                logger.info(f"  役割: {color.get('role', '不明')}")

        logger.info("========== 色抽出結果の詳細ログ終了 ==========")

        return colors
    except Exception as e:
        logger.error(f"色抽出エラー: {str(e)}")
        traceback.print_exc()
        return []

def extract_text_from_image(image, **options):
    """
    Python Bridgeインターフェース用のテキスト抽出関数

    Args:
        image: decode_imageの結果、または画像データ
        options: 追加オプション

    Returns:
        dict: テキスト情報
    """
    try:
        # 画像データが直接渡された場合は処理
        if isinstance(image, str):
            image = decode_image(image)

        # 画像データが適切な形式かチェック
        if isinstance(image, dict) and 'opencv' in image:
            result = extract_text(image['opencv'])
        elif isinstance(image, np.ndarray):
            result = extract_text(image)
        else:
            result = extract_text(image)

        # 詳細なログ出力を追加
        logger.info("========== 画像解析結果の詳細ログ開始 ==========")

        # テキスト抽出結果の詳細をログに出力
        logger.info(f"抽出されたテキスト全体: {result.get('text', '')}")

        # テキストブロックの詳細をログに出力
        text_blocks = result.get('textBlocks', [])
        logger.info(f"テキストブロック数: {len(text_blocks)}")

        for i, block in enumerate(text_blocks):
            logger.info(f"ブロック {i+1}:")
            logger.info(f"  テキスト: {block.get('text', '')}")
            logger.info(f"  信頼度: {block.get('confidence', 0):.3f}")
            if 'position' in block:
                pos = block['position']
                logger.info(f"  位置: x={pos.get('x', 0)}, y={pos.get('y', 0)}, 幅={pos.get('width', 0)}, 高さ={pos.get('height', 0)}")

        logger.info("========== 画像解析結果の詳細ログ終了 ==========")

        return result
    except Exception as e:
        logger.error(f"テキスト抽出エラー: {str(e)}")
        traceback.print_exc()
        return {
            'text': '',
            'error': str(e),
            'textBlocks': []
        }

def analyze_image_sections(image, **options):
    """
    Python Bridgeインターフェース用の画像セクション分析関数

    Args:
        image: decode_imageの結果、または画像データ
        options: 追加オプション

    Returns:
        dict: セクション情報
    """
    try:
        # 画像データが直接渡された場合は処理
        if isinstance(image, str):
            image = decode_image(image)

        # 画像データが適切な形式かチェック
        if isinstance(image, dict) and 'opencv' in image:
            return analyze_sections(image['opencv'])
        elif isinstance(image, np.ndarray):
            return analyze_sections(image)
        else:
            return analyze_sections(image)
    except Exception as e:
        logger.error(f"セクション分析エラー: {str(e)}")
        traceback.print_exc()
        return {
            'sections': [],
            'error': str(e)
        }

def analyze_layout_pattern(image, **options):
    """
    Python Bridgeインターフェース用のレイアウトパターン分析関数

    Args:
        image: decode_imageの結果、または画像データ
        options: 追加オプション

    Returns:
        dict: レイアウトパターン情報
    """
    try:
        # 画像データが直接渡された場合は処理
        if isinstance(image, str):
            image = decode_image(image)

        # 画像データが適切な形式かチェック
        if isinstance(image, dict) and 'opencv' in image:
            layout = analyze_layout(image['opencv'])
        elif isinstance(image, np.ndarray):
            layout = analyze_layout(image)
        else:
            layout = analyze_layout(image)

        # 詳細なログ出力を追加
        logger.info("========== レイアウト分析結果の詳細ログ開始 ==========")

        # レイアウトタイプと信頼度
        logger.info(f"レイアウトタイプ: {layout.get('layoutType', 'unknown')}")
        logger.info(f"信頼度: {layout.get('confidence', 0):.3f}")

        # レイアウト詳細があれば出力
        if 'layoutDetails' in layout:
            layout_details = layout.get('layoutDetails', {})
            dimensions = layout_details.get('dimensions', {})
            logger.info(f"画像サイズ: 幅={dimensions.get('width', 0)}px, 高さ={dimensions.get('height', 0)}px")

            sections = layout_details.get('sections', [])
            logger.info(f"セクション数: {len(sections)}")

            # 各セクションの詳細
            for i, section in enumerate(sections):
                logger.info(f"セクション {i+1}:")
                section_type = section.get('type', '不明')
                section_pos = section.get('position', {})
                logger.info(f"  タイプ: {section_type}")
                logger.info(f"  位置: top={section_pos.get('top', 0)}, left={section_pos.get('left', 0)}, ")
                logger.info(f"       幅={section_pos.get('width', 0)}, 高さ={section_pos.get('height', 0)}")

                # セクション内の要素があれば出力
                elements = section.get('elements', [])
                if elements:
                    logger.info(f"  要素数: {len(elements)}")

        logger.info("========== レイアウト分析結果の詳細ログ終了 ==========")

        return layout
    except Exception as e:
        logger.error(f"レイアウト分析エラー: {str(e)}")
        traceback.print_exc()
        return {
            'layout': 'unknown',
            'confidence': 0.0,
            'error': str(e)
        }

def detect_feature_elements(image, **options):
    """
    Python Bridgeインターフェース用の特徴要素検出関数

    Args:
        image: decode_imageの結果、または画像データ
        options: 追加オプション

    Returns:
        list: 検出された要素のリスト
    """
    try:
        # 画像データが直接渡された場合は処理
        if isinstance(image, str):
            image = decode_image(image)

        # 画像データが適切な形式かチェック
        if isinstance(image, dict) and 'opencv' in image:
            elements = detect_elements(image['opencv'])
        elif isinstance(image, np.ndarray):
            elements = detect_elements(image)
        else:
            elements = detect_elements(image)

        # 詳細なログ出力を追加
        logger.info("========== 要素検出結果の詳細ログ開始 ==========")

        # 検出された要素の数
        if isinstance(elements, list):
            element_count = len(elements)
        elif isinstance(elements, dict) and 'elements' in elements:
            elements = elements.get('elements', [])
            element_count = len(elements)
        else:
            element_count = 0
            elements = []

        logger.info(f"検出された要素の数: {element_count}")

        # 各要素の詳細をログに出力
        element_types = {}
        for i, element in enumerate(elements):
            logger.info(f"要素 {i+1}:")
            element_type = element.get('type', '不明')
            logger.info(f"  種類: {element_type}")
            logger.info(f"  信頼度: {element.get('confidence', 0):.3f}")

            # 位置情報があれば出力
            if 'position' in element:
                pos = element['position']
                logger.info(f"  位置: x={pos.get('x', 0)}, y={pos.get('y', 0)}, 幅={pos.get('width', 0)}, 高さ={pos.get('height', 0)}")

            # テキスト情報があれば出力
            if 'text' in element:
                logger.info(f"  テキスト: {element.get('text', '')}")

            # 要素タイプの集計
            if element_type not in element_types:
                element_types[element_type] = 0
            element_types[element_type] += 1

        # 要素タイプのサマリーを出力
        logger.info("要素タイプのサマリー:")
        for elem_type, count in element_types.items():
            logger.info(f"  {elem_type}: {count}個")

        logger.info("========== 要素検出結果の詳細ログ終了 ==========")

        return elements
    except Exception as e:
        logger.error(f"特徴要素検出エラー: {str(e)}")
        traceback.print_exc()
        return []

# 新しい関数を追加
def compress_analysis_results(analysis_data, options=None):
    """
    複数の解析結果を統合した圧縮データを生成する

    Args:
        analysis_data: 各種解析結果を含む辞書
        options: 出力オプション（フォーマット形式など）

    Returns:
        dict: 統合された解析結果
    """
    if not options:
        options = {}

    # 出力フォーマットタイプ（structured, semantic, template）
    format_type = options.get('format_type', 'structured')

    try:
        # 基本解析情報
        layout_info = analysis_data.get('layout', {})
        colors = analysis_data.get('colors', [])
        sections = analysis_data.get('sections', [])
        elements = analysis_data.get('elements', {})
        text_blocks = analysis_data.get('text_blocks', [])
        text_content = analysis_data.get('text', '')

        # レイアウト情報を整理
        layout = {
            'width': layout_info.get('width', 1200),
            'height': layout_info.get('height', 800),
            'aspectRatio': layout_info.get('aspectRatio', '3:2'),
            'type': layout_info.get('type', 'standard'),
            'template': layout_info.get('type', 'standard'),  # typeと同じ値をtemplateにも設定
            'gridPattern': layout_info.get('gridPattern', {
                'columns': 12,
                'rows': 'auto',
                'gap': '20px'
            }),
            'sectionCount': len(sections),
            'imagePosition': layout_info.get('imagePosition', 'center'),
            'textPosition': layout_info.get('textPosition', 'center')
        }

        # 色情報を整理（役割の統一）
        normalized_colors = []
        standard_roles = ['background', 'text', 'primary', 'secondary', 'accent', 'highlight']

        # 色の役割を推定・正規化する機能
        def normalize_color_role(color):
            if not color or not isinstance(color, dict):
                return {'rgb': 'rgb(0,0,0)', 'hex': '#000000', 'role': 'text', 'ratio': 0}

            role = color.get('role', '')

            # roleが標準ロールに含まれていない場合は推測
            if not role or role not in standard_roles:
                # 背景色判定: 量が多いor明るい色
                if color.get('ratio', 0) > 0.3 or is_light_color(color.get('rgb', '')):
                    role = 'background'
                # テキスト色判定: 暗い色
                elif not is_light_color(color.get('rgb', '')):
                    role = 'text'
                # アクセント色判定: 彩度が高い色
                elif color.get('saturation', 0) > 0.6:
                    role = 'accent'
                # それ以外はプライマリまたはセカンダリ
                else:
                    existing_roles = [c.get('role') for c in normalized_colors]
                    if 'primary' not in existing_roles:
                        role = 'primary'
                    elif 'secondary' not in existing_roles:
                        role = 'secondary'
                    else:
                        role = 'highlight'

            return {
                'rgb': color.get('rgb', ''),
                'hex': color.get('hex', ''),
                'role': role,
                'ratio': color.get('ratio', 0)
            }

        # 色情報の正規化
        for color in colors:
            normalized_colors.append(normalize_color_role(color))

        # テキスト情報を整理（JS側が期待する構造に変換）
        text_data = {
            'content': text_content,
            'blocks': text_blocks,
            'hierarchy': []
        }

        # テキスト階層の構築
        if text_blocks:
            for block in text_blocks:
                if not isinstance(block, dict):
                    continue

                # ブロックの重要度に基づいてレベルを設定
                importance = block.get('importance', 0)
                size = block.get('fontSize', 0)
                is_bold = block.get('bold', False)

                # レベルの決定（重要度、フォントサイズ、太字かで判断）
                level = 3  # デフォルトはテキスト
                if importance > 0.8 or (size > 24 and is_bold):
                    level = 1  # 見出し
                elif importance > 0.5 or size > 18:
                    level = 2  # 小見出し

                text_data['hierarchy'].append({
                        'level': level,
                    'text': block.get('text', ''),
                    'position': block.get('position', {})
                })
        # テキストブロックがなく全文のみの場合
        elif text_content:
            # 簡易的に最初の行を見出しとして扱う
            lines = text_content.split('\n')
            if lines:
                text_data['hierarchy'].append({
                    'level': 1,
                    'text': lines[0],
                    'position': {'top': 0, 'left': 0}
                })

                # 残りの行をテキストとして扱う
                if len(lines) > 1:
                    text_data['hierarchy'].append({
                        'level': 3,
                        'text': '\n'.join(lines[1:]),
                        'position': {'top': 50, 'left': 0}
                    })

        # 要素情報を整理（elements.elements形式への統一とsummary追加）
        element_list = elements.get('elements', [])
        if not isinstance(element_list, list):
            element_list = []

        # 要素種類ごとのカウント
        element_counts = {
            'button': 0,
            'image': 0,
            'card': 0,
            'navigation': 0,
            'form': 0,
            'list': 0,
            'text': 0,
            'total': len(element_list)
        }

        # 要素カウントの集計
        for element in element_list:
            if not isinstance(element, dict):
                continue

            element_type = element.get('type', '').lower()
            if 'button' in element_type:
                element_counts['button'] += 1
            elif 'image' in element_type or 'img' in element_type:
                element_counts['image'] += 1
            elif 'card' in element_type:
                element_counts['card'] += 1
            elif 'nav' in element_type:
                element_counts['navigation'] += 1
            elif 'form' in element_type or 'input' in element_type:
                element_counts['form'] += 1
            elif 'list' in element_type or 'ul' in element_type or 'ol' in element_type:
                element_counts['list'] += 1
            elif 'text' in element_type or 'paragraph' in element_type:
                element_counts['text'] += 1

        # 要素サマリーの追加
        element_summary = {
            'counts': element_counts,
            'hasForms': element_counts['form'] > 0,
            'hasNavigation': element_counts['navigation'] > 0,
            'hasButtons': element_counts['button'] > 0,
            'hasCards': element_counts['card'] > 0,
            'hasImages': element_counts['image'] > 0,
            'hasLists': element_counts['list'] > 0
        }

        # 最終的なデータ構造の構築
        compressed_data = {
            'layout': layout,
            'colors': normalized_colors,
            'text': text_data,
            'sections': sections,
            'elements': {
                'elements': element_list,
                'summary': element_summary
            }
        }

        # フォーマットタイプに応じた変換
        if format_type == 'semantic':
            return convert_to_semantic_format(compressed_data)
        elif format_type == 'template':
            return convert_to_template_format(compressed_data)

        # デフォルトは構造化データをそのまま返す
        return compressed_data

    except Exception as e:
        logger.error(f"解析データの圧縮中にエラーが発生しました: {str(e)}")
        traceback.print_exc()

        # エラー時の最小限のデータ構造
        return {
            'layout': {
                'width': 1200,
                'height': 800,
                'type': 'standard',
                'template': 'standard'
            },
            'colors': [],
            'text': {
                'content': '',
                'blocks': [],
                'hierarchy': []
            },
            'sections': [],
            'elements': {
                'elements': [],
                'summary': {
                    'counts': {'total': 0},
                    'hasNavigation': False,
                    'hasForms': False
                }
            },
            'error': str(e)
        }

def convert_to_semantic_format(compressed_data):
    """
    圧縮データをセマンティックタグ形式に変換

    Args:
        compressed_data: 圧縮済みデータ

    Returns:
        str: セマンティックタグ形式の文字列
    """
    result = []

    # レイアウト情報
    layout = compressed_data.get('layout', {})
    result.append(f"[layout:{layout.get('template', 'unknown')}]")

    if layout.get('imagePosition'):
        result.append(f"[image-position:{layout.get('imagePosition')}]")

    if layout.get('textPosition'):
        result.append(f"[text-position:{layout.get('textPosition')}]")

    # テキスト階層
    text_data = compressed_data.get('text', {})
    for item in text_data.get('hierarchy', []):
        level = item.get('level', 3)
        text = item.get('text', '')

        if level == 1:
            result.append(f"[heading] {text}")
        elif level == 2:
            result.append(f"[subheading] {text}")
        else:
            result.append(f"[text] {text}")

    # 色情報
    colors = compressed_data.get('colors', [])
    color_parts = []
    for color in colors:
        role = color.get('role', '')
        hex_code = color.get('hex', '')
        if role and hex_code:
            color_parts.append(f"{role}={hex_code}")

    if color_parts:
        result.append(f"[colors:{','.join(color_parts)}]")

    return "\n".join(result)


def convert_to_template_format(compressed_data):
    """
    圧縮データをテンプレート形式に変換

    Args:
        compressed_data: 圧縮済みデータ

    Returns:
        str: テンプレート形式の文字列
    """
    result = []

    # レイアウトテンプレート
    layout = compressed_data.get('layout', {})
    result.append(f"{{{{layout:{layout.get('template', 'unknown')}}}}}")

    # 見出し
    headings = []
    subheadings = []
    body_texts = []

    text_data = compressed_data.get('text', {})
    for item in text_data.get('hierarchy', []):
        level = item.get('level', 3)
        text = item.get('text', '')

        if level == 1:
            headings.append(text)
        elif level == 2:
            subheadings.append(text)
        else:
            body_texts.append(text)

    if headings:
        result.append(f"{{{{heading:{headings[0]}}}}}")

    if subheadings:
        result.append(f"{{{{subheading:{' / '.join(subheadings)}}}}}")

    if body_texts:
        result.append(f"{{{{body:{' / '.join(body_texts)}}}}}")

    # 色情報
    colors = compressed_data.get('colors', [])
    color_parts = []
    for color in colors:
        role = color.get('role', '')
        hex_code = color.get('hex', '')
        if role and hex_code:
            short_role = role[0:2] if role in ['background', 'primary', 'secondary'] else role
            color_parts.append(f"{short_role}={hex_code}")

    if color_parts:
        result.append(f"{{{{colors:{','.join(color_parts)}}}}}")

    return "\n".join(result)

def is_saturated(rgb_values, threshold=0.5):
    """
    RGB値から色の彩度が高いかどうかを判定する

    Args:
        rgb_values: (R, G, B)のタプルまたはリスト
        threshold: 彩度判定の閾値（0.0〜1.0）

    Returns:
        bool: 彩度が閾値以上の場合はTrue
    """
    if not rgb_values or not isinstance(rgb_values, (list, tuple)) or len(rgb_values) != 3:
        return False

    try:
        r, g, b = rgb_values

        # RGBからHSVに変換
        r, g, b = r / 255.0, g / 255.0, b / 255.0
        max_val = max(r, g, b)
        min_val = min(r, g, b)
        delta = max_val - min_val

        # 彩度の計算
        if max_val == 0:
            saturation = 0.0
        else:
            saturation = delta / max_val

        return saturation >= threshold
    except:
        return False

def merge_similar_colors(colors, max_colors=5):
    """類似する色をマージして代表的な色に集約する"""
    if not colors:
        return []

    # 既に最大色数以下ならそのまま返す
    if len(colors) <= max_colors:
        return colors

    # 色相と彩度でグループ化（LAB色空間が理想だが、簡略化のためRGBベース）
    from sklearn.cluster import KMeans
    import numpy as np

    # RGB値を抽出
    rgb_values = []
    for color in colors:
        rgb_str = color.get('rgb', '')
        # 'rgb(r,g,b)' 形式から数値を抽出
        if 'rgb(' in rgb_str and ')' in rgb_str:
            rgb_parts = rgb_str.replace('rgb(', '').replace(')', '').split(',')
            if len(rgb_parts) == 3:
                try:
                    r, g, b = map(int, rgb_parts)
                    rgb_values.append([r, g, b])
                except ValueError:
                    continue

    if not rgb_values:
        return colors[:max_colors]

    # KMeansで色をクラスタリング
    rgb_array = np.array(rgb_values)
    kmeans = KMeans(n_clusters=max_colors, n_init=10)
    kmeans.fit(rgb_array)

    # 各クラスタの代表色とそれに属する元の色のインデックスを取得
    cluster_centers = kmeans.cluster_centers_.astype(int)
    labels = kmeans.labels_

    # 新しい色情報を作成
    merged_colors = []
    for i in range(max_colors):
        # このクラスタに属する色のインデックスを取得
        indices = [j for j, label in enumerate(labels) if label == i]
        if not indices:
            continue

        # このクラスタの代表的なRGB値
        r, g, b = cluster_centers[i]
        hex_color = '#{:02x}{:02x}{:02x}'.format(r, g, b)

        # このクラスタに属する色の合計比率を計算
        total_ratio = sum(colors[j]['ratio'] for j in indices if j < len(colors))

        merged_colors.append({
            'rgb': f'rgb({r},{g},{b})',
            'hex': hex_color,
            'ratio': total_ratio
        })

    # 比率でソート
    merged_colors.sort(key=lambda x: x['ratio'], reverse=True)

    return merged_colors


def estimate_color_roles(colors, analysis_data=None):
    """
    色に対して想定される役割（背景、前景、アクセント等）を推定します。

    Args:
        colors: 色情報のリスト
        analysis_data: 全体の解析データ（オプション）

    Returns:
        list: 役割が追加された色のリスト
    """
    logger.info("🎭 色の役割推定処理を開始（estimate_color_roles）")

    # 色が空の場合は空のリストを返す
    if not colors or len(colors) == 0:
        logger.info("⚠️ 色情報がありません")
        return []

    # 色情報を比率でソート
    sorted_colors = sorted(colors, key=lambda x: x.get('ratio', 0), reverse=True)

    # 役割が追加された色リスト
    colors_with_roles = []

    # 使用済みの役割を追跡
    used_roles = set()

    # 各色に役割を割り当て
    for idx, color in enumerate(sorted_colors):
        hex_color = color.get('hex', '')
        ratio = color.get('ratio', 0)

        # RGB値の取得（存在する場合）
        rgb_values = None
        if 'rgb' in color:
            rgb_str = color['rgb']
            # rgb(r,g,b)形式から数値を抽出
            import re
            rgb_match = re.match(r'rgb\((\d+),(\d+),(\d+)\)', rgb_str)
            if rgb_match:
                r, g, b = map(int, rgb_match.groups())
                rgb_values = (r, g, b)

        # 明度の計算（RGB値がある場合）
        brightness = 0
        if rgb_values:
            r, g, b = rgb_values
            brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        # 役割の初期化
        role = "unknown"

        # 最も多い色は通常背景色
        if idx == 0 and ratio > 0.3:
            role = "background"
        # 2番目に多い色で明度が低い場合はテキスト色
        elif idx == 1 and brightness < 0.5 and ratio > 0.05:
            role = "text"
        # 2番目に多い色で明度が高い場合は前景色
        elif idx == 1 and brightness >= 0.5 and ratio > 0.05:
            role = "foreground"
        # 使用率が低く、彩度が高い色はアクセント色
        elif ratio < 0.1 and idx > 1 and is_saturated(rgb_values) and "accent" not in used_roles:
            role = "accent"
        # 3番目以降の使用率が中程度の色は補助色
        elif idx >= 2 and ratio > 0.05 and ratio < 0.3:
            role = "secondary"
        # 使用率が非常に低い色は装飾色
        elif ratio < 0.05:
            role = "decorative"

        # 文脈に基づく役割の調整
        # 例：画像が写真の場合は異なる解釈をする
        if analysis_data and 'imageType' in analysis_data:
            image_type = analysis_data.get('imageType', '')
            if image_type == 'photo':
                # 写真の場合の役割調整
                if idx == 0:
                    role = "dominant"
                elif idx == 1:
                    role = "secondary"
                elif is_saturated(rgb_values) and ratio > 0.05:
                    role = "accent"
            elif image_type == 'screenshot':
                # スクリーンショットの場合の役割調整
                if idx == 0 and brightness > 0.8:
                    role = "background"
                elif idx == 1 and brightness < 0.2:
                    role = "text"

        # 使用済み役割に追加
        used_roles.add(role)

        # 役割を色情報に追加
        color_with_role = color.copy()
        color_with_role['role'] = role
        colors_with_roles.append(color_with_role)

        logger.info(f"🎨 色 {idx+1}: HEX={hex_color}, 比率={ratio:.2f}({ratio*100:.1f}%), 役割={role}")

    logger.info(f"✅ 色の役割推定処理が完了しました（全{len(colors_with_roles)}色）")
    return colors_with_roles

def estimate_text_role(text_block, all_blocks):
    """テキストブロックの役割（見出し、本文など）を推定する"""
    if not text_block:
        return 'unknown'

    text = text_block.get('text', '')
    position = text_block.get('position', {})
    confidence = text_block.get('confidence', 0)

    # テキストが空か信頼度が低い場合
    if not text or confidence < 0.3:
        return 'unknown'

    # 位置情報
    y_position = position.get('y', 0)
    height = position.get('height', 0)
    width = position.get('width', 0)

    # テキストの長さ
    text_length = len(text)

    # 大文字比率
    uppercase_ratio = sum(1 for c in text if c.isupper()) / max(1, len(text))

    # 見出しの特徴: 短いテキスト、上部にある、大きなフォント
    if (text_length < 30 and y_position < 200 and height > 20) or uppercase_ratio > 0.7:
        return 'heading'

    # サブ見出しの特徴: 中程度の長さ、中程度のフォント
    elif text_length < 100 and 10 < height < 20:
        return 'subheading'

    # ボタンテキストの特徴: 非常に短いテキスト、特定のキーワード
    elif text_length < 20 and any(keyword in text.lower() for keyword in ['submit', 'login', 'sign', 'buy', 'view', 'more', 'click', 'go']):
        return 'button'

    # リンクテキストの特徴
    elif any(keyword in text.lower() for keyword in ['http', 'www', '.com', '.jp']):
        return 'link'

    # 本文テキストの特徴: 長いテキスト
    elif text_length > 100:
        return 'paragraph'

    # その他のラベルテキスト
    elif text_length < 50:
        return 'label'

    # デフォルト
    return 'text'


def detect_grid_pattern(layout_details):
    """レイアウトからグリッドパターンを検出する"""
    # 画像のサイズ情報を取得
    dimensions = layout_details.get('dimensions', {})
    width = dimensions.get('width', 0)
    height = dimensions.get('height', 0)

    if not width or not height:
        return {'type': 'unknown'}

    # アスペクト比に基づいて基本レイアウトタイプを推定
    aspect_ratio = width / height if height > 0 else 0

    # セクション情報を取得
    sections = layout_details.get('sections', [])
    num_sections = len(sections)

    # 基本的なグリッドパターンを推定
    if aspect_ratio > 2.0:
        grid_type = 'horizontal'
        column_count = min(num_sections, 4)
        row_count = 1
    elif aspect_ratio < 0.5:
        grid_type = 'vertical'
        column_count = 1
        row_count = min(num_sections, 4)
    elif num_sections <= 1:
        grid_type = 'single'
        column_count = 1
        row_count = 1
    elif num_sections <= 3:
        # ヘッダー・コンテンツ・フッター構造の可能性
        grid_type = 'header_content_footer'
        column_count = 1
        row_count = num_sections
    else:
        # セクションの位置関係から列数を推定
        columns = estimate_column_count(sections, width)
        grid_type = 'grid'
        column_count = columns
        row_count = max(1, num_sections // columns)

    return {
        'type': grid_type,
        'columns': column_count,
        'rows': row_count,
        'aspect_ratio': aspect_ratio
    }


def estimate_column_count(sections, total_width):
    """セクションの配置から列数を推定する"""
    if not sections or total_width == 0:
        return 1

    # 各セクションの水平方向の中心位置を取得
    centers = []
    for section in sections:
        position = section.get('position', {})
        left = position.get('left', 0)
        width = position.get('width', 0)
        if width > 0:
            center_x = left + width / 2
            centers.append(center_x)

    if not centers:
        return 1

    # 中心位置のクラスタリングで列を推定
    from sklearn.cluster import KMeans
    import numpy as np

    # 1列から4列までのクラスタリングを試して最適な列数を見つける
    best_columns = 1
    best_score = float('inf')

    for columns in range(1, min(5, len(centers) + 1)):
        X = np.array(centers).reshape(-1, 1)
        kmeans = KMeans(n_clusters=columns, n_init=10)
        kmeans.fit(X)

        # クラスタ内の分散を評価スコアとして使用
        score = kmeans.inertia_
        normalized_score = score / columns  # 列数で正規化

        if normalized_score < best_score * 0.7:  # 70%以上の改善があれば採用
            best_score = normalized_score
            best_columns = columns

    return best_columns


def summarize_sections(sections):
    """セクション情報のサマリーを作成する"""
    if not sections:
        return []

    summaries = []
    for i, section in enumerate(sections):
        position = section.get('position', {})
        color = section.get('color', {}).get('dominant', {})

        # ポジションから相対的な位置を推定
        relative_position = 'unknown'
        top = position.get('top', 0)
        height = position.get('height', 0)

        if 'top' in position:
            if i == 0:
                relative_position = 'top'
            elif i == len(sections) - 1:
                relative_position = 'bottom'
            else:
                relative_position = 'middle'

        # セクションタイプを取得（存在する場合）または推定
        section_type = section.get('section_type', '')
        if not section_type:
            # セクションタイプがない場合、位置ベースで推定
            if i == 0 and top < 150:
                section_type = 'header'
            elif i == len(sections) - 1 and height < 200:
                section_type = 'footer'
            elif height < 100:
                section_type = 'divider'
            else:
                section_type = 'content'

        summaries.append({
            'index': i,
            'type': section_type,
            'position': relative_position,
            'height': height,
            'color': color.get('hex', '') if color else ''
        })

    return summaries

def compare_images(original_image, rendered_image, mask=None):
    """
    原画像とレンダリング画像を比較して類似度を評価する

    Args:
        original_image: オリジナル画像（OpenCVイメージ）
        rendered_image: レンダリングされた画像（OpenCVイメージ）
        mask: 比較時に使用するマスク画像（オプション）

    Returns:
        dict: 類似度評価結果
    """
    try:
        # 両方の画像が存在するか確認
        if original_image is None or rendered_image is None:
            return {
                'success': False,
                'error': 'One or both images are missing',
                'ssim_score': 0,
                'differences': None
            }

        # 画像サイズを一致させる
        height_orig, width_orig = original_image.shape[:2]
        height_rendered, width_rendered = rendered_image.shape[:2]

        # サイズが異なる場合は、レンダリング画像をオリジナルのサイズにリサイズ
        if height_orig != height_rendered or width_orig != width_rendered:
            rendered_image = cv2.resize(rendered_image, (width_orig, height_orig),
                                        interpolation=cv2.INTER_AREA)

        # グレースケールに変換
        original_gray = cv2.cvtColor(original_image, cv2.COLOR_BGR2GRAY)
        rendered_gray = cv2.cvtColor(rendered_image, cv2.COLOR_BGR2GRAY)

        # SSIM（構造的類似性）の計算
        if SKIMAGE_SSIM_AVAILABLE:
            score, diff = ssim(original_gray, rendered_gray, full=True)
            diff = (diff * 255).astype("uint8")
        else:
            # SSIMが利用できない場合は、簡易的な比較を行う
            diff = cv2.absdiff(original_gray, rendered_gray)
            score = 1.0 - (np.sum(diff) / (255.0 * diff.size))

        # 差分のヒートマップを作成
        heatmap = cv2.applyColorMap(diff, cv2.COLORMAP_JET)

        # 分析結果用に差分の大きいエリアを特定
        threshold = 50  # 差分の閾値
        _, thresholded = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

        # 差分の大きい領域を検出
        contours, _ = cv2.findContours(thresholded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 差分エリアの情報を収集
        difference_areas = []
        for contour in contours:
            # 十分な大きさの領域のみ処理
            if cv2.contourArea(contour) > 100:  # 小さすぎる差分は無視
                x, y, w, h = cv2.boundingRect(contour)
                difference_areas.append({
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h),
                    'area': int(cv2.contourArea(contour))
                })

        # 差分エリアを面積順にソート
        difference_areas.sort(key=lambda x: x['area'], reverse=True)

        # 結果をまとめる
        return {
            'success': True,
            'ssim_score': float(score),
            'is_similar': score >= 0.85,  # 類似性の閾値
            'differences': difference_areas[:5],  # 上位5つの差分エリアを返す
            'diff_heatmap': heatmap  # 差分のヒートマップ
        }

    except Exception as e:
        logger.error(f"画像比較エラー: {str(e)}")
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'ssim_score': 0,
            'differences': None
        }


def generate_feedback(comparison_result):
    """
    比較結果に基づいてClaudeへのフィードバックを生成する

    Args:
        comparison_result: 画像比較結果

    Returns:
        string: Claudeへのフィードバック文
    """
    if not comparison_result['success']:
        return "比較処理中にエラーが発生しました。コードを確認して再生成してください。"

    ssim_score = comparison_result['ssim_score']
    differences = comparison_result['differences']

    if ssim_score >= 0.95:
        return "レンダリング結果は元のデザインにとても近いです。素晴らしい再現性です。"

    if ssim_score >= 0.85:
        return "レンダリング結果は元のデザインに十分近いですが、細かい調整の余地があります。"

    # フィードバックのベース部分
    feedback = f"レンダリング結果と元のデザインには相違点があります（類似度スコア: {ssim_score:.2f}）。\n"

    # 差分エリアに基づくフィードバックを追加
    if differences and len(differences) > 0:
        feedback += "以下の部分で主な相違が見られます：\n"

        for i, area in enumerate(differences[:3]):  # 最大3つのエリアについてフィードバック
            x, y, width, height = area['x'], area['y'], area['width'], area['height']

            # エリアの位置に基づいてセクションを推測
            position_desc = "上部" if y < 300 else "中央部" if y < 600 else "下部"

            # 相対的な位置を追加
            horizontal_pos = "左側" if x < 300 else "中央" if x < 600 else "右側"

            feedback += f"{i+1}. デザインの{position_desc}{horizontal_pos}（座標: x={x}, y={y}, 幅={width}, 高さ={height}）のエリアを確認してください。\n"

        # 一般的な修正提案
        feedback += "\n考えられる問題点：\n"
        feedback += "- 要素の配置やサイズが元のデザインと異なっている\n"
        feedback += "- 色やコントラストが正確に再現されていない\n"
        feedback += "- フォントやテキストスタイルが元のデザインと一致していない\n"
        feedback += "- 余白やパディングが異なっている\n"

        # 修正アドバイス
        feedback += "\n改善のためのアドバイス：\n"
        feedback += "- 要素の位置とサイズを元のデザインに合わせて調整する\n"
        feedback += "- 色やグラデーションを正確に再現する\n"
        feedback += "- 適切なフォントサイズとウェイトを設定する\n"
        feedback += "- 余白やパディングを元のデザインに合わせる\n"

    return feedback

def analyze_layout_structure(text_blocks, image_sections=None):
    """
    テキストと画像ブロックの位置を元に、レイアウト構造を推定する

    Args:
        text_blocks: テキストブロックのリスト
        image_sections: 画像ブロックのリスト (省略可能)

    Returns:
        dict: レイアウト構造情報
    """
    logger.info("========== レイアウト構造解析開始 ==========")
    logger.info(f"テキストブロック数: {len(text_blocks) if text_blocks else 0}")
    logger.info(f"画像セクション数: {len(image_sections) if image_sections else 0}")

    layout_type = "single-column"
    image_pos = None
    text_pos = "center"

    # テキストブロックが存在しない場合は早期リターン
    if not text_blocks or len(text_blocks) == 0:
        logger.info("テキストブロックがありません - レイアウト解析を中止します")
        result = {
            "layoutType": "unknown",
            "hasImage": bool(image_sections),
            "imagePosition": None,
            "textPosition": None,
            "sectionCount": 0
        }
        logger.info(f"レイアウト構造解析結果: {result}")
        logger.info("========== レイアウト構造解析終了 ==========")
        return result

    # カラム推定（X座標に偏りがあるかどうか）
    x_positions = [block['position']['x'] for block in text_blocks if 'position' in block]
    if not x_positions:
        logger.info("有効な位置情報を持つテキストブロックがありません")
        result = {
            "layoutType": "unknown",
            "hasImage": bool(image_sections),
            "imagePosition": None,
            "textPosition": None,
            "sectionCount": 0
        }
        logger.info(f"レイアウト構造解析結果: {result}")
        logger.info("========== レイアウト構造解析終了 ==========")
        return result

    avg_x = sum(x_positions) / len(x_positions)
    left_count = len([x for x in x_positions if x < avg_x])
    right_count = len([x for x in x_positions if x >= avg_x])

    logger.info(f"X座標分析: 平均={avg_x:.1f}, 左側={left_count}個, 右側={right_count}個")

    # 画面中央からの水平バランスで判定
    # (このロジックは画面サイズに応じて調整する必要がある)
    if abs(left_count - right_count) > 1:
        layout_type = "two-column"
        text_pos = "right" if left_count < right_count else "left"
        logger.info(f"テキスト偏り検出: {text_pos}側に偏っています → 2カラムレイアウト")
    else:
        logger.info("テキスト分布は均等 → 1カラムレイアウト")

    # グリッドレイアウトの検出
    # テキストブロックのY座標を分析して規則的なグリッドかどうかを判定
    y_positions = [block['position']['y'] for block in text_blocks if 'position' in block]
    y_positions.sort()
    logger.info(f"Y座標ソート結果: {y_positions}")

    # 隣接する要素間のY座標の差を計算
    y_diffs = [y_positions[i+1] - y_positions[i] for i in range(len(y_positions)-1)]

    if y_diffs:
        logger.info(f"Y座標の差分: {y_diffs}")
        avg_diff = sum(y_diffs) / len(y_diffs)
        logger.info(f"Y座標の平均差分: {avg_diff:.1f}px")

        # 差が一定の値に近いかどうかを確認 (グリッドの特徴)
        if len(y_diffs) > 2:
            avg_diff = sum(y_diffs) / len(y_diffs)
            regular_spacing = all(abs(diff - avg_diff) < avg_diff * 0.3 for diff in y_diffs)

            if regular_spacing:
                logger.info("Y方向に等間隔配置を検出")
            else:
                logger.info("Y方向の間隔は不規則")

            # 横方向の位置も考慮して、カードグリッドかどうかを判定
            x_clusters = {}
            for block in text_blocks:
                if 'position' in block:
                    pos = block['position']
                    x_cluster = pos['x'] // 100  # 100px単位でクラスタリング
                    if x_cluster not in x_clusters:
                        x_clusters[x_cluster] = 0
                    x_clusters[x_cluster] += 1

            logger.info(f"X方向クラスター: {x_clusters}")

            # 複数の横方向クラスターがあり、縦方向が等間隔ならグリッド
            if len(x_clusters) > 1 and regular_spacing:
                layout_type = "card-grid"
                logger.info("縦方向の等間隔と複数の横方向クラスターを検出 → カードグリッドレイアウト")

    # 画像位置の判定（あれば）
    if image_sections:
        logger.info(f"画像セクション解析: {len(image_sections)}個")
        try:
            # 一番大きな画像の位置を参考にする（複数ある場合）
            if isinstance(image_sections, list) and len(image_sections) > 0:
                # position キーがある要素のみをフィルタリング
                valid_sections = [s for s in image_sections if 'position' in s]
                logger.info(f"有効な位置情報を持つ画像セクション: {len(valid_sections)}個")

                if valid_sections:
                    largest = max(valid_sections,
                                 key=lambda s: s['position'].get('width', 0) * s['position'].get('height', 0))
                    img_x = largest['position'].get('left', 0) or largest['position'].get('x', 0)
                    img_y = largest['position'].get('top', 0) or largest['position'].get('y', 0)
                    img_width = largest['position'].get('width', 0)
                    img_height = largest['position'].get('height', 0)

                    logger.info(f"最大画像セクション: 位置(x={img_x}, y={img_y}), サイズ({img_width}x{img_height})")

                    # 画像の位置を水平方向で判定
                    if img_x < avg_x - 100:  # 左に偏っている
                        image_pos = "left"
                        logger.info("画像は左側に配置されています")
                    elif img_x > avg_x + 100:  # 右に偏っている
                        image_pos = "right"
                        logger.info("画像は右側に配置されています")
                    else:
                        image_pos = "center"
                        logger.info("画像は中央に配置されています")

                    # テキストの垂直位置も判定
                    avg_text_y = sum(y_positions) / len(y_positions)
                    logger.info(f"テキストY座標平均: {avg_text_y:.1f}, 画像Y座標: {img_y}")

                    if img_y < min(y_positions):
                        # 画像がすべてのテキストより上にある
                        image_pos = "top"
                        logger.info("画像はすべてのテキストより上にあります")
                    elif img_y > max(y_positions):
                        # 画像がすべてのテキストより下にある
                        image_pos = "bottom"
                        logger.info("画像はすべてのテキストより下にあります")
        except Exception as e:
            logger.error(f"画像位置判定エラー: {e}")
            image_pos = None

    # セクション数の推定
    # Y座標の分布からセクション数を判定
    section_count = 1
    if y_positions:
        # Y座標をソートし、大きなギャップを探す
        y_positions.sort()
        jumps = []
        for i in range(1, len(y_positions)):
            if y_positions[i] - y_positions[i-1] > 100:  # 100px以上のギャップでセクション分け
                jumps.append(i)
                logger.info(f"セクション分割点を検出: Y={y_positions[i-1]}-{y_positions[i]} (ギャップ={y_positions[i]-y_positions[i-1]}px)")

        # ジャンプの数+1がセクション数
        section_count = len(jumps) + 1
        logger.info(f"検出されたセクション数: {section_count}")

    result = {
        "layoutType": layout_type,
        "hasImage": bool(image_sections),
        "imagePosition": image_pos,
        "textPosition": text_pos,
        "sectionCount": section_count
    }

    logger.info(f"レイアウト構造解析結果: {result}")
    logger.info("========== レイアウト構造解析終了 ==========")
    return result

def format_analysis_for_ai(analysis_data, format_type="markdown"):
    """
    AI向けに解析データをフォーマットします。

    Args:
        analysis_data: 画像解析データ
        format_type: 出力形式 (markdown, json, text)

    Returns:
        string: フォーマットされた解析データ
    """
    logger.info(f"📊 AI向けデータフォーマット処理開始（format_analysis_for_ai）- 形式: {format_type}")

    if not analysis_data:
        logger.warning("⚠️ 解析データが空です")
        return ""

    # 解析データの基本情報をログに出力
    input_data_size = len(str(analysis_data))
    has_text = 'text' in analysis_data and len(analysis_data['text'].get('blocks', [])) > 0
    has_colors = 'colors' in analysis_data and len(analysis_data['colors'].get('colors', [])) > 0
    has_elements = 'elements' in analysis_data and len(analysis_data['elements'].get('elements', [])) > 0
    has_layout = 'layout' in analysis_data and bool(analysis_data['layout'])

    logger.info(f"📥 入力データ情報: サイズ={input_data_size}文字, テキスト={has_text}, 色情報={has_colors}, 要素={has_elements}, レイアウト={has_layout}")

    output = ""
    # フォーマットタイプに基づいて出力を生成
    if format_type == "markdown" or format_type == "text":
        # 一時的に全てJSONフォーマットとして出力
        import json
        output = json.dumps(analysis_data, ensure_ascii=False, indent=2)
        logger.info(f"⚠️ {format_type}形式は未実装のため、JSONフォーマットで出力します")
    else:  # json
        import json
        output = json.dumps(analysis_data, ensure_ascii=False, indent=2)

    return output

def is_light_color(rgb_str):
    """
    RGBカラー文字列が明るい色かどうかを判定する

    Args:
        rgb_str: 'rgb(r,g,b)'または'#RRGGBB'形式の文字列

    Returns:
        bool: 明るい色の場合はTrue、暗い色の場合はFalse
    """
    try:
        r, g, b = 0, 0, 0

        # RGB文字列のパース
        if isinstance(rgb_str, str):
            if rgb_str.startswith('rgb'):
                # 'rgb(r,g,b)'形式をパース
                rgb_values = rgb_str.replace('rgb(', '').replace(')', '').split(',')
                r = int(rgb_values[0].strip())
                g = int(rgb_values[1].strip())
                b = int(rgb_values[2].strip())
            elif rgb_str.startswith('#'):
                # '#RRGGBB'形式をパース
                hex_color = rgb_str.lstrip('#')
                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16)
                b = int(hex_color[4:6], 16)

        # 明るさの計算 (ITU-R BT.709の輝度換算式)
        brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

        # 明るさが0.5以上なら明るい色と判定
        return brightness >= 0.5
    except:
        # エラー時はデフォルトでFalseを返す
        return False

def compress_analysis_results(analysis_data, options=None):
    """
    複数の解析結果を統合した圧縮データを生成する

    Args:
        analysis_data: 各種解析結果を含む辞書
        options: 出力オプション（フォーマット形式など）

    Returns:
        dict: 統合された解析結果
    """
    if not options:
        options = {}

    # 出力フォーマットタイプ（structured, semantic, template）
    format_type = options.get('format_type', 'structured')

    try:
        # 基本解析情報
        layout_info = analysis_data.get('layout', {})
        colors = analysis_data.get('colors', [])
        sections = analysis_data.get('sections', [])
        elements = analysis_data.get('elements', {})
        text_blocks = analysis_data.get('text_blocks', [])
        text_content = analysis_data.get('text', '')

        # レイアウト情報を整理
        layout = {
            'width': layout_info.get('width', 1200),
            'height': layout_info.get('height', 800),
            'aspectRatio': layout_info.get('aspectRatio', '3:2'),
            'type': layout_info.get('type', 'standard'),
            'template': layout_info.get('type', 'standard'),  # typeと同じ値をtemplateにも設定
            'gridPattern': layout_info.get('gridPattern', {
                'columns': 12,
                'rows': 'auto',
                'gap': '20px'
            }),
            'sectionCount': len(sections),
            'imagePosition': layout_info.get('imagePosition', 'center'),
            'textPosition': layout_info.get('textPosition', 'center')
        }

        # 色情報を整理（役割の統一）
        normalized_colors = []
        standard_roles = ['background', 'text', 'primary', 'secondary', 'accent', 'highlight']

        # 色の役割を推定・正規化する機能
        def normalize_color_role(color):
            if not color or not isinstance(color, dict):
                return {'rgb': 'rgb(0,0,0)', 'hex': '#000000', 'role': 'text', 'ratio': 0}

            role = color.get('role', '')

            # roleが標準ロールに含まれていない場合は推測
            if not role or role not in standard_roles:
                # 背景色判定: 量が多いor明るい色
                if color.get('ratio', 0) > 0.3 or is_light_color(color.get('rgb', '')):
                    role = 'background'
                # テキスト色判定: 暗い色
                elif not is_light_color(color.get('rgb', '')):
                    role = 'text'
                # アクセント色判定: 彩度が高い色
                elif color.get('saturation', 0) > 0.6:
                    role = 'accent'
                # それ以外はプライマリまたはセカンダリ
                else:
                    existing_roles = [c.get('role') for c in normalized_colors]
                    if 'primary' not in existing_roles:
                        role = 'primary'
                    elif 'secondary' not in existing_roles:
                        role = 'secondary'
                    else:
                        role = 'highlight'

            return {
                'rgb': color.get('rgb', ''),
                'hex': color.get('hex', ''),
                'role': role,
                'ratio': color.get('ratio', 0)
            }

        # 色情報の正規化
        for color in colors:
            normalized_colors.append(normalize_color_role(color))

        # テキスト情報を整理（JS側が期待する構造に変換）
        text_data = {
            'content': text_content,
            'blocks': text_blocks,
            'hierarchy': []
        }

        # テキスト階層の構築
        if text_blocks:
            for block in text_blocks:
                if not isinstance(block, dict):
                    continue

                # ブロックの重要度に基づいてレベルを設定
                importance = block.get('importance', 0)
                size = block.get('fontSize', 0)
                is_bold = block.get('bold', False)

                # レベルの決定（重要度、フォントサイズ、太字かで判断）
                level = 3  # デフォルトはテキスト
                if importance > 0.8 or (size > 24 and is_bold):
                    level = 1  # 見出し
                elif importance > 0.5 or size > 18:
                    level = 2  # 小見出し

                text_data['hierarchy'].append({
                    'level': level,
                    'text': block.get('text', ''),
                    'position': block.get('position', {})
                })
        # テキストブロックがなく全文のみの場合
        elif text_content:
            # 簡易的に最初の行を見出しとして扱う
            lines = text_content.split('\n')
            if lines:
                text_data['hierarchy'].append({
                    'level': 1,
                    'text': lines[0],
                    'position': {'top': 0, 'left': 0}
                })

                # 残りの行をテキストとして扱う
                if len(lines) > 1:
                    text_data['hierarchy'].append({
                        'level': 3,
                        'text': '\n'.join(lines[1:]),
                        'position': {'top': 50, 'left': 0}
                    })

        # 要素情報を整理（elements.elements形式への統一とsummary追加）
        element_list = elements.get('elements', [])
        if not isinstance(element_list, list):
            element_list = []

        # 要素種類ごとのカウント
        element_counts = {
            'button': 0,
            'image': 0,
            'card': 0,
            'navigation': 0,
            'form': 0,
            'list': 0,
            'text': 0,
            'total': len(element_list)
        }

        # 要素カウントの集計
        for element in element_list:
            if not isinstance(element, dict):
                continue

            element_type = element.get('type', '').lower()
            if 'button' in element_type:
                element_counts['button'] += 1
            elif 'image' in element_type or 'img' in element_type:
                element_counts['image'] += 1
            elif 'card' in element_type:
                element_counts['card'] += 1
            elif 'nav' in element_type:
                element_counts['navigation'] += 1
            elif 'form' in element_type or 'input' in element_type:
                element_counts['form'] += 1
            elif 'list' in element_type or 'ul' in element_type or 'ol' in element_type:
                element_counts['list'] += 1
            elif 'text' in element_type or 'paragraph' in element_type:
                element_counts['text'] += 1

        # 要素サマリーの追加
        element_summary = {
            'counts': element_counts,
            'hasForms': element_counts['form'] > 0,
            'hasNavigation': element_counts['navigation'] > 0,
            'hasButtons': element_counts['button'] > 0,
            'hasCards': element_counts['card'] > 0,
            'hasImages': element_counts['image'] > 0,
            'hasLists': element_counts['list'] > 0
        }

        # 最終的なデータ構造の構築
        compressed_data = {
            'layout': layout,
            'colors': normalized_colors,
            'text': text_data,
            'sections': sections,
            'elements': {
                'elements': element_list,
                'summary': element_summary
            }
        }

        # フォーマットタイプに応じた変換
        if format_type == 'semantic':
            return convert_to_semantic_format(compressed_data)
        elif format_type == 'template':
            return convert_to_template_format(compressed_data)

        # デフォルトは構造化データをそのまま返す
        return compressed_data

    except Exception as e:
        logger.error(f"解析データの圧縮中にエラーが発生しました: {str(e)}")
        traceback.print_exc()

        # エラー時の最小限のデータ構造
        return {
            'layout': {
                'width': 1200,
                'height': 800,
                'type': 'standard',
                'template': 'standard'
            },
            'colors': [],
            'text': {
                'content': '',
                'blocks': [],
                'hierarchy': []
            },
            'sections': [],
            'elements': {
                'elements': [],
                'summary': {
                    'counts': {'total': 0},
                    'hasNavigation': False,
                    'hasForms': False
                }
            },
            'error': str(e)
        }

def convert_to_semantic_format(compressed_data):
    """
    圧縮データをセマンティックタグ形式に変換

    Args:
        compressed_data: 圧縮済みデータ

    Returns:
        str: セマンティックタグ形式の文字列
    """
    result = []

    # レイアウト情報
    layout = compressed_data.get('layout', {})
    result.append(f"[layout:{layout.get('template', 'unknown')}]")

    if layout.get('imagePosition'):
        result.append(f"[image-position:{layout.get('imagePosition')}]")

    if layout.get('textPosition'):
        result.append(f"[text-position:{layout.get('textPosition')}]")

    # テキスト階層
    text_data = compressed_data.get('text', {})
    for item in text_data.get('hierarchy', []):
        level = item.get('level', 3)
        text = item.get('text', '')

        if level == 1:
            result.append(f"[heading] {text}")
        elif level == 2:
            result.append(f"[subheading] {text}")
        else:
            result.append(f"[text] {text}")

    # 色情報
    colors = compressed_data.get('colors', [])
    color_parts = []
    for color in colors:
        role = color.get('role', '')
        hex_code = color.get('hex', '')
        if role and hex_code:
            color_parts.append(f"{role}={hex_code}")

    if color_parts:
        result.append(f"[colors:{','.join(color_parts)}]")

    return "\n".join(result)


def convert_to_template_format(compressed_data):
    """
    圧縮データをテンプレート形式に変換

    Args:
        compressed_data: 圧縮済みデータ

    Returns:
        str: テンプレート形式の文字列
    """
    result = []

    # レイアウトテンプレート
    layout = compressed_data.get('layout', {})
    result.append(f"{{{{layout:{layout.get('template', 'unknown')}}}}}")

    # 見出し
    headings = []
    subheadings = []
    body_texts = []

    text_data = compressed_data.get('text', {})
    for item in text_data.get('hierarchy', []):
        level = item.get('level', 3)
        text = item.get('text', '')

        if level == 1:
            headings.append(text)
        elif level == 2:
            subheadings.append(text)
        else:
            body_texts.append(text)

    if headings:
        result.append(f"{{{{heading:{headings[0]}}}}}")

    if subheadings:
        result.append(f"{{{{subheading:{' / '.join(subheadings)}}}}}")

    if body_texts:
        result.append(f"{{{{body:{' / '.join(body_texts)}}}}}")

    # 色情報
    colors = compressed_data.get('colors', [])
    color_parts = []
    for color in colors:
        role = color.get('role', '')
        hex_code = color.get('hex', '')
        if role and hex_code:
            short_role = role[0:2] if role in ['background', 'primary', 'secondary'] else role
            color_parts.append(f"{short_role}={hex_code}")

    if color_parts:
        result.append(f"{{{{colors:{','.join(color_parts)}}}}}")

    return "\n".join(result)

def merge_similar_colors(colors, max_colors=5):
    """類似する色をマージして代表的な色に集約する"""
    if not colors:
        return []

    # 既に最大色数以下ならそのまま返す
    if len(colors) <= max_colors:
        return colors

    # 色相と彩度でグループ化（LAB色空間が理想だが、簡略化のためRGBベース）
    from sklearn.cluster import KMeans
    import numpy as np

    # RGB値を抽出
    rgb_values = []
    for color in colors:
        rgb_str = color.get('rgb', '')
        # 'rgb(r,g,b)' 形式から数値を抽出
        if 'rgb(' in rgb_str and ')' in rgb_str:
            rgb_parts = rgb_str.replace('rgb(', '').replace(')', '').split(',')
            if len(rgb_parts) == 3:
                try:
                    r, g, b = map(int, rgb_parts)
                    rgb_values.append([r, g, b])
                except ValueError:
                    continue

    if not rgb_values:
        return colors[:max_colors]

    # KMeansで色をクラスタリング
    rgb_array = np.array(rgb_values)
    kmeans = KMeans(n_clusters=max_colors, n_init=10)
    kmeans.fit(rgb_array)

    # 各クラスタの代表色とそれに属する元の色のインデックスを取得
    cluster_centers = kmeans.cluster_centers_.astype(int)
    labels = kmeans.labels_

    # 新しい色情報を作成
    merged_colors = []
    for i in range(max_colors):
        # このクラスタに属する色のインデックスを取得
        indices = [j for j, label in enumerate(labels) if label == i]
        if not indices:
            continue

        # このクラスタの代表的なRGB値
        r, g, b = cluster_centers[i]
        hex_color = '#{:02x}{:02x}{:02x}'.format(r, g, b)

        # このクラスタに属する色の合計比率を計算
        total_ratio = sum(colors[j]['ratio'] for j in indices if j < len(colors))

        merged_colors.append({
            'rgb': f'rgb({r},{g},{b})',
            'hex': hex_color,
            'ratio': total_ratio
        })

    # 比率でソート
    merged_colors.sort(key=lambda x: x['ratio'], reverse=True)

    return merged_colors


def estimate_color_roles(colors, analysis_data=None):
    """
    色に対して想定される役割（背景、前景、アクセント等）を推定します。

    Args:
        colors: 色情報のリスト
        analysis_data: 全体の解析データ（オプション）

    Returns:
        list: 役割が追加された色のリスト
    """
    logger.info("🎭 色の役割推定処理を開始（estimate_color_roles）")

    # 色が空の場合は空のリストを返す
    if not colors or len(colors) == 0:
        logger.info("⚠️ 色情報がありません")
        return []

    # 色情報を比率でソート
    sorted_colors = sorted(colors, key=lambda x: x.get('ratio', 0), reverse=True)

    # 役割が追加された色リスト
    colors_with_roles = []

    # 使用済みの役割を追跡
    used_roles = set()

    # 各色に役割を割り当て
    for idx, color in enumerate(sorted_colors):
        hex_color = color.get('hex', '')
        ratio = color.get('ratio', 0)

        # RGB値の取得（存在する場合）
        rgb_values = None
        if 'rgb' in color:
            rgb_str = color['rgb']
            # rgb(r,g,b)形式から数値を抽出
            import re
            rgb_match = re.match(r'rgb\((\d+),(\d+),(\d+)\)', rgb_str)
            if rgb_match:
                r, g, b = map(int, rgb_match.groups())
                rgb_values = (r, g, b)

        # 明度の計算（RGB値がある場合）
        brightness = 0
        if rgb_values:
            r, g, b = rgb_values
            brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        # 役割の初期化
        role = "unknown"

        # 最も多い色は通常背景色
        if idx == 0 and ratio > 0.3:
            role = "background"
        # 2番目に多い色で明度が低い場合はテキスト色
        elif idx == 1 and brightness < 0.5 and ratio > 0.05:
            role = "text"
        # 2番目に多い色で明度が高い場合は前景色
        elif idx == 1 and brightness >= 0.5 and ratio > 0.05:
            role = "foreground"
        # 使用率が低く、彩度が高い色はアクセント色
        elif ratio < 0.1 and idx > 1 and is_saturated(rgb_values) and "accent" not in used_roles:
            role = "accent"
        # 3番目以降の使用率が中程度の色は補助色
        elif idx >= 2 and ratio > 0.05 and ratio < 0.3:
            role = "secondary"
        # 使用率が非常に低い色は装飾色
        elif ratio < 0.05:
            role = "decorative"

        # 文脈に基づく役割の調整
        # 例：画像が写真の場合は異なる解釈をする
        if analysis_data and 'imageType' in analysis_data:
            image_type = analysis_data.get('imageType', '')
            if image_type == 'photo':
                # 写真の場合の役割調整
                if idx == 0:
                    role = "dominant"
                elif idx == 1:
                    role = "secondary"
                elif is_saturated(rgb_values) and ratio > 0.05:
                    role = "accent"
            elif image_type == 'screenshot':
                # スクリーンショットの場合の役割調整
                if idx == 0 and brightness > 0.8:
                    role = "background"
                elif idx == 1 and brightness < 0.2:
                    role = "text"

        # 使用済み役割に追加
        used_roles.add(role)

        # 役割を色情報に追加
        color_with_role = color.copy()
        color_with_role['role'] = role
        colors_with_roles.append(color_with_role)

        logger.info(f"🎨 色 {idx+1}: HEX={hex_color}, 比率={ratio:.2f}({ratio*100:.1f}%), 役割={role}")

    logger.info(f"✅ 色の役割推定処理が完了しました（全{len(colors_with_roles)}色）")
    return colors_with_roles

def estimate_text_role(text_block, all_blocks):
    """テキストブロックの役割（見出し、本文など）を推定する"""
    if not text_block:
        return 'unknown'

    text = text_block.get('text', '')
    position = text_block.get('position', {})
    confidence = text_block.get('confidence', 0)

    # テキストが空か信頼度が低い場合
    if not text or confidence < 0.3:
        return 'unknown'

    # 位置情報
    y_position = position.get('y', 0)
    height = position.get('height', 0)
    width = position.get('width', 0)

    # テキストの長さ
    text_length = len(text)

    # 大文字比率
    uppercase_ratio = sum(1 for c in text if c.isupper()) / max(1, len(text))

    # 見出しの特徴: 短いテキスト、上部にある、大きなフォント
    if (text_length < 30 and y_position < 200 and height > 20) or uppercase_ratio > 0.7:
        return 'heading'

    # サブ見出しの特徴: 中程度の長さ、中程度のフォント
    elif text_length < 100 and 10 < height < 20:
        return 'subheading'

    # ボタンテキストの特徴: 非常に短いテキスト、特定のキーワード
    elif text_length < 20 and any(keyword in text.lower() for keyword in ['submit', 'login', 'sign', 'buy', 'view', 'more', 'click', 'go']):
        return 'button'

    # リンクテキストの特徴
    elif any(keyword in text.lower() for keyword in ['http', 'www', '.com', '.jp']):
        return 'link'

    # 本文テキストの特徴: 長いテキスト
    elif text_length > 100:
        return 'paragraph'

    # その他のラベルテキスト
    elif text_length < 50:
        return 'label'

    # デフォルト
    return 'text'


def detect_grid_pattern(layout_details):
    """レイアウトからグリッドパターンを検出する"""
    # 画像のサイズ情報を取得
    dimensions = layout_details.get('dimensions', {})
    width = dimensions.get('width', 0)
    height = dimensions.get('height', 0)

    if not width or not height:
        return {'type': 'unknown'}

    # アスペクト比に基づいて基本レイアウトタイプを推定
    aspect_ratio = width / height if height > 0 else 0

    # セクション情報を取得
    sections = layout_details.get('sections', [])
    num_sections = len(sections)

    # 基本的なグリッドパターンを推定
    if aspect_ratio > 2.0:
        grid_type = 'horizontal'
        column_count = min(num_sections, 4)
        row_count = 1
    elif aspect_ratio < 0.5:
        grid_type = 'vertical'
        column_count = 1
        row_count = min(num_sections, 4)
    elif num_sections <= 1:
        grid_type = 'single'
        column_count = 1
        row_count = 1
    elif num_sections <= 3:
        # ヘッダー・コンテンツ・フッター構造の可能性
        grid_type = 'header_content_footer'
        column_count = 1
        row_count = num_sections
    else:
        # セクションの位置関係から列数を推定
        columns = estimate_column_count(sections, width)
        grid_type = 'grid'
        column_count = columns
        row_count = max(1, num_sections // columns)

    return {
        'type': grid_type,
        'columns': column_count,
        'rows': row_count,
        'aspect_ratio': aspect_ratio
    }


def estimate_column_count(sections, total_width):
    """セクションの配置から列数を推定する"""
    if not sections or total_width == 0:
        return 1

    # 各セクションの水平方向の中心位置を取得
    centers = []
    for section in sections:
        position = section.get('position', {})
        left = position.get('left', 0)
        width = position.get('width', 0)
        if width > 0:
            center_x = left + width / 2
            centers.append(center_x)

    if not centers:
        return 1

    # 中心位置のクラスタリングで列を推定
    from sklearn.cluster import KMeans
    import numpy as np

    # 1列から4列までのクラスタリングを試して最適な列数を見つける
    best_columns = 1
    best_score = float('inf')

    for columns in range(1, min(5, len(centers) + 1)):
        X = np.array(centers).reshape(-1, 1)
        kmeans = KMeans(n_clusters=columns, n_init=10)
        kmeans.fit(X)

        # クラスタ内の分散を評価スコアとして使用
        score = kmeans.inertia_
        normalized_score = score / columns  # 列数で正規化

        if normalized_score < best_score * 0.7:  # 70%以上の改善があれば採用
            best_score = normalized_score
            best_columns = columns

    return best_columns


def summarize_sections(sections):
    """セクション情報のサマリーを作成する"""
    if not sections:
        return []

    summaries = []
    for i, section in enumerate(sections):
        position = section.get('position', {})
        color = section.get('color', {}).get('dominant', {})

        # ポジションから相対的な位置を推定
        relative_position = 'unknown'
        top = position.get('top', 0)
        height = position.get('height', 0)

        if 'top' in position:
            if i == 0:
                relative_position = 'top'
            elif i == len(sections) - 1:
                relative_position = 'bottom'
            else:
                relative_position = 'middle'

        # セクションタイプを取得（存在する場合）または推定
        section_type = section.get('section_type', '')
        if not section_type:
            # セクションタイプがない場合、位置ベースで推定
            if i == 0 and top < 150:
                section_type = 'header'
            elif i == len(sections) - 1 and height < 200:
                section_type = 'footer'
            elif height < 100:
                section_type = 'divider'
            else:
                section_type = 'content'

        summaries.append({
            'index': i,
            'type': section_type,
            'position': relative_position,
            'height': height,
            'color': color.get('hex', '') if color else ''
        })

    return summaries

def compare_images(original_image, rendered_image, mask=None):
    """
    原画像とレンダリング画像を比較して類似度を評価する

    Args:
        original_image: オリジナル画像（OpenCVイメージ）
        rendered_image: レンダリングされた画像（OpenCVイメージ）
        mask: 比較時に使用するマスク画像（オプション）

    Returns:
        dict: 類似度評価結果
    """
    try:
        # 両方の画像が存在するか確認
        if original_image is None or rendered_image is None:
            return {
                'success': False,
                'error': 'One or both images are missing',
                'ssim_score': 0,
                'differences': None
            }

        # 画像サイズを一致させる
        height_orig, width_orig = original_image.shape[:2]
        height_rendered, width_rendered = rendered_image.shape[:2]

        # サイズが異なる場合は、レンダリング画像をオリジナルのサイズにリサイズ
        if height_orig != height_rendered or width_orig != width_rendered:
            rendered_image = cv2.resize(rendered_image, (width_orig, height_orig),
                                        interpolation=cv2.INTER_AREA)

        # グレースケールに変換
        original_gray = cv2.cvtColor(original_image, cv2.COLOR_BGR2GRAY)
        rendered_gray = cv2.cvtColor(rendered_image, cv2.COLOR_BGR2GRAY)

        # SSIM（構造的類似性）の計算
        if SKIMAGE_SSIM_AVAILABLE:
            score, diff = ssim(original_gray, rendered_gray, full=True)
            diff = (diff * 255).astype("uint8")
        else:
            # SSIMが利用できない場合は、簡易的な比較を行う
            diff = cv2.absdiff(original_gray, rendered_gray)
            score = 1.0 - (np.sum(diff) / (255.0 * diff.size))

        # 差分のヒートマップを作成
        heatmap = cv2.applyColorMap(diff, cv2.COLORMAP_JET)

        # 分析結果用に差分の大きいエリアを特定
        threshold = 50  # 差分の閾値
        _, thresholded = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

        # 差分の大きい領域を検出
        contours, _ = cv2.findContours(thresholded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 差分エリアの情報を収集
        difference_areas = []
        for contour in contours:
            # 十分な大きさの領域のみ処理
            if cv2.contourArea(contour) > 100:  # 小さすぎる差分は無視
                x, y, w, h = cv2.boundingRect(contour)
                difference_areas.append({
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h),
                    'area': int(cv2.contourArea(contour))
                })

        # 差分エリアを面積順にソート
        difference_areas.sort(key=lambda x: x['area'], reverse=True)

        # 結果をまとめる
        return {
            'success': True,
            'ssim_score': float(score),
            'is_similar': score >= 0.85,  # 類似性の閾値
            'differences': difference_areas[:5],  # 上位5つの差分エリアを返す
            'diff_heatmap': heatmap  # 差分のヒートマップ
        }

    except Exception as e:
        logger.error(f"画像比較エラー: {str(e)}")
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'ssim_score': 0,
            'differences': None
        }


def generate_feedback(comparison_result):
    """
    比較結果に基づいてClaudeへのフィードバックを生成する

    Args:
        comparison_result: 画像比較結果

    Returns:
        string: Claudeへのフィードバック文
    """
    if not comparison_result['success']:
        return "比較処理中にエラーが発生しました。コードを確認して再生成してください。"

    ssim_score = comparison_result['ssim_score']
    differences = comparison_result['differences']

    if ssim_score >= 0.95:
        return "レンダリング結果は元のデザインにとても近いです。素晴らしい再現性です。"

    if ssim_score >= 0.85:
        return "レンダリング結果は元のデザインに十分近いですが、細かい調整の余地があります。"

    # フィードバックのベース部分
    feedback = f"レンダリング結果と元のデザインには相違点があります（類似度スコア: {ssim_score:.2f}）。\n"

    # 差分エリアに基づくフィードバックを追加
    if differences and len(differences) > 0:
        feedback += "以下の部分で主な相違が見られます：\n"

        for i, area in enumerate(differences[:3]):  # 最大3つのエリアについてフィードバック
            x, y, width, height = area['x'], area['y'], area['width'], area['height']

            # エリアの位置に基づいてセクションを推測
            position_desc = "上部" if y < 300 else "中央部" if y < 600 else "下部"

            # 相対的な位置を追加
            horizontal_pos = "左側" if x < 300 else "中央" if x < 600 else "右側"

            feedback += f"{i+1}. デザインの{position_desc}{horizontal_pos}（座標: x={x}, y={y}, 幅={width}, 高さ={height}）のエリアを確認してください。\n"

        # 一般的な修正提案
        feedback += "\n考えられる問題点：\n"
        feedback += "- 要素の配置やサイズが元のデザインと異なっている\n"
        feedback += "- 色やコントラストが正確に再現されていない\n"
        feedback += "- フォントやテキストスタイルが元のデザインと一致していない\n"
        feedback += "- 余白やパディングが異なっている\n"

        # 修正アドバイス
        feedback += "\n改善のためのアドバイス：\n"
        feedback += "- 要素の位置とサイズを元のデザインに合わせて調整する\n"
        feedback += "- 色やグラデーションを正確に再現する\n"
        feedback += "- 適切なフォントサイズとウェイトを設定する\n"
        feedback += "- 余白やパディングを元のデザインに合わせる\n"

    return feedback

def analyze_layout_structure(text_blocks, image_sections=None):
    """
    テキストと画像ブロックの位置を元に、レイアウト構造を推定する

    Args:
        text_blocks: テキストブロックのリスト
        image_sections: 画像ブロックのリスト (省略可能)

    Returns:
        dict: レイアウト構造情報
    """
    logger.info("========== レイアウト構造解析開始 ==========")
    logger.info(f"テキストブロック数: {len(text_blocks) if text_blocks else 0}")
    logger.info(f"画像セクション数: {len(image_sections) if image_sections else 0}")

    layout_type = "single-column"
    image_pos = None
    text_pos = "center"

    # テキストブロックが存在しない場合は早期リターン
    if not text_blocks or len(text_blocks) == 0:
        logger.info("テキストブロックがありません - レイアウト解析を中止します")
        result = {
            "layoutType": "unknown",
            "hasImage": bool(image_sections),
            "imagePosition": None,
            "textPosition": None,
            "sectionCount": 0
        }
        logger.info(f"レイアウト構造解析結果: {result}")
        logger.info("========== レイアウト構造解析終了 ==========")
        return result

    # カラム推定（X座標に偏りがあるかどうか）
    x_positions = [block['position']['x'] for block in text_blocks if 'position' in block]
    if not x_positions:
        logger.info("有効な位置情報を持つテキストブロックがありません")
        result = {
            "layoutType": "unknown",
            "hasImage": bool(image_sections),
            "imagePosition": None,
            "textPosition": None,
            "sectionCount": 0
        }
        logger.info(f"レイアウト構造解析結果: {result}")
        logger.info("========== レイアウト構造解析終了 ==========")
        return result

    avg_x = sum(x_positions) / len(x_positions)
    left_count = len([x for x in x_positions if x < avg_x])
    right_count = len([x for x in x_positions if x >= avg_x])

    logger.info(f"X座標分析: 平均={avg_x:.1f}, 左側={left_count}個, 右側={right_count}個")

    # 画面中央からの水平バランスで判定
    # (このロジックは画面サイズに応じて調整する必要がある)
    if abs(left_count - right_count) > 1:
        layout_type = "two-column"
        text_pos = "right" if left_count < right_count else "left"
        logger.info(f"テキスト偏り検出: {text_pos}側に偏っています → 2カラムレイアウト")
    else:
        logger.info("テキスト分布は均等 → 1カラムレイアウト")

    # グリッドレイアウトの検出
    # テキストブロックのY座標を分析して規則的なグリッドかどうかを判定
    y_positions = [block['position']['y'] for block in text_blocks if 'position' in block]
    y_positions.sort()
    logger.info(f"Y座標ソート結果: {y_positions}")

    # 隣接する要素間のY座標の差を計算
    y_diffs = [y_positions[i+1] - y_positions[i] for i in range(len(y_positions)-1)]

    if y_diffs:
        logger.info(f"Y座標の差分: {y_diffs}")
        avg_diff = sum(y_diffs) / len(y_diffs)
        logger.info(f"Y座標の平均差分: {avg_diff:.1f}px")

        # 差が一定の値に近いかどうかを確認 (グリッドの特徴)
        if len(y_diffs) > 2:
            avg_diff = sum(y_diffs) / len(y_diffs)
            regular_spacing = all(abs(diff - avg_diff) < avg_diff * 0.3 for diff in y_diffs)

            if regular_spacing:
                logger.info("Y方向に等間隔配置を検出")
            else:
                logger.info("Y方向の間隔は不規則")

            # 横方向の位置も考慮して、カードグリッドかどうかを判定
            x_clusters = {}
            for block in text_blocks:
                if 'position' in block:
                    pos = block['position']
                    x_cluster = pos['x'] // 100  # 100px単位でクラスタリング
                    if x_cluster not in x_clusters:
                        x_clusters[x_cluster] = 0
                    x_clusters[x_cluster] += 1

            logger.info(f"X方向クラスター: {x_clusters}")

            # 複数の横方向クラスターがあり、縦方向が等間隔ならグリッド
            if len(x_clusters) > 1 and regular_spacing:
                layout_type = "card-grid"
                logger.info("縦方向の等間隔と複数の横方向クラスターを検出 → カードグリッドレイアウト")

    # 画像位置の判定（あれば）
    if image_sections:
        logger.info(f"画像セクション解析: {len(image_sections)}個")
        try:
            # 一番大きな画像の位置を参考にする（複数ある場合）
            if isinstance(image_sections, list) and len(image_sections) > 0:
                # position キーがある要素のみをフィルタリング
                valid_sections = [s for s in image_sections if 'position' in s]
                logger.info(f"有効な位置情報を持つ画像セクション: {len(valid_sections)}個")

                if valid_sections:
                    largest = max(valid_sections,
                                 key=lambda s: s['position'].get('width', 0) * s['position'].get('height', 0))
                    img_x = largest['position'].get('left', 0) or largest['position'].get('x', 0)
                    img_y = largest['position'].get('top', 0) or largest['position'].get('y', 0)
                    img_width = largest['position'].get('width', 0)
                    img_height = largest['position'].get('height', 0)

                    logger.info(f"最大画像セクション: 位置(x={img_x}, y={img_y}), サイズ({img_width}x{img_height})")

                    # 画像の位置を水平方向で判定
                    if img_x < avg_x - 100:  # 左に偏っている
                        image_pos = "left"
                        logger.info("画像は左側に配置されています")
                    elif img_x > avg_x + 100:  # 右に偏っている
                        image_pos = "right"
                        logger.info("画像は右側に配置されています")
                    else:
                        image_pos = "center"
                        logger.info("画像は中央に配置されています")

                    # テキストの垂直位置も判定
                    avg_text_y = sum(y_positions) / len(y_positions)
                    logger.info(f"テキストY座標平均: {avg_text_y:.1f}, 画像Y座標: {img_y}")

                    if img_y < min(y_positions):
                        # 画像がすべてのテキストより上にある
                        image_pos = "top"
                        logger.info("画像はすべてのテキストより上にあります")
                    elif img_y > max(y_positions):
                        # 画像がすべてのテキストより下にある
                        image_pos = "bottom"
                        logger.info("画像はすべてのテキストより下にあります")
        except Exception as e:
            logger.error(f"画像位置判定エラー: {e}")
            image_pos = None

    # セクション数の推定
    # Y座標の分布からセクション数を判定
    section_count = 1
    if y_positions:
        # Y座標をソートし、大きなギャップを探す
        y_positions.sort()
        jumps = []
        for i in range(1, len(y_positions)):
            if y_positions[i] - y_positions[i-1] > 100:  # 100px以上のギャップでセクション分け
                jumps.append(i)
                logger.info(f"セクション分割点を検出: Y={y_positions[i-1]}-{y_positions[i]} (ギャップ={y_positions[i]-y_positions[i-1]}px)")

        # ジャンプの数+1がセクション数
        section_count = len(jumps) + 1
        logger.info(f"検出されたセクション数: {section_count}")

    result = {
        "layoutType": layout_type,
        "hasImage": bool(image_sections),
        "imagePosition": image_pos,
        "textPosition": text_pos,
        "sectionCount": section_count
    }

    logger.info(f"レイアウト構造解析結果: {result}")
    logger.info("========== レイアウト構造解析終了 ==========")
    return result

def format_analysis_for_ai(analysis_data, format_type="markdown"):
    """
    AI向けに解析データをフォーマットします。

    Args:
        analysis_data: 画像解析データ
        format_type: 出力形式 (markdown, json, text)

    Returns:
        string: フォーマットされた解析データ
    """
    logger.info(f"📊 AI向けデータフォーマット処理開始（format_analysis_for_ai）- 形式: {format_type}")

    if not analysis_data:
        logger.warning("⚠️ 解析データが空です")
        return ""

    # 解析データの基本情報をログに出力
    input_data_size = len(str(analysis_data))
    has_text = 'text' in analysis_data and len(analysis_data['text'].get('blocks', [])) > 0
    has_colors = 'colors' in analysis_data and len(analysis_data['colors'].get('colors', [])) > 0
    has_elements = 'elements' in analysis_data and len(analysis_data['elements'].get('elements', [])) > 0
    has_layout = 'layout' in analysis_data and bool(analysis_data['layout'])

    logger.info(f"📥 入力データ情報: サイズ={input_data_size}文字, テキスト={has_text}, 色情報={has_colors}, 要素={has_elements}, レイアウト={has_layout}")

    output = ""
    # フォーマットタイプに基づいて出力を生成
    if format_type == "markdown" or format_type == "text":
        # 一時的に全てJSONフォーマットとして出力
        import json
        output = json.dumps(analysis_data, ensure_ascii=False, indent=2)
        logger.info(f"⚠️ {format_type}形式は未実装のため、JSONフォーマットで出力します")
    else:  # json
        import json
        output = json.dumps(analysis_data, ensure_ascii=False, indent=2)

    return output

def is_light_color(rgb_str):
    """
    RGBカラー文字列が明るい色かどうかを判定する

    Args:
        rgb_str: 'rgb(r,g,b)'または'#RRGGBB'形式の文字列

    Returns:
        bool: 明るい色の場合はTrue、暗い色の場合はFalse
    """
    try:
        r, g, b = 0, 0, 0

        # RGB文字列のパース
        if isinstance(rgb_str, str):
            if rgb_str.startswith('rgb'):
                # 'rgb(r,g,b)'形式をパース
                rgb_values = rgb_str.replace('rgb(', '').replace(')', '').split(',')
                r = int(rgb_values[0].strip())
                g = int(rgb_values[1].strip())
                b = int(rgb_values[2].strip())
            elif rgb_str.startswith('#'):
                # '#RRGGBB'形式をパース
                hex_color = rgb_str.lstrip('#')
                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16)
                b = int(hex_color[4:6], 16)

        # 明るさの計算 (ITU-R BT.709の輝度換算式)
        brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

        # 明るさが0.5以上なら明るい色と判定
        return brightness >= 0.5
    except:
        # エラー時はデフォルトでFalseを返す
        return False

def compress_analysis_results(analysis_data, options=None):
    """
    複数の解析結果を統合した圧縮データを生成する

    Args:
        analysis_data: 各種解析結果を含む辞書
        options: 出力オプション（フォーマット形式など）

    Returns:
        dict: 統合された解析結果
    """
    if not options:
        options = {}

    # 出力フォーマットタイプ（structured, semantic, template）
    format_type = options.get('format_type', 'structured')

    try:
        # 基本解析情報
        layout_info = analysis_data.get('layout', {})
        colors = analysis_data.get('colors', [])
        sections = analysis_data.get('sections', [])
        elements = analysis_data.get('elements', {})
        text_blocks = analysis_data.get('text_blocks', [])
        text_content = analysis_data.get('text', '')

        # レイアウト情報を整理
        layout = {
            'width': layout_info.get('width', 1200),
            'height': layout_info.get('height', 800),
            'aspectRatio': layout_info.get('aspectRatio', '3:2'),
            'type': layout_info.get('type', 'standard'),
            'template': layout_info.get('type', 'standard'),  # typeと同じ値をtemplateにも設定
            'gridPattern': layout_info.get('gridPattern', {
                'columns': 12,
                'rows': 'auto',
                'gap': '20px'
            }),
            'sectionCount': len(sections),
            'imagePosition': layout_info.get('imagePosition', 'center'),
            'textPosition': layout_info.get('textPosition', 'center')
        }

        # 色情報を整理（役割の統一）
        normalized_colors = []
        standard_roles = ['background', 'text', 'primary', 'secondary', 'accent', 'highlight']

        # 色の役割を推定・正規化する機能
        def normalize_color_role(color):
            if not color or not isinstance(color, dict):
                return {'rgb': 'rgb(0,0,0)', 'hex': '#000000', 'role': 'text', 'ratio': 0}

            role = color.get('role', '')

            # roleが標準ロールに含まれていない場合は推測
            if not role or role not in standard_roles:
                # 背景色判定: 量が多いor明るい色
                if color.get('ratio', 0) > 0.3 or is_light_color(color.get('rgb', '')):
                    role = 'background'
                # テキスト色判定: 暗い色
                elif not is_light_color(color.get('rgb', '')):
                    role = 'text'
                # アクセント色判定: 彩度が高い色
                elif color.get('saturation', 0) > 0.6:
                    role = 'accent'
                # それ以外はプライマリまたはセカンダリ
                else:
                    existing_roles = [c.get('role') for c in normalized_colors]
                    if 'primary' not in existing_roles:
                        role = 'primary'
                    elif 'secondary' not in existing_roles:
                        role = 'secondary'
                    else:
                        role = 'highlight'

            return {
                'rgb': color.get('rgb', ''),
                'hex': color.get('hex', ''),
                'role': role,
                'ratio': color.get('ratio', 0)
            }

        # 色情報の正規化
        for color in colors:
            normalized_colors.append(normalize_color_role(color))

        # テキスト情報を整理（JS側が期待する構造に変換）
        text_data = {
            'content': text_content,
            'blocks': text_blocks,
            'hierarchy': []
        }

        # テキスト階層の構築
        if text_blocks:
            for block in text_blocks:
                if not isinstance(block, dict):
                    continue

                # ブロックの重要度に基づいてレベルを設定
                importance = block.get('importance', 0)
                size = block.get('fontSize', 0)
                is_bold = block.get('bold', False)

                # レベルの決定（重要度、フォントサイズ、太字かで判断）
                level = 3  # デフォルトはテキスト
                if importance > 0.8 or (size > 24 and is_bold):
                    level = 1  # 見出し
                elif importance > 0.5 or size > 18:
                    level = 2  # 小見出し

                text_data['hierarchy'].append({
                    'level': level,
                    'text': block.get('text', ''),
                    'position': block.get('position', {})
                })
        # テキストブロックがなく全文のみの場合
        elif text_content:
            # 簡易的に最初の行を見出しとして扱う
            lines = text_content.split('\n')
            if lines:
                text_data['hierarchy'].append({
                    'level': 1,
                    'text': lines[0],
                    'position': {'top': 0, 'left': 0}
                })

                # 残りの行をテキストとして扱う
                if len(lines) > 1:
                    text_data['hierarchy'].append({
                        'level': 3,
                        'text': '\n'.join(lines[1:]),
                        'position': {'top': 50, 'left': 0}
                    })

        # 要素情報を整理（elements.elements形式への統一とsummary追加）
        element_list = elements.get('elements', [])
        if not isinstance(element_list, list):
            element_list = []

        # 要素種類ごとのカウント
        element_counts = {
            'button': 0,
            'image': 0,
            'card': 0,
            'navigation': 0,
            'form': 0,
            'list': 0,
            'text': 0,
            'total': len(element_list)
        }

        # 要素カウントの集計
        for element in element_list:
            if not isinstance(element, dict):
                continue

            element_type = element.get('type', '').lower()
            if 'button' in element_type:
                element_counts['button'] += 1
            elif 'image' in element_type or 'img' in element_type:
                element_counts['image'] += 1
            elif 'card' in element_type:
                element_counts['card'] += 1
            elif 'nav' in element_type:
                element_counts['navigation'] += 1
            elif 'form' in element_type or 'input' in element_type:
                element_counts['form'] += 1
            elif 'list' in element_type or 'ul' in element_type or 'ol' in element_type:
                element_counts['list'] += 1
            elif 'text' in element_type or 'paragraph' in element_type:
                element_counts['text'] += 1

        # 要素サマリーの追加
        element_summary = {
            'counts': element_counts,
            'hasForms': element_counts['form'] > 0,
            'hasNavigation': element_counts['navigation'] > 0,
            'hasButtons': element_counts['button'] > 0,
            'hasCards': element_counts['card'] > 0,
            'hasImages': element_counts['image'] > 0,
            'hasLists': element_counts['list'] > 0
        }

        # 最終的なデータ構造の構築
        compressed_data = {
            'layout': layout,
            'colors': normalized_colors,
            'text': text_data,
            'sections': sections,
            'elements': {
                'elements': element_list,
                'summary': element_summary
            }
        }

        # フォーマットタイプに応じた変換
        if format_type == 'semantic':
            return convert_to_semantic_format(compressed_data)
        elif format_type == 'template':
            return convert_to_template_format(compressed_data)

        # デフォルトは構造化データをそのまま返す
        return compressed_data

    except Exception as e:
        logger.error(f"解析データの圧縮中にエラーが発生しました: {str(e)}")
        traceback.print_exc()

        # エラー時の最小限のデータ構造
        return {
            'layout': {
                'width': 1200,
                'height': 800,
                'type': 'standard',
                'template': 'standard'
            },
            'colors': [],
            'text': {
                'content': '',
                'blocks': [],
                'hierarchy': []
            },
            'sections': [],
            'elements': {
                'elements': [],
                'summary': {
                    'counts': {'total': 0},
                    'hasNavigation': False,
                    'hasForms': False
                }
            },
            'error': str(e)
        }

def convert_to_semantic_format(compressed_data):
    """
    圧縮データをセマンティックタグ形式に変換

    Args:
        compressed_data: 圧縮済みデータ

    Returns:
        str: セマンティックタグ形式の文字列
    """
    result = []

    # レイアウト情報
    layout = compressed_data.get('layout', {})
    result.append(f"[layout:{layout.get('template', 'unknown')}]")

    if layout.get('imagePosition'):
        result.append(f"[image-position:{layout.get('imagePosition')}]")

    if layout.get('textPosition'):
        result.append(f"[text-position:{layout.get('textPosition')}]")

    # テキスト階層
    text_data = compressed_data.get('text', {})
    for item in text_data.get('hierarchy', []):
        level = item.get('level', 3)
        text = item.get('text', '')

        if level == 1:
            result.append(f"[heading] {text}")
        elif level == 2:
            result.append(f"[subheading] {text}")
        else:
            result.append(f"[text] {text}")

    # 色情報
    colors = compressed_data.get('colors', [])
    color_parts = []
    for color in colors:
        role = color.get('role', '')
        hex_code = color.get('hex', '')
        if role and hex_code:
            color_parts.append(f"{role}={hex_code}")

    if color_parts:
        result.append(f"[colors:{','.join(color_parts)}]")

    return "\n".join(result)


def convert_to_template_format(compressed_data):
    """
    圧縮データをテンプレート形式に変換

    Args:
        compressed_data: 圧縮済みデータ

    Returns:
        str: テンプレート形式の文字列
    """
    result = []

    # レイアウトテンプレート
    layout = compressed_data.get('layout', {})
    result.append(f"{{{{layout:{layout.get('template', 'unknown')}}}}}")

    # 見出し
    headings = []
    subheadings = []
    body_texts = []

    text_data = compressed_data.get('text', {})
    for item in text_data.get('hierarchy', []):
        level = item.get('level', 3)
        text = item.get('text', '')

        if level == 1:
            headings.append(text)
        elif level == 2:
            subheadings.append(text)
        else:
            body_texts.append(text)

    if headings:
        result.append(f"{{{{heading:{headings[0]}}}}}")

    if subheadings:
        result.append(f"{{{{subheading:{' / '.join(subheadings)}}}}}")

    if body_texts:
        result.append(f"{{{{body:{' / '.join(body_texts)}}}}}")

    # 色情報
    colors = compressed_data.get('colors', [])
    color_parts = []
    for color in colors:
        role = color.get('role', '')
        hex_code = color.get('hex', '')
        if role and hex_code:
            short_role = role[0:2] if role in ['background', 'primary', 'secondary'] else role
            color_parts.append(f"{short_role}={hex_code}")

    if color_parts:
        result.append(f"{{{{colors:{','.join(color_parts)}}}}}")

    return "\n".join(result)

def merge_similar_colors(colors, max_colors=5):
    """類似する色をマージして代表的な色に集約する"""
    if not colors:
        return []

    # 既に最大色数以下ならそのまま返す
    if len(colors) <= max_colors:
        return colors

    # 色相と彩度でグループ化（LAB色空間が理想だが、簡略化のためRGBベース）
    from sklearn.cluster import KMeans
    import numpy as np

    # RGB値を抽出
    rgb_values = []
    for color in colors:
        rgb_str = color.get('rgb', '')
        # 'rgb(r,g,b)' 形式から数値を抽出
        if 'rgb(' in rgb_str and ')' in rgb_str:
            rgb_parts = rgb_str.replace('rgb(', '').replace(')', '').split(',')
            if len(rgb_parts) == 3:
                try:
                    r, g, b = map(int, rgb_parts)
                    rgb_values.append([r, g, b])
                except ValueError:
                    continue

    if not rgb_values:
        return colors[:max_colors]

    # KMeansで色をクラスタリング
    rgb_array = np.array(rgb_values)
    kmeans = KMeans(n_clusters=max_colors, n_init=10)
    kmeans.fit(rgb_array)

    # 各クラスタの代表色とそれに属する元の色のインデックスを取得
    cluster_centers = kmeans.cluster_centers_.astype(int)
    labels = kmeans.labels_

    # 新しい色情報を作成
    merged_colors = []
    for i in range(max_colors):
        # このクラスタに属する色のインデックスを取得
        indices = [j for j, label in enumerate(labels) if label == i]
        if not indices:
            continue

        # このクラスタの代表的なRGB値
        r, g, b = cluster_centers[i]
        hex_color = '#{:02x}{:02x}{:02x}'.format(r, g, b)

        # このクラスタに属する色の合計比率を計算
        total_ratio = sum(colors[j]['ratio'] for j in indices if j < len(colors))

        merged_colors.append({
            'rgb': f'rgb({r},{g},{b})',
            'hex': hex_color,
            'ratio': total_ratio
        })

    # 比率でソート
    merged_colors.sort(key=lambda x: x['ratio'], reverse=True)

    return merged_colors


def estimate_color_roles(colors, analysis_data=None):
    """
    色に対して想定される役割（背景、前景、アクセント等）を推定します。

    Args:
        colors: 色情報のリスト
        analysis_data: 全体の解析データ（オプション）

    Returns:
        list: 役割が追加された色のリスト
    """
    logger.info("🎭 色の役割推定処理を開始（estimate_color_roles）")

    # 色が空の場合は空のリストを返す
    if not colors or len(colors) == 0:
        logger.info("⚠️ 色情報がありません")
        return []

    # 色情報を比率でソート
    sorted_colors = sorted(colors, key=lambda x: x.get('ratio', 0), reverse=True)

    # 役割が追加された色リスト
    colors_with_roles = []

    # 使用済みの役割を追跡
    used_roles = set()

    # 各色に役割を割り当て
    for idx, color in enumerate(sorted_colors):
        hex_color = color.get('hex', '')
        ratio = color.get('ratio', 0)

        # RGB値の取得（存在する場合）
        rgb_values = None
        if 'rgb' in color:
            rgb_str = color['rgb']
            # rgb(r,g,b)形式から数値を抽出
            import re
            rgb_match = re.match(r'rgb\((\d+),(\d+),(\d+)\)', rgb_str)
            if rgb_match:
                r, g, b = map(int, rgb_match.groups())
                rgb_values = (r, g, b)

        # 明度の計算（RGB値がある場合）
        brightness = 0
        if rgb_values:
            r, g, b = rgb_values
            brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        # 役割の初期化
        role = "unknown"

        # 最も多い色は通常背景色
        if idx == 0 and ratio > 0.3:
            role = "background"
        # 2番目に多い色で明度が低い場合はテキスト色
        elif idx == 1 and brightness < 0.5 and ratio > 0.05:
            role = "text"
        # 2番目に多い色で明度が高い場合は前景色
        elif idx == 1 and brightness >= 0.5 and ratio > 0.05:
            role = "foreground"
        # 使用率が低く、彩度が高い色はアクセント色
        elif ratio < 0.1 and idx > 1 and is_saturated(rgb_values) and "accent" not in used_roles:
            role = "accent"
        # 3番目以降の使用率が中程度の色は補助色
        elif idx >= 2 and ratio > 0.05 and ratio < 0.3:
            role = "secondary"
        # 使用率が非常に低い色は装飾色
        elif ratio < 0.05:
            role = "decorative"

        # 文脈に基づく役割の調整
        # 例：画像が写真の場合は異なる解釈をする
        if analysis_data and 'imageType' in analysis_data:
            image_type = analysis_data.get('imageType', '')
            if image_type == 'photo':
                # 写真の場合の役割調整
                if idx == 0:
                    role = "dominant"
                elif idx == 1:
                    role = "secondary"
                elif is_saturated(rgb_values) and ratio > 0.05:
                    role = "accent"
            elif image_type == 'screenshot':
                # スクリーンショットの場合の役割調整
                if idx == 0 and brightness > 0.8:
                    role = "background"
                elif idx == 1 and brightness < 0.2:
                    role = "text"

        # 使用済み役割に追加
        used_roles.add(role)

        # 役割を色情報に追加
        color_with_role = color.copy()
        color_with_role['role'] = role
        colors_with_roles.append(color_with_role)

        logger.info(f"🎨 色 {idx+1}: HEX={hex_color}, 比率={ratio:.2f}({ratio*100:.1f}%), 役割={role}")

    logger.info(f"✅ 色の役割推定処理が完了しました（全{len(colors_with_roles)}色）")
    return colors_with_roles

def estimate_text_role(text_block, all_blocks):
    """テキストブロックの役割（見出し、本文など）を推定する"""
    if not text_block:
        return 'unknown'

    text = text_block.get('text', '')
    position = text_block.get('position', {})
    confidence = text_block.get('confidence', 0)

    # テキストが空か信頼度が低い場合
    if not text or confidence < 0.3:
        return 'unknown'

    # 位置情報
    y_position = position.get('y', 0)
    height = position.get('height', 0)
    width = position.get('width', 0)

    # テキストの長さ
    text_length = len(text)

    # 大文字比率
    uppercase_ratio = sum(1 for c in text if c.isupper()) / max(1, len(text))

    # 見出しの特徴: 短いテキスト、上部にある、大きなフォント
    if (text_length < 30 and y_position < 200 and height > 20) or uppercase_ratio > 0.7:
        return 'heading'

    # サブ見出しの特徴: 中程度の長さ、中程度のフォント
    elif text_length < 100 and 10 < height < 20:
        return 'subheading'

    # ボタンテキストの特徴: 非常に短いテキスト、特定のキーワード
    elif text_length < 20 and any(keyword in text.lower() for keyword in ['submit', 'login', 'sign', 'buy', 'view', 'more', 'click', 'go']):
        return 'button'

    # リンクテキストの特徴
    elif any(keyword in text.lower() for keyword in ['http', 'www', '.com', '.jp']):
        return 'link'

    # 本文テキストの特徴: 長いテキスト
    elif text_length > 100:
        return 'paragraph'

    # その他のラベルテキスト
    elif text_length < 50:
        return 'label'

    # デフォルト
    return 'text'


def detect_grid_pattern(layout_details):
    """レイアウトからグリッドパターンを検出する"""
    # 画像のサイズ情報を取得
    dimensions = layout_details.get('dimensions', {})
    width = dimensions.get('width', 0)
    height = dimensions.get('height', 0)

    if not width or not height:
        return {'type': 'unknown'}

    # アスペクト比に基づいて基本レイアウトタイプを推定
    aspect_ratio = width / height if height > 0 else 0

    # セクション情報を取得
    sections = layout_details.get('sections', [])
    num_sections = len(sections)

    # 基本的なグリッドパターンを推定
    if aspect_ratio > 2.0:
        grid_type = 'horizontal'
        column_count = min(num_sections, 4)
        row_count = 1
    elif aspect_ratio < 0.5:
        grid_type = 'vertical'
        column_count = 1
        row_count = min(num_sections, 4)
    elif num_sections <= 1:
        grid_type = 'single'
        column_count = 1
        row_count = 1
    elif num_sections <= 3:
        # ヘッダー・コンテンツ・フッター構造の可能性
        grid_type = 'header_content_footer'
        column_count = 1
        row_count = num_sections
    else:
        # セクションの位置関係から列数を推定
        columns = estimate_column_count(sections, width)
        grid_type = 'grid'
        column_count = columns
        row_count = max(1, num_sections // columns)

    return {
        'type': grid_type,
        'columns': column_count,
        'rows': row_count,
        'aspect_ratio': aspect_ratio
    }


def estimate_column_count(sections, total_width):
    """セクションの配置から列数を推定する"""
    if not sections or total_width == 0:
        return 1

    # 各セクションの水平方向の中心位置を取得
    centers = []
    for section in sections:
        position = section.get('position', {})
        left = position.get('left', 0)
        width = position.get('width', 0)
        if width > 0:
            center_x = left + width / 2
            centers.append(center_x)

    if not centers:
        return 1

    # 中心位置のクラスタリングで列を推定
    from sklearn.cluster import KMeans
    import numpy as np

    # 1列から4列までのクラスタリングを試して最適な列数を見つける
    best_columns = 1
    best_score = float('inf')

    for columns in range(1, min(5, len(centers) + 1)):
        X = np.array(centers).reshape(-1, 1)
        kmeans = KMeans(n_clusters=columns, n_init=10)
        kmeans.fit(X)

        # クラスタ内の分散を評価スコアとして使用
        score = kmeans.inertia_
        normalized_score = score / columns  # 列数で正規化

        if normalized_score < best_score * 0.7:  # 70%以上の改善があれば採用
            best_score = normalized_score
            best_columns = columns

    return best_columns


def summarize_sections(sections):
    """セクション情報のサマリーを作成する"""
    if not sections:
        return []

    summaries = []
    for i, section in enumerate(sections):
        position = section.get('position', {})
        color = section.get('color', {}).get('dominant', {})

        # ポジションから相対的な位置を推定
        relative_position = 'unknown'
        top = position.get('top', 0)
        height = position.get('height', 0)

        if 'top' in position:
            if i == 0:
                relative_position = 'top'
            elif i == len(sections) - 1:
                relative_position = 'bottom'
            else:
                relative_position = 'middle'

        # セクションタイプを取得（存在する場合）または推定
        section_type = section.get('section_type', '')
        if not section_type:
            # セクションタイプがない場合、位置ベースで推定
            if i == 0 and top < 150:
                section_type = 'header'
            elif i == len(sections) - 1 and height < 200:
                section_type = 'footer'
            elif height < 100:
                section_type = 'divider'
            else:
                section_type = 'content'

        summaries.append({
            'index': i,
            'type': section_type,
            'position': relative_position,
            'height': height,
            'color': color.get('hex', '') if color else ''
        })

    return summaries

def compare_images(original_image, rendered_image, mask=None):
    """
    原画像とレンダリング画像を比較して類似度を評価する

    Args:
        original_image: オリジナル画像（OpenCVイメージ）
        rendered_image: レンダリングされた画像（OpenCVイメージ）
        mask: 比較時に使用するマスク画像（オプション）

    Returns:
        dict: 類似度評価結果
    """
    try:
        # 両方の画像が存在するか確認
        if original_image is None or rendered_image is None:
            return {
                'success': False,
                'error': 'One or both images are missing',
                'ssim_score': 0,
                'differences': None
            }

        # 画像サイズを一致させる
        height_orig, width_orig = original_image.shape[:2]
        height_rendered, width_rendered = rendered_image.shape[:2]

        # サイズが異なる場合は、レンダリング画像をオリジナルのサイズにリサイズ
        if height_orig != height_rendered or width_orig != width_rendered:
            rendered_image = cv2.resize(rendered_image, (width_orig, height_orig),
                                        interpolation=cv2.INTER_AREA)

        # グレースケールに変換
        original_gray = cv2.cvtColor(original_image, cv2.COLOR_BGR2GRAY)
        rendered_gray = cv2.cvtColor(rendered_image, cv2.COLOR_BGR2GRAY)

        # SSIM（構造的類似性）の計算
        if SKIMAGE_SSIM_AVAILABLE:
            score, diff = ssim(original_gray, rendered_gray, full=True)
            diff = (diff * 255).astype("uint8")
        else:
            # SSIMが利用できない場合は、簡易的な比較を行う
            diff = cv2.absdiff(original_gray, rendered_gray)
            score = 1.0 - (np.sum(diff) / (255.0 * diff.size))

        # 差分のヒートマップを作成
        heatmap = cv2.applyColorMap(diff, cv2.COLORMAP_JET)

        # 分析結果用に差分の大きいエリアを特定
        threshold = 50  # 差分の閾値
        _, thresholded = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

        # 差分の大きい領域を検出
        contours, _ = cv2.findContours(thresholded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 差分エリアの情報を収集
        difference_areas = []
        for contour in contours:
            # 十分な大きさの領域のみ処理
            if cv2.contourArea(contour) > 100:  # 小さすぎる差分は無視
                x, y, w, h = cv2.boundingRect(contour)
                difference_areas.append({
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h),
                    'area': int(cv2.contourArea(contour))
                })

        # 差分エリアを面積順にソート
        difference_areas.sort(key=lambda x: x['area'], reverse=True)

        # 結果をまとめる
        return {
            'success': True,
            'ssim_score': float(score),
            'is_similar': score >= 0.85,  # 類似性の閾値
            'differences': difference_areas[:5],  # 上位5つの差分エリアを返す
            'diff_heatmap': heatmap  # 差分のヒートマップ
        }

    except Exception as e:
        logger.error(f"画像比較エラー: {str(e)}")
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'ssim_score': 0,
            'differences': None
        }


def generate_feedback(comparison_result):
    """
    比較結果に基づいてClaudeへのフィードバックを生成する

    Args:
        comparison_result: 画像比較結果

    Returns:
        string: Claudeへのフィードバック文
    """
    if not comparison_result['success']:
        return "比較処理中にエラーが発生しました。コードを確認して再生成してください。"

    ssim_score = comparison_result['ssim_score']
    differences = comparison_result['differences']

    if ssim_score >= 0.95:
        return "レンダリング結果は元のデザインにとても近いです。素晴らしい再現性です。"

    if ssim_score >= 0.85:
        return "レンダリング結果は元のデザインに十分近いですが、細かい調整の余地があります。"

    # フィードバックのベース部分
    feedback = f"レンダリング結果と元のデザインには相違点があります（類似度スコア: {ssim_score:.2f}）。\n"

    # 差分エリアに基づくフィードバックを追加
    if differences and len(differences) > 0:
        feedback += "以下の部分で主な相違が見られます：\n"

        for i, area in enumerate(differences[:3]):  # 最大3つのエリアについてフィードバック
            x, y, width, height = area['x'], area['y'], area['width'], area['height']

            # エリアの位置に基づいてセクションを推測
            position_desc = "上部" if y < 300 else "中央部" if y < 600 else "下部"

            # 相対的な位置を追加
            horizontal_pos = "左側" if x < 300 else "中央" if x < 600 else "右側"

            feedback += f"{i+1}. デザインの{position_desc}{horizontal_pos}（座標: x={x}, y={y}, 幅={width}, 高さ={height}）のエリアを確認してください。\n"

        # 一般的な修正提案
        feedback += "\n考えられる問題点：\n"
        feedback += "- 要素の配置やサイズが元のデザインと異なっている\n"
        feedback += "- 色やコントラストが正確に再現されていない\n"
        feedback += "- フォントやテキストスタイルが元のデザインと一致していない\n"
        feedback += "- 余白やパディングが異なっている\n"

        # 修正アドバイス
        feedback += "\n改善のためのアドバイス：\n"
        feedback += "- 要素の位置とサイズを元のデザインに合わせて調整する\n"
        feedback += "- 色やグラデーションを正確に再現する\n"
        feedback += "- 適切なフォントサイズとウェイトを設定する\n"
        feedback += "- 余白やパディングを元のデザインに合わせる\n"

    return feedback

def analyze_layout_structure(text_blocks, image_sections=None):
    """
    テキストと画像ブロックの位置を元に、レイアウト構造を推定する

    Args:
        text_blocks: テキストブロックのリスト
        image_sections: 画像ブロックのリスト (省略可能)

    Returns:
        dict: レイアウト構造情報
    """
    logger.info("========== レイアウト構造解析開始 ==========")
    logger.info(f"テキストブロック数: {len(text_blocks) if text_blocks else 0}")
    logger.info(f"画像セクション数: {len(image_sections) if image_sections else 0}")

    layout_type = "single-column"
    image_pos = None
    text_pos = "center"

    # テキストブロックが存在しない場合は早期リターン
    if not text_blocks or len(text_blocks) == 0:
        logger.info("テキストブロックがありません - レイアウト解析を中止します")
        result = {
            "layoutType": "unknown",
            "hasImage": bool(image_sections),
            "imagePosition": None,
            "textPosition": None,
            "sectionCount": 0
        }
        logger.info(f"レイアウト構造解析結果: {result}")
        logger.info("========== レイアウト構造解析終了 ==========")
        return result

    # カラム推定（X座標に偏りがあるかどうか）
    x_positions = [block['position']['x'] for block in text_blocks if 'position' in block]
    if not x_positions:
        logger.info("有効な位置情報を持つテキストブロックがありません")
        result = {
            "layoutType": "unknown",
            "hasImage": bool(image_sections),
            "imagePosition": None,
            "textPosition": None,
            "sectionCount": 0
        }
        logger.info(f"レイアウト構造解析結果: {result}")
        logger.info("========== レイアウト構造解析終了 ==========")
        return result

    avg_x = sum(x_positions) / len(x_positions)
    left_count = len([x for x in x_positions if x < avg_x])
    right_count = len([x for x in x_positions if x >= avg_x])

    logger.info(f"X座標分析: 平均={avg_x:.1f}, 左側={left_count}個, 右側={right_count}個")

    # 画面中央からの水平バランスで判定
    # (このロジックは画面サイズに応じて調整する必要がある)
    if abs(left_count - right_count) > 1:
        layout_type = "two-column"
        text_pos = "right" if left_count < right_count else "left"
        logger.info(f"テキスト偏り検出: {text_pos}側に偏っています → 2カラムレイアウト")
    else:
        logger.info("テキスト分布は均等 → 1カラムレイアウト")

    # グリッドレイアウトの検出
    # テキストブロックのY座標を分析して規則的なグリッドかどうかを判定
    y_positions = [block['position']['y'] for block in text_blocks if 'position' in block]
    y_positions.sort()
    logger.info(f"Y座標ソート結果: {y_positions}")

    # 隣接する要素間のY座標の差を計算
    y_diffs = [y_positions[i+1] - y_positions[i] for i in range(len(y_positions)-1)]

    if y_diffs:
        logger.info(f"Y座標の差分: {y_diffs}")
        avg_diff = sum(y_diffs) / len(y_diffs)
        logger.info(f"Y座標の平均差分: {avg_diff:.1f}px")

        # 差が一定の値に近いかどうかを確認 (グリッドの特徴)
        if len(y_diffs) > 2:
            avg_diff = sum(y_diffs) / len(y_diffs)
            regular_spacing = all(abs(diff - avg_diff) < avg_diff * 0.3 for diff in y_diffs)

            if regular_spacing:
                logger.info("Y方向に等間隔配置を検出")
            else:
                logger.info("Y方向の間隔は不規則")

            # 横方向の位置も考慮して、カードグリッドかどうかを判定
            x_clusters = {}
            for block in text_blocks:
                if 'position' in block:
                    pos = block['position']
                    x_cluster = pos['x'] // 100  # 100px単位でクラスタリング
                    if x_cluster not in x_clusters:
                        x_clusters[x_cluster] = 0
                    x_clusters[x_cluster] += 1

            logger.info(f"X方向クラスター: {x_clusters}")

            # 複数の横方向クラスターがあり、縦方向が等間隔ならグリッド
            if len(x_clusters) > 1 and regular_spacing:
                layout_type = "card-grid"
                logger.info("縦方向の等間隔と複数の横方向クラスターを検出 → カードグリッドレイアウト")

    # 画像位置の判定（あれば）
    if image_sections:
        logger.info(f"画像セクション解析: {len(image_sections)}個")
        try:
            # 一番大きな画像の位置を参考にする（複数ある場合）
            if isinstance(image_sections, list) and len(image_sections) > 0:
                # position キーがある要素のみをフィルタリング
                valid_sections = [s for s in image_sections if 'position' in s]
                logger.info(f"有効な位置情報を持つ画像セクション: {len(valid_sections)}個")

                if valid_sections:
                    largest = max(valid_sections,
                                 key=lambda s: s['position'].get('width', 0) * s['position'].get('height', 0))
                    img_x = largest['position'].get('left', 0) or largest['position'].get('x', 0)
                    img_y = largest['position'].get('top', 0) or largest['position'].get('y', 0)
                    img_width = largest['position'].get('width', 0)
                    img_height = largest['position'].get('height', 0)

                    logger.info(f"最大画像セクション: 位置(x={img_x}, y={img_y}), サイズ({img_width}x{img_height})")

                    # 画像の位置を水平方向で判定
                    if img_x < avg_x - 100:  # 左に偏っている
                        image_pos = "left"
                        logger.info("画像は左側に配置されています")
                    elif img_x > avg_x + 100:  # 右に偏っている
                        image_pos = "right"
                        logger.info("画像は右側に配置されています")
                    else:
                        image_pos = "center"
                        logger.info("画像は中央に配置されています")

                    # テキストの垂直位置も判定
                    avg_text_y = sum(y_positions) / len(y_positions)
                    logger.info(f"テキストY座標平均: {avg_text_y:.1f}, 画像Y座標: {img_y}")

                    if img_y < min(y_positions):
                        # 画像がすべてのテキストより上にある
                        image_pos = "top"
                        logger.info("画像はすべてのテキストより上にあります")
                    elif img_y > max(y_positions):
                        # 画像がすべてのテキストより下にある
                        image_pos = "bottom"
                        logger.info("画像はすべてのテキストより下にあります")
        except Exception as e:
            logger.error(f"画像位置判定エラー: {e}")
            image_pos = None

    # セクション数の推定
    # Y座標の分布からセクション数を判定
    section_count = 1
    if y_positions:
        # Y座標をソートし、大きなギャップを探す
        y_positions.sort()
        jumps = []
        for i in range(1, len(y_positions)):
            if y_positions[i] - y_positions[i-1] > 100:  # 100px以上のギャップでセクション分け
                jumps.append(i)
                logger.info(f"セクション分割点を検出: Y={y_positions[i-1]}-{y_positions[i]} (ギャップ={y_positions[i]-y_positions[i-1]}px)")

        # ジャンプの数+1がセクション数
        section_count = len(jumps) + 1
        logger.info(f"検出されたセクション数: {section_count}")

    result = {
        "layoutType": layout_type,
        "hasImage": bool(image_sections),
        "imagePosition": image_pos,
        "textPosition": text_pos,
        "sectionCount": section_count
    }

    logger.info(f"レイアウト構造解析結果: {result}")
    logger.info("========== レイアウト構造解析終了 ==========")
    return result

def format_analysis_for_ai(analysis_data, format_type="markdown"):
    """
    AI向けに解析データをフォーマットします。

    Args:
        analysis_data: 画像解析データ
        format_type: 出力形式 (markdown, json, text)

    Returns:
        string: フォーマットされた解析データ
    """
    logger.info(f"📊 AI向けデータフォーマット処理開始（format_analysis_for_ai）- 形式: {format_type}")

    if not analysis_data:
        logger.warning("⚠️ 解析データが空です")
        return ""

    # 解析データの基本情報をログに出力
    input_data_size = len(str(analysis_data))
    has_text = 'text' in analysis_data and len(analysis_data['text'].get('blocks', [])) > 0
    has_colors = 'colors' in analysis_data and len(analysis_data['colors'].get('colors', [])) > 0
    has_elements = 'elements' in analysis_data and len(analysis_data['elements'].get('elements', [])) > 0
    has_layout = 'layout' in analysis_data and bool(analysis_data['layout'])

    logger.info(f"📥 入力データ情報: サイズ={input_data_size}文字, テキスト={has_text}, 色情報={has_colors}, 要素={has_elements}, レイアウト={has_layout}")

    output = ""
    # フォーマットタイプに基づいて出力を生成
    if format_type == "markdown" or format_type == "text":
        # 一時的に全てJSONフォーマットとして出力
        import json
        output = json.dumps(analysis_data, ensure_ascii=False, indent=2)
        logger.info(f"⚠️ {format_type}形式は未実装のため、JSONフォーマットで出力します")
    else:  # json
        import json
        output = json.dumps(analysis_data, ensure_ascii=False, indent=2)

    return output
