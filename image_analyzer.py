#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
import os
import base64
import numpy as np
import cv2
from skimage import color, feature, segmentation, measure
from PIL import Image
import io
import matplotlib.pyplot as plt
from collections import Counter

# TensorFlowのインポート（利用可能な場合）
try:
    import tensorflow as tf
    from tensorflow.keras.applications.efficientnet import EfficientNetB0, preprocess_input
    from tensorflow.keras.preprocessing import image as tf_image
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False

# 画像の前処理関数
def preprocess_image(image_data):
    """Base64形式の画像データをNumPy配列に変換"""
    if isinstance(image_data, str) and image_data.startswith('data:image'):
        # Base64文字列からデータ部分を抽出
        image_data = image_data.split(',')[1]

    if isinstance(image_data, str):
        # Base64デコード
        image_bytes = base64.b64decode(image_data)
        # バイトデータからnumpy配列へ変換
        nparr = np.frombuffer(image_bytes, np.uint8)
        # OpenCV形式の画像に変換
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    elif isinstance(image_data, np.ndarray):
        return image_data
    else:
        raise ValueError("サポートされていない画像形式です")

# 色抽出機能
def extract_colors_from_image(image_data, num_colors=5):
    """画像から主要な色を抽出する（K-meansクラスタリング使用）"""
    # 画像の前処理
    img = preprocess_image(image_data)

    # RGBに変換（OpenCVはBGR形式で読み込むため）
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # 画像をピクセルの1次元配列に変換
    pixels = img_rgb.reshape(-1, 3).astype(np.float32)

    # K-means法を使用して代表的な色を抽出
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(pixels, num_colors, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)

    # クラスター（色）ごとのピクセル数をカウント
    counts = Counter(labels.flatten())

    # 出現頻度の高い順にソート
    sorted_colors = sorted([(count, center) for center, count in zip(centers, [counts[i] for i in range(num_colors)])],
                          reverse=True)

    # RGB形式の色を返す
    result = []
    for _, center in sorted_colors:
        r, g, b = center.astype(int)
        color_hex = f"#{r:02x}{g:02x}{b:02x}"
        color_rgb = f"rgb({r},{g},{b})"
        result.append({
            "hex": color_hex.upper(),
            "rgb": color_rgb,
            "values": {"r": int(r), "g": int(g), "b": int(b)}
        })

    return result

# テキスト抽出（OCR）機能
def extract_text_from_image(image_data):
    """画像からテキストを抽出する（テスト実装）"""
    try:
        import pytesseract
        # 画像の前処理
        img = preprocess_image(image_data)

        # 画像を適切に前処理（グレースケール化、ノイズ除去など）
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # ノイズリダクションとコントラスト強調
        gray = cv2.medianBlur(gray, 3)
        gray = cv2.equalizeHist(gray)

        # Tesseractを使用してOCR処理
        config = '--oem 3 --psm 6'
        text = pytesseract.image_to_string(gray, config=config)

        return text.strip()
    except ImportError:
        return "pytesseract（OCRエンジン）がインストールされていません。適切なテキスト抽出を行うには、pytesseractとTesseract OCRをインストールしてください。"

# セクション分析機能
def analyze_image_sections(image_data, num_sections=5):
    """画像を複数のセクションに分割し、各セクションの特徴を抽出"""
    # 画像の前処理
    img = preprocess_image(image_data)

    # RGBに変換
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # 画像の高さと幅を取得
    height, width = img_rgb.shape[:2]

    # 画像を垂直方向にn分割
    section_height = height // num_sections

    sections = []
    for i in range(num_sections):
        # セクションの範囲を計算
        y_start = i * section_height
        y_end = (i + 1) * section_height if i < num_sections - 1 else height

        # セクションを切り出し
        section_img = img_rgb[y_start:y_end, 0:width]

        # セクションの代表色を抽出
        section_colors = extract_colors_from_image(section_img, num_colors=1)
        dominant_color = section_colors[0] if section_colors else None

        # セクションの特徴を抽出（エッジ検出などを行って構造を把握）
        gray_section = cv2.cvtColor(section_img, cv2.COLOR_RGB2GRAY)
        edges = feature.canny(gray_section, sigma=1)
        edge_density = np.mean(edges)

        # テクスチャの複雑さを測定
        if section_img.size > 0:  # 空のセクションを防ぐ
            texture_complexity = np.std(gray_section)
        else:
            texture_complexity = 0

        # セクション情報を保存
        sections.append({
            "section": i + 1,
            "position": {
                "top": int(y_start),
                "bottom": int(y_end),
                "height": int(y_end - y_start)
            },
            "dominantColor": dominant_color,
            "features": {
                "edgeDensity": float(edge_density),
                "textureComplexity": float(texture_complexity)
            }
        })

    return sections

