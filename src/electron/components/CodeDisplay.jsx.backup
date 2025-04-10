import React, { useState, useEffect, useRef } from "react";
import "../styles/CodeDisplay.scss";
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

const CodeDisplay = ({ htmlCode = "HTMLがありません", cssCode = "CSSがありません", jsCode = "" }) => {
  const [copyHtmlText, setCopyHtmlText] = useState("コピー");
  const [copyCssText, setCopyCssText] = useState("コピー");
  const [copyJsText, setCopyJsText] = useState("コピー");
  const htmlRef = useRef(null);
  const cssRef = useRef(null);
  const jsRef = useRef(null);

  // コードブロックをハイライト
  useEffect(() => {
    if (htmlRef.current) {
      htmlRef.current.innerHTML = hljs.highlight(htmlCode, { language: 'html' }).value;
    }
    if (cssRef.current) {
      cssRef.current.innerHTML = hljs.highlight(cssCode, { language: 'scss' }).value;
    }
    if (jsRef.current && jsCode) {
      jsRef.current.innerHTML = hljs.highlight(jsCode, { language: 'javascript' }).value;
    }
  }, [htmlCode, cssCode, jsCode]);

  const handleHtmlCopy = () => {
    navigator.clipboard.writeText(htmlCode);
    setCopyHtmlText("コピーしました！");
    setTimeout(() => setCopyHtmlText("コピー"), 2000);
  };

  const handleCssCopy = () => {
    navigator.clipboard.writeText(cssCode);
    setCopyCssText("コピーしました！");
    setTimeout(() => setCopyCssText("コピー"), 2000);
  };

  const handleJsCopy = () => {
    navigator.clipboard.writeText(jsCode);
    setCopyJsText("コピーしました！");
    setTimeout(() => setCopyJsText("コピー"), 2000);
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
          <h3>
            <span className="code-icon">🌐</span>
            HTMLコード
          </h3>
          <button onClick={handleHtmlCopy} className="copy-button">
            <span className="copy-icon">📋</span>
            {copyHtmlText}
          </button>
        </div>
        <pre className="code-block">
          <code ref={htmlRef} className="html"></code>
        </pre>
      </div>

      {/* CSSコードの表示 */}
      <div className="code-box">
        <div className="code-header">
          <h3>
            <span className="code-icon">🎨</span>
            CSSコード
          </h3>
          <button onClick={handleCssCopy} className="copy-button">
            <span className="copy-icon">📋</span>
            {copyCssText}
          </button>
        </div>
        <pre className="code-block">
          <code ref={cssRef} className="scss"></code>
        </pre>
      </div>

      {/* JavaScriptコードの表示（コードがある場合のみ） */}
      {jsCode && (
        <div className="code-box js-code-box">
          <div className="code-header">
            <h3>
              <span className="code-icon">⚙️</span>
              JavaScriptコード
            </h3>
            <button onClick={handleJsCopy} className="copy-button">
              <span className="copy-icon">📋</span>
              {copyJsText}
            </button>
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
