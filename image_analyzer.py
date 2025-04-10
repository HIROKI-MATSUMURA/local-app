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

try:
    import pytesseract
    from pytesseract import Output
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

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

# 定数定義
MAX_COLORS = 5
RESIZE_WIDTH = 300
MIN_SECTION_HEIGHT_RATIO = 0.05

def decode_image(image_data):
    """
    Base64形式の画像データをOpenCVイメージに変換

    Args:
        image_data: Base64エンコードされた画像データ

    Returns:
        dict: OpenCVイメージと関連情報を含む辞書
    """
    try:
        # Base64文字列から画像データを抽出
        if 'base64,' in image_data:
            image_data = image_data.split('base64,')[1]

        # Base64デコード
        image_bytes = base64.b64decode(image_data)

        # PILイメージに変換
        pil_image = Image.open(BytesIO(image_bytes))

        # OpenCVフォーマットに変換
        if pil_image.mode == 'RGBA':
            # アルファチャンネルを持つ画像の場合
            cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGBA2BGRA)
        else:
            # その他の画像の場合
            cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

        return {
            'opencv': cv_image,
            'pil': pil_image,
            'width': cv_image.shape[1],
            'height': cv_image.shape[0]
        }
    except Exception as e:
        print(f"画像のデコードエラー: {str(e)}")
        traceback.print_exc()
        return None

def extract_colors(image_data):
    """
    画像から主要な色を抽出

    Args:
        image_data: Base64エンコードされた画像データ

    Returns:
        list: 主要な色のリスト
    """
    try:
        img_data = decode_image(image_data)
        if not img_data:
            return {'error': 'Failed to decode image'}

        img = img_data['opencv']
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
        print(f"色抽出エラー: {str(e)}")
        traceback.print_exc()
        return []

def extract_text(image_data):
    """
    画像からテキストを抽出

    Args:
        image_data: Base64エンコードされた画像データ

    Returns:
        dict: 抽出されたテキストと位置情報
    """
    try:
        img_data = decode_image(image_data)
        if not img_data:
            return {'error': 'Failed to decode image'}

        img = img_data['opencv']

        # Tesseractが利用可能かチェック
        if not TESSERACT_AVAILABLE:
            return {
                'text': '',
                'error': 'Tesseract OCR is not available',
                'textBlocks': []
            }

        # グレースケールに変換
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # OCR処理
        ocr_data = pytesseract.image_to_data(gray, output_type=Output.DICT)

        # テキストブロックを抽出
        text_blocks = []
        full_text = []

        for i in range(len(ocr_data['text'])):
            # 空のテキストはスキップ
            if ocr_data['text'][i].strip() == '':
                continue

            # テキストブロック情報を追加
            x = ocr_data['left'][i]
            y = ocr_data['top'][i]
            w = ocr_data['width'][i]
            h = ocr_data['height'][i]
            conf = ocr_data['conf'][i]
            text = ocr_data['text'][i]

            full_text.append(text)

            text_blocks.append({
                'text': text,
                'confidence': float(conf) / 100.0,
                'position': {
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h
                }
            })

        return {
            'text': ' '.join(full_text),
            'textBlocks': text_blocks
        }
    except Exception as e:
        print(f"テキスト抽出エラー: {str(e)}")
        traceback.print_exc()
        return {
            'text': '',
            'error': str(e),
            'textBlocks': []
        }

