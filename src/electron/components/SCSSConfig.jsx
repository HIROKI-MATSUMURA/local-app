import React, { useState, useEffect, useRef } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css'; // シンタックスハイライトのテーマを適用

const ResponsiveConfig = ({ addLog }) => {
  const [mobileFirst, setMobileFirst] = useState(true);
  const [breakpoints, setBreakpoints] = useState([
    { key: 'sm', value: 576, active: true },
    { key: 'md', value: 768, active: true },
    { key: 'lg', value: 992, active: true },
    { key: 'xl', value: 1200, active: false },
    { key: 'xxl', value: 1400, active: false },
  ]);
  const [scssCode, setScssCode] = useState('');
  const codeRef = useRef(null); // コードブロックを参照するための ref

  const generateSCSS = () => {
    const activeBreakpoints = breakpoints
      .filter((bp) => bp.active)
      .reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});

    const startFrom = mobileFirst ? 'sp' : 'pc';
    const sortedKeys = Object.keys(activeBreakpoints).sort((a, b) => activeBreakpoints[a] - activeBreakpoints[b]);
    const breakpointsString = sortedKeys
      .map((key) => `${key}: ${activeBreakpoints[key]}`)
      .join(',\n    ');

    const mediaqueriesString = sortedKeys
      .map((key) => {
        const query = mobileFirst
          ? `"screen and (min-width: #{map-get($breakpoints,'${key}')}"px)`
          : `"screen and (max-width: #{map-get($breakpoints,'${key}')}"px)`;
        return `${key}: ${query}`;
      })
      .join(',\n    ');

    return `
$startFrom: ${startFrom};

// ブレークポイント
$breakpoints: (
  ${breakpointsString}
);

// メディアクエリ
$mediaquerys: (
  ${mediaqueriesString}
);

// 使用例
@mixin mq($mediaquery: md) {
  @media #{map-get($mediaquerys, $mediaquery)} {
    @content;
  }
}`;
  };

  useEffect(() => {
    setScssCode(generateSCSS());
  }, [breakpoints, mobileFirst]);

  // SCSSコードのハイライトを適用
  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightBlock(codeRef.current);
    }
  }, [scssCode]);

  const handleSave = () => {
    addLog({
      time: new Date().toLocaleString(),
      message: 'レスポンシブ設定が更新されました',
    });

    console.log('レスポンシブ設定が保存されました', { mobileFirst, breakpoints });
  };

  return (
    <div>
      <h2>レスポンシブ関連</h2>

      {/* スマホファースト / PCファースト設定 */}
      <div style={{ marginBottom: '20px' }}>
        <h3>レスポンシブの方向性</h3>
        <label>
          <input
            type="radio"
            name="responsive"
            checked={mobileFirst}
            onChange={() => setMobileFirst(true)}
          />
          スマホファースト
        </label>
        <label style={{ marginLeft: '20px' }}>
          <input
            type="radio"
            name="responsive"
            checked={!mobileFirst}
            onChange={() => setMobileFirst(false)}
          />
          PCファースト
        </label>
      </div>

      {/* ブレークポイント設定 */}
      <div style={{ marginBottom: '20px' }}>
        <h3>ブレークポイント</h3>
        {breakpoints.map((bp, index) => (
          <div key={index} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={bp.active}
              onChange={() =>
                setBreakpoints((prev) =>
                  prev.map((b, i) => (i === index ? { ...b, active: !b.active } : b))
                )
              }
              style={{ marginRight: '10px' }}
            />
            <input
              type="text"
              value={bp.key}
              onChange={(e) =>
                setBreakpoints((prev) =>
                  prev.map((b, i) => (i === index ? { ...b, key: e.target.value } : b))
                )
              }
              style={{ width: '60px', marginRight: '10px' }}
            />
            <input
              type="number"
              value={bp.value}
              onChange={(e) =>
                setBreakpoints((prev) =>
                  prev.map((b, i) => (i === index ? { ...b, value: Number(e.target.value) } : b))
                )
              }
              style={{ width: '100px', marginRight: '10px' }}
            />
          </div>
        ))}
      </div>

      {/* SCSSコードプレビュー */}
      <div style={{ marginBottom: '20px' }}>
        <h3>SCSSコードプレビュー</h3>
        <pre
          ref={codeRef}
          style={{
            backgroundColor: '#f4f4f4',
            padding: '10px',
            borderRadius: '5px',
            overflowX: 'auto',
            fontSize: '14px',
          }}
        >
          <code className="scss">{scssCode}</code>
        </pre>
      </div>

      {/* 保存ボタン */}
      <button onClick={handleSave} style={{ padding: '10px 20px', fontSize: '16px' }}>
        保存
      </button>
    </div>
  );
};

export default ResponsiveConfig;
