import React, { useState, useEffect } from 'react';
import Breakpoints from './Breakpoints';

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
        ? `  ${name}: "screen and (min-width: #{map.get($breakpoints,'${name}')}px)"`
        : `  ${name}: "screen and (max-width: #{map.get($breakpoints,'${name}')}px)"`
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
    <div style={{ padding: '20px' }}>
      <h2>レスポンシブ設定</h2>

      {/* スマホファースト/PCファースト切り替え */}
      <div style={styles.radioGroup}>
        <label>
          <input
            type="radio"
            name="responsiveMode"
            value="sp"
            checked={responsiveMode === 'sp'}
            onChange={handleModeChange}
            style={styles.radioInput}
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
            style={styles.radioInput}
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
      <button onClick={handleSave} style={styles.saveButton}>
        保存
      </button>
    </div>
  );
};

// スタイルの定義
const styles = {
  radioGroup: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
  },
  radioInput: {
    accentColor: '#007bff',
    marginRight: '5px',
  },
  saveButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    width: '100%',
    marginTop: '20px',
    transition: 'background-color 0.3s',
  },
};

export default ResponsiveConfig;