def analyze_sections(image_data):
    """
    画像をセクションに分割して分析

    Args:
        image_data: Base64エンコードされた画像データ

    Returns:
        list: セクション情報のリスト
    """
    try:
        img_data = decode_image(image_data)
        if not img_data:
            return {'error': 'Failed to decode image'}

        img = img_data['opencv']
        height, width = img.shape[:2]

        # グレースケールに変換
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # エッジ検出
        edges = cv2.Canny(gray, 50, 150)

        # 水平方向の射影を計算
        h_projection = np.sum(edges, axis=1)

        # 変化点を検出（セクションの境界）
        thres = np.mean(h_projection) * 0.5
        boundaries = [0]

        for i in range(1, len(h_projection)):
            if h_projection[i] > thres and h_projection[i-1] <= thres:
                boundaries.append(i)
            elif h_projection[i] <= thres and h_projection[i-1] > thres:
                boundaries.append(i)

        if height not in boundaries:
            boundaries.append(height)

        # 小さすぎるセクションを除外
        min_height = height * MIN_SECTION_HEIGHT_RATIO
        sections = []

        for i in range(0, len(boundaries) - 1, 2):
            if i + 1 >= len(boundaries):
                break

            y1 = boundaries[i]
            y2 = boundaries[i + 1]

            if y2 - y1 < min_height:
                continue

            # セクションの色を分析
            section_img = img[y1:y2, 0:width]

            # 中心座標を計算
            center_x = width // 2
            center_y = (y1 + y2) // 2

            # セクション情報を追加
            sections.append({
                'section': f'section_{i//2}',
                'position': {
                    'top': int(y1),
                    'left': 0,
                    'width': width,
                    'height': y2 - y1,
                    'center': [center_x, center_y]
                },
                'color': {
                    'dominant': get_dominant_color(section_img)
                }
            })

        return sections
    except Exception as e:
        print(f"セクション分析エラー: {str(e)}")
        traceback.print_exc()
        return []

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
        image_data: Base64エンコードされた画像データ

    Returns:
        dict: レイアウト分析結果
    """
    try:
        img_data = decode_image(image_data)
        if not img_data:
            return {'error': 'Failed to decode image'}

        img = img_data['opencv']
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
                'sections': sections,
                'styles': {
                    'colors': extract_colors(image_data)
                }
            }
        }

        # レイアウトパターンを推測
        aspect_ratio = width / height if height > 0 else 0
        num_sections = len(sections)

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
        print(f"レイアウト分析エラー: {str(e)}")
        traceback.print_exc()
        return {
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
        image_data: Base64エンコードされた画像データ

    Returns:
        dict: 検出された要素
    """
    try:
        img_data = decode_image(image_data)
        if not img_data:
            return {'error': 'Failed to decode image'}

        img = img_data['opencv']
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

            # 小さすぎる輪郭はスキップ
            if area < min_area:
                continue

            # 輪郭の情報を取得
            x, y, w, h = cv2.boundingRect(contour)

            # 要素のタイプを推測
            element_type = classify_element(img[y:y+h, x:x+w], w/h)

            # 要素情報を追加
            elements.append({
                'type': element_type,
                'position': {
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h)
                },
                'dominantColor': get_dominant_color(img[y:y+h, x:x+w])
            })

        # レイアウト情報と組み合わせて返す
        layout_info = analyze_layout(image_data)

        return {
            'layoutType': layout_info['layoutType'],
            'layoutConfidence': layout_info['confidence'],
            'elements': elements
        }
    except Exception as e:
        print(f"要素検出エラー: {str(e)}")
        traceback.print_exc()
        return {
            'layoutType': 'unknown',
            'layoutConfidence': 0.5,
            'elements': []
        }

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
        # ファイルからBase64データを読み込み
        with open(file_path, 'r') as f:
            image_data = f.read()

        result = None

        # コマンドに応じて機能を実行
        if command == 'extract_colors':
            result = extract_colors(image_data)
        elif command == 'extract_text':
            result = extract_text(image_data)
        elif command == 'analyze_sections':
            result = analyze_sections(image_data)
        elif command == 'analyze_layout':
            result = analyze_layout(image_data)
        elif command == 'detect_elements':
            result = detect_elements(image_data)
        elif command == 'analyze_all':
            # すべての分析を実行
            layout = analyze_layout(image_data)
            elements = detect_elements(image_data)
            text = extract_text(image_data)

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
