import React, { useState } from 'react';
import Breakpoints from './Breakpoints';

const ResponsiveConfig = () => {
  const [responsiveMode, setResponsiveMode] = useState('sp'); // 'sp' -> スマホファースト, 'pc' -> PCファースト
  const [breakpoints, setBreakpoints] = useState([
    { id: 1, name: 'sm', value: 600, active: true },
    { id: 2, name: 'md', value: 768, active: true },
    { id: 3, name: 'lg', value: 1024, active: true },
    { id: 4, name: 'xl', value: 1440, active: true },
  ]);

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
        ? `  ${name}: "screen and (min-width: #{map.get($breakpoints,'${name}')}px)"`
        : `  ${name}: "screen and (max-width: #{map.get($breakpoints,'${name}')}px)"`
    ).join(',\n')}
);

// スマホファースト用メディアクエリ
@mixin mq($mediaquery: sm) {
  @media #{map.get($mediaquerys, $mediaquery)} {
    @content;
  }
}
`;
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>レスポンシブ設定</h2>

      {/* スマホファースト/PCファースト切り替え */}
      <div style={{ marginBottom: '20px' }}>
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
        <label style={{ marginLeft: '10px' }}>
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
      <Breakpoints
        responsiveMode={responsiveMode}
        breakpoints={breakpoints}
        setBreakpoints={setBreakpoints}
      />

      {/* 保存ボタン */}
      <button onClick={handleSave} style={{ marginTop: '20px' }}>
        保存
      </button>
    </div>
  );
};

export default ResponsiveConfig;
