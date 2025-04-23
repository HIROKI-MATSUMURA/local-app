import React, { useState, useEffect, useRef } from "react";
import "../styles/CodeDisplay.scss";
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

const CodeDisplay = ({ htmlCode = "HTMLがありません", cssCode = "CSSがありません", jsCode = "" }) => {
  const [copyHtmlText, setCopyHtmlText] = useState("コピー");
  const [copyCssText, setCopyCssText] = useState("コピー");
  const [copyJsText, setCopyJsText] = useState("コピー");
  const [htmlCopied, setHtmlCopied] = useState(false);
  const [cssCopied, setCssCopied] = useState(false);
  const [jsCopied, setJsCopied] = useState(false);
  const htmlRef = useRef(null);
  const cssRef = useRef(null);
  const jsRef = useRef(null);

  // コードブロックをハイライト - シンプルな方法に変更
  useEffect(() => {
    if (htmlRef.current) {
      try {
        // テキストとして直接表示するシンプルな方法に切り替え
        htmlRef.current.textContent = htmlCode || "";
      } catch (error) {
        console.error('HTMLコード表示エラー:', error);
        htmlRef.current.textContent = "HTMLコードの表示中にエラーが発生しました";
      }
    }

    if (cssRef.current) {
      try {
        // テキストとして直接表示するシンプルな方法に切り替え
        cssRef.current.textContent = cssCode || "";
      } catch (error) {
        console.error('CSSコード表示エラー:', error);
        cssRef.current.textContent = "CSSコードの表示中にエラーが発生しました";
      }
    }

    if (jsRef.current && jsCode) {
      try {
        // テキストとして直接表示するシンプルな方法に切り替え
        jsRef.current.textContent = jsCode || "";
      } catch (error) {
        console.error('JSコード表示エラー:', error);
        jsRef.current.textContent = "JavaScriptコードの表示中にエラーが発生しました";
      }
    }
  }, [htmlCode, cssCode, jsCode]);

  const handleHtmlCopy = () => {
    navigator.clipboard.writeText(htmlCode);
    setCopyHtmlText("コピーしました！");
    setHtmlCopied(true);
    setTimeout(() => {
      setCopyHtmlText("コピー");
      setHtmlCopied(false);
    }, 3000);
  };

  const handleCssCopy = () => {
    navigator.clipboard.writeText(cssCode);
    setCopyCssText("コピーしました！");
    setCssCopied(true);
    setTimeout(() => {
      setCopyCssText("コピー");
      setCssCopied(false);
    }, 3000);
  };

  const handleJsCopy = () => {
    navigator.clipboard.writeText(jsCode);
    setCopyJsText("コピーしました！");
    setJsCopied(true);
    setTimeout(() => {
      setCopyJsText("コピー");
      setJsCopied(false);
    }, 3000);
  };

  // `htmlCode` と `cssCode` の値をデバッグ表示
  useEffect(() => {
    console.log("CodeDisplay に渡される HTML:", htmlCode);
    console.log("CodeDisplay に渡される CSS:", cssCode);
    console.log("CodeDisplay に渡される JavaScript:", jsCode);
  }, [htmlCode, cssCode, jsCode]);

  return (
    <div className="code-display-container">
      {/* HTMLコードの表示 */}
      <div className="code-box">
        <div className="code-header">
          <div className="title-with-copy">
            <h3>
              <span className="code-icon">🌐</span>
              HTMLコード
            </h3>
            <button
              onClick={handleHtmlCopy}
              className={`copy-button ${htmlCopied ? 'copied' : ''}`}
            >
              <span className="copy-icon">{htmlCopied ? '✓' : '📋'}</span>
              {copyHtmlText}
            </button>
          </div>
        </div>
        <pre className="code-block">
          <code ref={htmlRef} className="html"></code>
        </pre>
      </div>

      {/* CSSコードの表示 */}
      <div className="code-box">
        <div className="code-header">
          <div className="title-with-copy">
            <h3>
              <span className="code-icon">🎨</span>
              CSSコード
            </h3>
            <button
              onClick={handleCssCopy}
              className={`copy-button ${cssCopied ? 'copied' : ''}`}
            >
              <span className="copy-icon">{cssCopied ? '✓' : '📋'}</span>
              {copyCssText}
            </button>
          </div>
        </div>
        <pre className="code-block">
          <code ref={cssRef} className="scss"></code>
        </pre>
      </div>

      {/* JavaScriptコードの表示（コードがある場合のみ） */}
      {jsCode && (
        <div className="code-box js-code-box">
          <div className="code-header">
            <div className="title-with-copy">
              <h3>
                <span className="code-icon">⚙️</span>
                JavaScriptコード
              </h3>
              <button
                onClick={handleJsCopy}
                className={`copy-button ${jsCopied ? 'copied' : ''}`}
              >
                <span className="copy-icon">{jsCopied ? '✓' : '📋'}</span>
                {copyJsText}
              </button>
            </div>
          </div>
          <pre className="code-block">
            <code ref={jsRef} className="javascript"></code>
          </pre>
        </div>
      )}
    </div>
  );
};

export default CodeDisplay;
