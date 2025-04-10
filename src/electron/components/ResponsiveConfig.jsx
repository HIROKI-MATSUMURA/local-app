import React, { useState, useEffect } from 'react';
import Breakpoints from './Breakpoints';
import '../styles/ResponsiveConfig.scss';
import Header from './Header';

const ResponsiveConfig = () => {
  const [responsiveMode, setResponsiveMode] = useState('sp'); // 'sp' -> スマホファースト, 'pc' -> PCファースト
  const [breakpoints, setBreakpoints] = useState([
    { id: 1, name: 'sm', value: 600, active: true },
    { id: 2, name: 'md', value: 768, active: true },
    { id: 3, name: 'lg', value: 1024, active: true },
    { id: 4, name: 'xl', value: 1440, active: true },
  ]);

  // localStorageから設定を読み込む
  useEffect(() => {
    const savedResponsiveMode = localStorage.getItem('responsiveMode');
    const savedBreakpoints = JSON.parse(localStorage.getItem('breakpoints'));

    if (savedResponsiveMode) {
      setResponsiveMode(savedResponsiveMode);
    }

    if (savedBreakpoints) {
      setBreakpoints(savedBreakpoints);
    }
  }, []);

  // ステートが変更されたときにlocalStorageに保存する
  useEffect(() => {
    localStorage.setItem('responsiveMode', responsiveMode);
    localStorage.setItem('breakpoints', JSON.stringify(breakpoints));
  }, [responsiveMode, breakpoints]);

  const handleModeChange = (event) => {
    const selectedMode = event.target.value;
    setResponsiveMode(selectedMode);
    console.log(`レスポンシブモードが変更されました: ${selectedMode === 'sp' ? 'スマホファースト' : 'PCファースト'}`);
  };

  const handleSave = () => {
    const activeBreakpoints = breakpoints.filter((bp) => bp.active);
    const breakpointsObj = activeBreakpoints.reduce((acc, { name, value }) => {
      acc[name] = value;
      return acc;
    }, {});

    // 保存するSCSSコードを生成
    window.api.send('save-scss-file', {
      filePath: 'src/scss/global/_breakpoints.scss',
      content: generateScssContent(breakpointsObj),
      breakpoints: breakpointsObj,
      responsiveMode
    });
  };

  const generateScssContent = (breakpoints) => {
    return `@use "sass:map";

// どっちファーストの設定（"sp" or "pc"）
$startFrom: ${responsiveMode};

// ブレークポイント
$breakpoints: (
${Object.entries(breakpoints).map(([name, value]) => `  ${name}: ${value}px`).join(',\n')}
);

// メディアクエリ
$mediaquerys: (
${Object.entries(breakpoints).map(([name, value]) =>
      responsiveMode === 'sp'
        ? `  ${name}: "screen and (min-width: #{map.get($breakpoints,'${name}')})"`
        : `  ${name}: "screen and (max-width: #{map.get($breakpoints,'${name}')})"`
    ).join(',\n')}
);

// スマホファースト用メディアクエリ
@mixin mq($mediaquery: md) {
  @media #{map.get($mediaquerys, $mediaquery)} {
    @content;
  }
}
`;
  };

  return (
    <div className="responsive-config">
      <Header
        title="レスポンシブ設定"
        description="レスポンシブデザインの設定を管理します"
      />

      {/* スマホファースト/PCファースト切り替え */}
      <div className="radio-group">
        <label>
          <input
            type="radio"
            name="responsiveMode"
            value="sp"
            checked={responsiveMode === 'sp'}
            onChange={handleModeChange}
          />
          スマホファースト
        </label>
        <label>
          <input
            type="radio"
            name="responsiveMode"
            value="pc"
            checked={responsiveMode === 'pc'}
            onChange={handleModeChange}
          />
          PCファースト
        </label>
      </div>

      {/* ブレークポイント設定 */}
      <div className="breakpoints-container">
        <h3>ブレークポイント設定</h3>
        <table className="breakpoints-table">
          <thead>
            <tr>
              <th>有効</th>
              <th>名前</th>
              <th>値(px)</th>
              <th>削除</th>
            </tr>
          </thead>
          <tbody>
            {breakpoints.map((bp) => (
              <tr key={bp.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={bp.active}
                    onChange={() => {
                      setBreakpoints((prev) =>
                        prev.map((item) => (item.id === bp.id ? { ...item, active: !item.active } : item))
                      );
                    }}
                    disabled={bp.name === 'md'}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={bp.name}
                    onChange={(e) => {
                      setBreakpoints((prev) =>
                        prev.map((item) => (item.id === bp.id ? { ...item, name: e.target.value } : item))
                      );
                    }}
                    disabled={bp.name === 'md'}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={bp.value}
                    onChange={(e) => {
                      setBreakpoints((prev) =>
                        prev.map((item) => (item.id === bp.id ? { ...item, value: parseInt(e.target.value, 10) } : item))
                      );
                    }}
                  />
                </td>
                <td>
                  {bp.name !== 'md' && (
                    <button
                      onClick={() => {
                        setBreakpoints((prev) => prev.filter((item) => item.id !== bp.id));
                      }}
                      className="remove-button"
                    >
                      削除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            setBreakpoints((prev) => [
              ...prev,
              { id: Date.now(), name: 'new', value: 0, active: true },
            ]);
          }}
          className="add-button"
        >
          ブレークポイントを追加
        </button>
      </div>

      {/* 保存ボタン */}
      <button onClick={handleSave} className="save-button">
        保存
      </button>
    </div>
  );
};

export default ResponsiveConfig;
