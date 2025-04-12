def compress_analysis_results(analysis_data, options=None):
    """複数の解析結果を統合した圧縮データを生成する"""
    logger.info("compress_analysis_results: 処理開始")

    if not options:
        options = {}

    # 出力フォーマットタイプ（structured, semantic, template）
    format_type = options.get('format_type', 'structured')

    try:
        # 入力データの詳細を記録
        if isinstance(analysis_data, dict):
            logger.info(f"入力データキー: {list(analysis_data.keys())}")

            # 各キーの内容確認
            for key in ['colors', 'text', 'layout', 'elements', 'sections']:
                if key in analysis_data:
                    if isinstance(analysis_data[key], list):
                        logger.info(f"{key}: {len(analysis_data[key])}項目")
                    elif isinstance(analysis_data[key], dict):
                        logger.info(f"{key}: {list(analysis_data[key].keys())}")
                    else:
                        logger.info(f"{key}: {type(analysis_data[key]).__name__}")
                else:
                    logger.info(f"{key}: なし")
        else:
            logger.warning(f"入力データが辞書ではありません: {type(analysis_data).__name__}")
            # 空の辞書を作成
            analysis_data = {}

        # 必須データがない場合のフォールバック
        if 'colors' not in analysis_data or not analysis_data['colors']:
            logger.warning("色情報がありません。デフォルト値を設定します。")
            analysis_data['colors'] = [
                {
                    'rgb': 'rgb(255,255,255)',
                    'hex': '#ffffff',
                    'ratio': 0.8,
                    'role': 'background'
                },
                {
                    'rgb': 'rgb(0,0,0)',
                    'hex': '#000000',
                    'ratio': 0.2,
                    'role': 'text'
                }
            ]

        if 'layout' not in analysis_data or not analysis_data['layout']:
            logger.warning("レイアウト情報がありません。デフォルト値を設定します。")
            analysis_data['layout'] = {
                'layoutType': 'standard',
                'confidence': 0.7,
                'width': 1200,
                'height': 800,
                'aspectRatio': 1.5
            }

        if 'text' not in analysis_data or not analysis_data['text']:
            logger.warning("テキスト情報がありません。デフォルト値を設定します。")
            analysis_data['text'] = {
                'text': '',
                'textBlocks': []
            }

        if 'elements' not in analysis_data or not analysis_data['elements']:
            logger.warning("要素情報がありません。デフォルト値を設定します。")
            analysis_data['elements'] = []

        if 'sections' not in analysis_data or not analysis_data['sections']:
            logger.warning("セクション情報がありません。デフォルト値を設定します。")
            analysis_data['sections'] = []

        # 基本解析情報
        layout_info = analysis_data.get('layout', {})
        colors = analysis_data.get('colors', [])
        sections = analysis_data.get('sections', [])
        elements = analysis_data.get('elements', {})
        text_blocks = analysis_data.get('text_blocks', [])
        text_content = analysis_data.get('text', '')

        # テキストデータの構造調整
        if isinstance(text_content, dict) and 'text' in text_content:
            # textが辞書の場合、textフィールドを抽出
            text_data_content = text_content.get('text', '')
            if 'textBlocks' in text_content:
                text_blocks = text_content.get('textBlocks', [])
        else:
            # textが文字列の場合はそのまま使用
            text_data_content = text_content if isinstance(text_content, str) else ''

        # レイアウト情報を整理
        layout = {
            'width': layout_info.get('width', 1200),
            'height': layout_info.get('height', 800),
            'aspectRatio': layout_info.get('aspectRatio', '3:2'),
            'type': layout_info.get('layoutType', 'standard'),
            'template': layout_info.get('layoutType', 'standard'),  # typeと同じ値をtemplateにも設定
            'gridPattern': layout_info.get('gridPattern', {
                'columns': 12,
                'rows': 'auto',
                'gap': '20px'
            }),
            'sectionCount': len(sections),
            'imagePosition': layout_info.get('imagePosition', 'center'),
            'textPosition': layout_info.get('textPosition', 'center')
        }

        # 色情報を整理（役割の統一）- 必ずデータが存在することを保証
        if not colors or len(colors) == 0:
            # デフォルトの色を提供
            normalized_colors = [
                {
                    'rgb': 'rgb(255,255,255)',
                    'hex': '#ffffff',
                    'role': 'background',
                    'ratio': 0.8
                },
                {
                    'rgb': 'rgb(0,0,0)',
                    'hex': '#000000',
                    'role': 'text',
                    'ratio': 0.2
                }
            ]
        else:
            normalized_colors = []
            standard_roles = ['background', 'text', 'primary', 'secondary', 'accent', 'highlight']

            # 色情報の正規化
            for color in colors:
                if not color or not isinstance(color, dict):
                    continue

                # roleが標準ロールに含まれているか確認
                role = color.get('role', '')
                if not role or role not in standard_roles:
                    # 役割を推定
                    if color.get('ratio', 0) > 0.3 or is_light_color(color.get('rgb', '')):
                        role = 'background'
                    elif not is_light_color(color.get('rgb', '')):
                        role = 'text'
                    elif 'primary' not in [c.get('role') for c in normalized_colors]:
                        role = 'primary'
                    elif 'secondary' not in [c.get('role') for c in normalized_colors]:
                        role = 'secondary'
                    else:
                        role = 'accent'

                normalized_colors.append({
                    'rgb': color.get('rgb', ''),
                    'hex': color.get('hex', ''),
                    'role': role,
                    'ratio': color.get('ratio', 0)
                })

            # 最低2色は確保（不足時にデフォルト追加）
            if len(normalized_colors) < 2:
                if not any(c.get('role') == 'background' for c in normalized_colors):
                    normalized_colors.append({
                        'rgb': 'rgb(255,255,255)',
                        'hex': '#ffffff',
                        'role': 'background',
                        'ratio': 0.8
                    })
                if not any(c.get('role') == 'text' for c in normalized_colors):
                    normalized_colors.append({
                        'rgb': 'rgb(0,0,0)',
                        'hex': '#000000',
                        'role': 'text',
                        'ratio': 0.2
                    })

        # テキスト情報を整理（JS側が期待する構造に変換）
        text_data = {
            'content': text_data_content,
            'blocks': text_blocks,
            'hierarchy': []
        }

        # テキスト階層の構築
        if text_blocks:
            for block in text_blocks:
                if not isinstance(block, dict):
                    continue

                # レベルの決定（デフォルトはテキスト）
                level = 3

                # ブロックの特性から見出しレベルを推定
                if block.get('importance', 0) > 0.8 or block.get('fontSize', 0) > 24:
                    level = 1  # 見出し
                elif block.get('importance', 0) > 0.5 or block.get('fontSize', 0) > 18:
                    level = 2  # 小見出し

                text_data['hierarchy'].append({
                    'level': level,
                    'text': block.get('text', ''),
                    'position': block.get('position', {})
                })

        # 要素情報を整理
        element_list = []
        if isinstance(elements, list):
            element_list = elements
        elif isinstance(elements, dict) and 'elements' in elements:
            element_list = elements.get('elements', [])

        # 要素サマリー情報の作成
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

        # データ構造の確認ログ
        logger.info(f"圧縮後のデータ構造: {list(compressed_data.keys())}")
        logger.info(f"色情報: {len(compressed_data['colors'])}色")
        logger.info(f"レイアウトタイプ: {compressed_data['layout']['type']}")

        # フォーマットタイプに応じた変換
        if format_type == 'semantic':
            result = convert_to_semantic_format(compressed_data)
            compressed_data['semanticFormat'] = result
        elif format_type == 'template':
            result = convert_to_template_format(compressed_data)
            compressed_data['templateFormat'] = result

        return compressed_data

    except Exception as e:
        logger.error(f"解析データの圧縮中にエラーが発生しました: {str(e)}")
        traceback.print_exc()

        # エラー情報を明示的に含める
        return {
            'error': str(e),
            'trace': traceback.format_exc(),
            'layout': {
                'width': 1200,
                'height': 800,
                'type': 'standard',
                'template': 'standard'
            },
            'colors': [
                {
                    'rgb': 'rgb(255,255,255)',
                    'hex': '#ffffff',
                    'role': 'background',
                    'ratio': 0.8
                },
                {
                    'rgb': 'rgb(0,0,0)',
                    'hex': '#000000',
                    'role': 'text',
                    'ratio': 0.2
                }
            ],
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
            }
        }
