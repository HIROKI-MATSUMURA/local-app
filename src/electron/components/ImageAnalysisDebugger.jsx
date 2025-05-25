/**
 * 画像解析デバッガーコンポーネント
 * 画像解析結果の詳細表示と精度検証を行います
 */

import React, { useState, useEffect } from 'react';
import '../styles/ImageAnalysisDebugger.scss';

const ImageAnalysisDebugger = ({ isVisible, onClose, imageData }) => {
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('colors');

  // 画像解析を実行
  const runAnalysis = async () => {
    if (!imageData) return;

    setLoading(true);
    setError(null);

    try {
      console.log('🔍 画像解析デバッガー: 解析開始');
      
      // window.apiを使って画像解析を実行
      if (window.api && window.api.analyzeImageDebug) {
        const result = await window.api.analyzeImageDebug(imageData);
        setAnalysisResult(result);
        console.log('📊 解析結果:', result);
      } else {
        throw new Error('画像解析APIが利用できません');
      }
    } catch (err) {
      console.error('❌ 画像解析エラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 画像データが変更されたら自動で解析実行
  useEffect(() => {
    console.log('🔍 ImageAnalysisDebugger useEffect:', { isVisible, hasImageData: !!imageData });
    if (isVisible && imageData) {
      runAnalysis();
    }
  }, [isVisible, imageData]);

  console.log('🔍 ImageAnalysisDebugger render:', { isVisible, hasImageData: !!imageData });

  if (!isVisible) {
    console.log('🔍 ImageAnalysisDebugger: isVisible=false なので何も表示しません');
    return null;
  }

  return (
    <div className="image-analysis-debugger-overlay">
      <div className="image-analysis-debugger">
        <div className="debugger-header">
          <h3>🔍 画像解析デバッガー</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="debugger-content">
          {loading && (
            <div className="loading-section">
              <div className="spinner"></div>
              <p>画像を解析中...</p>
            </div>
          )}

          {error && (
            <div className="error-section">
              <h4>❌ エラー</h4>
              <p>{error}</p>
              <button onClick={runAnalysis} className="retry-button">
                🔄 再試行
              </button>
            </div>
          )}

          {analysisResult && !loading && (
            <div className="analysis-results">
              <div className="tabs">
                <button 
                  className={`tab ${activeTab === 'colors' ? 'active' : ''}`}
                  onClick={() => setActiveTab('colors')}
                >
                  🎨 色抽出
                </button>
                <button 
                  className={`tab ${activeTab === 'text' ? 'active' : ''}`}
                  onClick={() => setActiveTab('text')}
                >
                  📝 テキスト認識
                </button>
                <button 
                  className={`tab ${activeTab === 'layout' ? 'active' : ''}`}
                  onClick={() => setActiveTab('layout')}
                >
                  📐 レイアウト分析
                </button>
                <button 
                  className={`tab ${activeTab === 'elements' ? 'active' : ''}`}
                  onClick={() => setActiveTab('elements')}
                >
                  🔲 要素検出
                </button>
                <button 
                  className={`tab ${activeTab === 'validation' ? 'active' : ''}`}
                  onClick={() => setActiveTab('validation')}
                >
                  ✅ 品質検証
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'colors' && (
                  <ColorsTab colors={analysisResult.data?.colors} />
                )}
                {activeTab === 'text' && (
                  <TextTab 
                    text={analysisResult.data?.text} 
                    textBlocks={analysisResult.data?.textBlocks}
                  />
                )}
                {activeTab === 'layout' && (
                  <LayoutTab layout={analysisResult.data?.layout} />
                )}
                {activeTab === 'elements' && (
                  <ElementsTab 
                    elements={analysisResult.data?.elements}
                    cards={analysisResult.data?.cards}
                    mainSections={analysisResult.data?.mainSections}
                  />
                )}
                {activeTab === 'validation' && (
                  <ValidationTab validation={analysisResult.validation} />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="debugger-footer">
          <button onClick={runAnalysis} disabled={loading || !imageData}>
            🔄 再解析
          </button>
          <button onClick={() => downloadResults(analysisResult)}>
            💾 結果をダウンロード
          </button>
        </div>
      </div>
    </div>
  );
};

// 色抽出タブ
const ColorsTab = ({ colors }) => (
  <div className="colors-tab">
    <h4>抽出された色 ({colors?.length || 0}色)</h4>
    {colors && colors.length > 0 ? (
      <div className="colors-grid">
        {colors.map((color, index) => (
          <div key={index} className="color-item">
            <div 
              className="color-swatch" 
              style={{ backgroundColor: color.hex }}
            ></div>
            <div className="color-info">
              <strong>{color.hex}</strong>
              <div>{color.rgb}</div>
              <div>占有率: {(color.ratio * 100).toFixed(1)}%</div>
              <div>役割: {color.role}</div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <p>色が抽出されませんでした</p>
    )}
  </div>
);

// テキスト認識タブ
const TextTab = ({ text, textBlocks }) => (
  <div className="text-tab">
    <h4>認識されたテキスト</h4>
    <div className="text-content">
      <div className="full-text">
        <h5>全文:</h5>
        <pre>{text || '(テキストが認識されませんでした)'}</pre>
      </div>
      <div className="text-blocks">
        <h5>テキストブロック ({textBlocks?.length || 0}個):</h5>
        {textBlocks && textBlocks.length > 0 ? (
          <div className="blocks-list">
            {textBlocks.map((block, index) => (
              <div key={index} className="text-block">
                <div className="block-text">"{block.text}"</div>
                <div className="block-info">
                  <span>信頼度: {(block.confidence * 100).toFixed(1)}%</span>
                  <span>位置: ({block.position.x}, {block.position.y})</span>
                  <span>サイズ: {block.position.width}×{block.position.height}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>テキストブロックが検出されませんでした</p>
        )}
      </div>
    </div>
  </div>
);

// レイアウト分析タブ
const LayoutTab = ({ layout }) => (
  <div className="layout-tab">
    <h4>レイアウト分析結果</h4>
    {layout ? (
      <div className="layout-info">
        <div className="layout-type">
          <h5>レイアウトタイプ:</h5>
          <div className="type-badge">{layout.layoutType}</div>
          <div>信頼度: {(layout.confidence * 100).toFixed(1)}%</div>
        </div>
        
        <div className="layout-details">
          <h5>詳細情報:</h5>
          {layout.layoutDetails && (
            <div className="details-grid">
              <div>幅: {layout.layoutDetails.dimensions?.width}px</div>
              <div>高さ: {layout.layoutDetails.dimensions?.height}px</div>
              <div>アスペクト比: {layout.layoutDetails.dimensions?.aspectRatio?.toFixed(2)}</div>
              <div>水平線: {layout.layoutDetails.horizontalLines}本</div>
              <div>垂直線: {layout.layoutDetails.verticalLines}本</div>
              <div>有意領域: {layout.layoutDetails.significantAreas}個</div>
            </div>
          )}
        </div>

        <div className="layout-patterns">
          <h5>パターン評価:</h5>
          {layout.patterns && (
            <div className="patterns-list">
              {Object.entries(layout.patterns).map(([pattern, score]) => (
                <div key={pattern} className="pattern-item">
                  <span className="pattern-name">{pattern}</span>
                  <div className="pattern-score">
                    <div 
                      className="score-bar" 
                      style={{ width: `${score * 100}%` }}
                    ></div>
                    <span>{(score * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ) : (
      <p>レイアウト分析結果がありません</p>
    )}
  </div>
);

// 要素検出タブ
const ElementsTab = ({ elements, cards, mainSections }) => (
  <div className="elements-tab">
    <h4>検出された要素</h4>
    
    <div className="elements-section">
      <h5>UI要素 ({elements?.elements?.length || 0}個)</h5>
      {elements?.elements && elements.elements.length > 0 ? (
        <div className="elements-list">
          {elements.elements.map((element, index) => (
            <div key={index} className="element-item">
              <div className="element-type">{element.type}</div>
              <div className="element-info">
                <span>信頼度: {(element.confidence * 100).toFixed(1)}%</span>
                <span>位置: ({element.position.left}, {element.position.top})</span>
                <span>サイズ: {element.position.width}×{element.position.height}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>UI要素が検出されませんでした</p>
      )}
    </div>

    <div className="cards-section">
      <h5>カード要素 ({cards?.cards?.length || 0}個)</h5>
      {cards?.cards && cards.cards.length > 0 ? (
        <div className="cards-list">
          {cards.cards.map((card, index) => (
            <div key={index} className="card-item">
              <div>ID: {card.id}</div>
              <div>信頼度: {(card.confidence * 100).toFixed(1)}%</div>
              <div>位置: ({card.position.left}, {card.position.top})</div>
              <div>サイズ: {card.position.width}×{card.position.height}</div>
            </div>
          ))}
        </div>
      ) : (
        <p>カード要素が検出されませんでした</p>
      )}
    </div>

    <div className="sections-section">
      <h5>メインセクション ({mainSections?.sections?.length || 0}個)</h5>
      {mainSections?.sections && mainSections.sections.length > 0 ? (
        <div className="sections-list">
          {mainSections.sections.map((section, index) => (
            <div key={index} className="section-item">
              <div className="section-name">{section.name}</div>
              <div className="section-type">{section.type}</div>
              <div>信頼度: {(section.confidence * 100).toFixed(1)}%</div>
              <div>位置: ({section.position.left}, {section.position.top})</div>
              <div>サイズ: {section.position.width}×{section.position.height}</div>
            </div>
          ))}
        </div>
      ) : (
        <p>メインセクションが検出されませんでした</p>
      )}
    </div>
  </div>
);

// 品質検証タブ
const ValidationTab = ({ validation }) => (
  <div className="validation-tab">
    <h4>品質検証結果</h4>
    {validation ? (
      <div className="validation-results">
        <div className="overall-score">
          <h5>総合スコア</h5>
          <div className={`score-display ${getScoreClass(validation.overallScore)}`}>
            {validation.overallScore?.toFixed(1) || 'N/A'}%
          </div>
        </div>

        <div className="component-scores">
          <h5>コンポーネント別スコア</h5>
          {validation.componentScores && Object.keys(validation.componentScores).length > 0 ? (
            <div className="scores-grid">
              {Object.entries(validation.componentScores).map(([component, score]) => (
                <div key={component} className="component-score">
                  <div className="component-name">{component}</div>
                  <div className={`score ${getScoreClass(score.score)}`}>
                    {score.score?.toFixed(1) || 'N/A'}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>コンポーネントスコアがありません</p>
          )}
        </div>

        <div className="issues-recommendations">
          <div className="issues">
            <h5>検出された問題</h5>
            {validation.criticalIssues && validation.criticalIssues.length > 0 ? (
              <ul>
                {validation.criticalIssues.map((issue, index) => (
                  <li key={index} className="issue-item">{issue}</li>
                ))}
              </ul>
            ) : (
              <p>問題は検出されませんでした</p>
            )}
          </div>

          <div className="recommendations">
            <h5>改善提案</h5>
            {validation.recommendations && validation.recommendations.length > 0 ? (
              <ul>
                {validation.recommendations.map((rec, index) => (
                  <li key={index} className="recommendation-item">{rec}</li>
                ))}
              </ul>
            ) : (
              <p>改善提案はありません</p>
            )}
          </div>
        </div>
      </div>
    ) : (
      <p>検証結果がありません</p>
    )}
  </div>
);

// スコアに基づくCSSクラスを取得
const getScoreClass = (score) => {
  if (score >= 80) return 'good';
  if (score >= 60) return 'medium';
  return 'poor';
};

// 結果をダウンロード
const downloadResults = (results) => {
  if (!results) return;

  const dataStr = JSON.stringify(results, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `image-analysis-${Date.now()}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
};

export default ImageAnalysisDebugger;