# レイアウト分析機能
def analyze_layout_pattern(image_data):
    """画像のレイアウトパターンを分析"""
    # 画像の前処理
    img = preprocess_image(image_data)

    # 画像の基本情報を取得
    height, width = img.shape[:2]
    aspect_ratio = width / height

    # グレースケールに変換
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # エッジ検出
    edges = feature.canny(gray, sigma=2)

    # 水平・垂直ラインの検出
    lines = cv2.HoughLinesP(edges.astype(np.uint8) * 255, 1, np.pi/180,
                           threshold=100, minLineLength=width//10, maxLineGap=20)

    horizontal_lines = []
    vertical_lines = []

    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if abs(y2 - y1) < abs(x2 - x1) // 5:  # ほぼ水平
                horizontal_lines.append((y1 + y2) // 2)
            elif abs(x2 - x1) < abs(y2 - y1) // 5:  # ほぼ垂直
                vertical_lines.append((x1 + x2) // 2)

    # 類似の線をマージ
    horizontal_lines = merge_similar_lines(horizontal_lines, threshold=height//50)
    vertical_lines = merge_similar_lines(vertical_lines, threshold=width//50)

    # グリッドの検出
    grid_pattern = len(horizontal_lines) > 1 and len(vertical_lines) > 1

    # 列数と行数の推定
    num_rows = len(horizontal_lines) + 1
    num_cols = len(vertical_lines) + 1

    # セクション数
    num_sections = len(analyze_image_sections(image_data))

    # 色解析
    colors = extract_colors_from_image(image_data)

    # レイアウトタイプの判定ロジック
    layout_type = determine_layout_type(num_rows, num_cols, grid_pattern, aspect_ratio, num_sections)

    # 結果オブジェクトを作成
    result = {
        "layoutType": layout_type,
        "confidence": 0.85,  # 確信度（実際のモデルを使った場合はモデルの出力）
        "layoutDetails": {
            "dimensions": {
                "width": int(width),
                "height": int(height),
                "aspectRatio": float(aspect_ratio)
            },
            "grid": {
                "detected": grid_pattern,
                "rows": int(num_rows),
                "columns": int(num_cols),
                "horizontalLines": sorted(horizontal_lines),
                "verticalLines": sorted(vertical_lines)
            },
            "sections": num_sections,
            "styles": {
                "colors": colors
            }
        }
    }

    return result

# 類似の線をマージする補助関数
def merge_similar_lines(lines, threshold):
    """類似の位置にある線をマージする"""
    if not lines:
        return []

    lines = sorted(lines)
    merged_lines = [lines[0]]

    for line in lines[1:]:
        if line - merged_lines[-1] <= threshold:
            # 類似の線を平均位置にマージ
            merged_lines[-1] = (merged_lines[-1] + line) // 2
        else:
            merged_lines.append(line)

    return merged_lines

# レイアウトタイプを判定する関数
def determine_layout_type(num_rows, num_cols, grid_pattern, aspect_ratio, num_sections):
    """レイアウトの種類を判定する"""
    if grid_pattern and num_cols >= 3:
        return "card-grid"
    elif num_rows <= 3 and aspect_ratio > 1.3:
        return "hero"
    elif num_sections >= 4:
        return "landing-page"
    elif num_cols == 2:
        return "two-column"
    else:
        return "custom"

# 要素検出機能
def detect_feature_elements(image_data):
    """画像からUI要素を検出する"""
    # TensorFlowが利用可能かチェック
    if not TENSORFLOW_AVAILABLE:
        return {
            "error": "TensorFlowがインストールされていないため、要素検出はダミーデータを返します",
            "elements": generate_dummy_elements()
        }

    # 画像の前処理
    img = preprocess_image(image_data)

    # レイアウト分析
    layout_analysis = analyze_layout_pattern(image_data)
    layout_type = layout_analysis["layoutType"]

    # TensorFlowを使った要素検出のロジック（デモンストレーション用）
    # 実際の実装では事前学習済みモデルを使用

    # 結果オブジェクトの作成
    result = {
        "layoutType": layout_type,
        "layoutConfidence": layout_analysis["confidence"],
        "elements": []
    }

    # レイアウトタイプに基づいた要素を生成
    if layout_type == "hero":
        result["elements"] = generate_hero_elements(img)
    elif layout_type == "card-grid":
        result["elements"] = generate_card_grid_elements(img, layout_analysis)
    elif layout_type == "two-column":
        result["elements"] = generate_two_column_elements(img)
    else:
        result["elements"] = generate_custom_elements(img, layout_analysis)

    return result

# 以下はダミーデータ生成のためのヘルパー関数（後で実際の検出ロジックに置き換え）
def generate_dummy_elements():
    """ダミーの要素情報を生成"""
    return [
        {
            "type": "header",
            "position": {"top": 0, "left": 0, "width": 100, "height": 10},
            "confidence": 0.92
        },
        {
            "type": "image",
            "position": {"top": 20, "left": 10, "width": 80, "height": 40},
            "confidence": 0.95
        },
        {
            "type": "text",
            "position": {"top": 70, "left": 10, "width": 80, "height": 20},
            "confidence": 0.88
        }
    ]

def generate_hero_elements(img):
    """ヒーローセクションの要素を生成"""
    height, width = img.shape[:2]

    return [
        {
            "type": "header",
            "position": {"top": 0, "left": 0, "width": width, "height": int(height * 0.15)},
            "confidence": 0.92
        },
        {
            "type": "hero-image",
            "position": {"top": int(height * 0.15), "left": 0, "width": width, "height": int(height * 0.5)},
            "confidence": 0.95
        },
        {
            "type": "heading",
            "position": {"top": int(height * 0.25), "left": int(width * 0.1), "width": int(width * 0.8), "height": int(height * 0.1)},
            "confidence": 0.9
        },
        {
            "type": "button",
            "position": {"top": int(height * 0.4), "left": int(width * 0.4), "width": int(width * 0.2), "height": int(height * 0.06)},
            "confidence": 0.85
        },
        {
            "type": "content-section",
            "position": {"top": int(height * 0.65), "left": 0, "width": width, "height": int(height * 0.35)},
            "confidence": 0.9
        }
    ]

def generate_card_grid_elements(img, layout_analysis):
    """カードグリッドの要素を生成"""
    height, width = img.shape[:2]

    grid = layout_analysis["layoutDetails"]["grid"]
    rows = max(1, grid["rows"] - 1)  # ヘッダー行を考慮
    cols = max(1, grid["columns"])

    elements = [
        {
            "type": "header",
            "position": {"top": 0, "left": 0, "width": width, "height": int(height * 0.15)},
            "confidence": 0.92
        }
    ]

    card_height = int((height - height * 0.15) / rows)
    card_width = int(width / cols)

    for r in range(rows):
        for c in range(cols):
            top = int(height * 0.15) + r * card_height
            left = c * card_width

            elements.append({
                "type": "card",
                "position": {"top": top, "left": left, "width": card_width, "height": card_height},
                "confidence": 0.88,
                "children": [
                    {
                        "type": "image",
                        "position": {"top": top, "left": left, "width": card_width, "height": int(card_height * 0.6)},
                        "confidence": 0.85
                    },
                    {
                        "type": "heading",
                        "position": {"top": top + int(card_height * 0.65), "left": left + int(card_width * 0.1),
                                    "width": int(card_width * 0.8), "height": int(card_height * 0.1)},
                        "confidence": 0.82
                    },
                    {
                        "type": "text",
                        "position": {"top": top + int(card_height * 0.75), "left": left + int(card_width * 0.1),
                                    "width": int(card_width * 0.8), "height": int(card_height * 0.2)},
                        "confidence": 0.8
                    }
                ]
            })

    return elements

def generate_two_column_elements(img):
    """2カラムレイアウトの要素を生成"""
    height, width = img.shape[:2]

    return [
        {
            "type": "header",
            "position": {"top": 0, "left": 0, "width": width, "height": int(height * 0.15)},
            "confidence": 0.92
        },
        {
            "type": "image-column",
            "position": {"top": int(height * 0.15), "left": 0, "width": int(width * 0.5), "height": int(height * 0.7)},
            "confidence": 0.9,
            "children": [
                {
                    "type": "image",
                    "position": {"top": int(height * 0.2), "left": int(width * 0.05),
                                "width": int(width * 0.4), "height": int(height * 0.6)},
                    "confidence": 0.95
                }
            ]
        },
        {
            "type": "text-column",
            "position": {"top": int(height * 0.15), "left": int(width * 0.5), "width": int(width * 0.5), "height": int(height * 0.7)},
            "confidence": 0.9,
            "children": [
                {
                    "type": "heading",
                    "position": {"top": int(height * 0.2), "left": int(width * 0.55),
                                "width": int(width * 0.4), "height": int(height * 0.1)},
                    "confidence": 0.88
                },
                {
                    "type": "text",
                    "position": {"top": int(height * 0.35), "left": int(width * 0.55),
                                "width": int(width * 0.4), "height": int(height * 0.3)},
                    "confidence": 0.85
                },
                {
                    "type": "button",
                    "position": {"top": int(height * 0.7), "left": int(width * 0.55),
                                "width": int(width * 0.2), "height": int(height * 0.06)},
                    "confidence": 0.82
                }
            ]
        },
        {
            "type": "footer",
            "position": {"top": int(height * 0.85), "left": 0, "width": width, "height": int(height * 0.15)},
            "confidence": 0.87
        }
    ]

def generate_custom_elements(img, layout_analysis):
    """カスタムレイアウトの要素を生成"""
    height, width = img.shape[:2]

    # セクション情報をもとに要素を生成
    num_sections = layout_analysis["layoutDetails"]["sections"]
    section_height = height / max(1, num_sections)

    elements = []

    # ヘッダー
    elements.append({
        "type": "header",
        "position": {"top": 0, "left": 0, "width": width, "height": int(section_height * 0.8)},
        "confidence": 0.92
    })

    # コンテンツセクション
    for i in range(1, num_sections):
        section_top = int(i * section_height)
        elements.append({
            "type": "section",
            "position": {"top": section_top, "left": 0, "width": width, "height": int(section_height)},
            "confidence": 0.85,
            "children": [
                {
                    "type": "heading",
                    "position": {"top": section_top + int(section_height * 0.1),
                                "left": int(width * 0.1),
                                "width": int(width * 0.8),
                                "height": int(section_height * 0.15)},
                    "confidence": 0.8
                },
                {
                    "type": "content",
                    "position": {"top": section_top + int(section_height * 0.3),
                                "left": int(width * 0.1),
                                "width": int(width * 0.8),
                                "height": int(section_height * 0.6)},
                    "confidence": 0.75
                }
            ]
        })

    return elements

# メイン実行部（コマンドライン引数によって機能を切り替え）
def main():
    """コマンドラインからの実行時のエントリーポイント"""
    if len(sys.argv) < 3:
        print(json.dumps({
            "error": "引数が不足しています。使用法: python image_analyzer.py <機能> <画像のBase64または画像パス>"
        }))
        return

    feature = sys.argv[1]
    image_data = sys.argv[2]

    # ファイルパスが与えられた場合はBase64に変換
    if os.path.isfile(image_data):
        with open(image_data, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')

    # 機能に基づいて適切な関数を呼び出す
    result = None
    if feature == 'extract_colors':
        result = extract_colors_from_image(image_data)
    elif feature == 'extract_text':
        result = extract_text_from_image(image_data)
    elif feature == 'analyze_sections':
        result = analyze_image_sections(image_data)
    elif feature == 'analyze_layout':
        result = analyze_layout_pattern(image_data)
    elif feature == 'detect_elements':
        result = detect_feature_elements(image_data)
    elif feature == 'analyze_all':
        # すべての分析を行い結果を結合
        colors = extract_colors_from_image(image_data)
        text = extract_text_from_image(image_data)
        sections = analyze_image_sections(image_data)
        layout = analyze_layout_pattern(image_data)
        elements = detect_feature_elements(image_data)

        result = {
            "colors": colors,
            "text": text,
            "sections": sections,
            "layout": layout,
            "elements": elements
        }
    else:
        result = {
            "error": f"不明な機能: {feature}。サポートされる機能: extract_colors, extract_text, analyze_sections, analyze_layout, detect_elements, analyze_all"
        }

    # 結果をJSON形式で出力
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
