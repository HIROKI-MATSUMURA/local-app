import React, { useState, useEffect } from "react";
import "../styles/CodeDisplay.scss";

const CodeDisplay = ({ htmlCode = "HTMLがありません", cssCode = "CSSがありません" }) => {
  const [copyText, setCopyText] = useState("コピー");

  // クリップボードにHTMLコードをコピー
  const handleCopy = () => {
    navigator.clipboard.writeText(htmlCode).then(() => {
      setCopyText("コピーしました！");
      setTimeout(() => setCopyText("コピー"), 2000); // 2秒後に「コピー」に戻す
    });
  };

  // `htmlCode` と `cssCode` の値をデバッグ表示
  useEffect(() => {
    console.log("CodeDisplay に渡される HTML:", htmlCode);
    console.log("CodeDisplay に渡される CSS:", cssCode);
  }, [htmlCode, cssCode]);

  return (
    <div className="code-display-container">
      {/* HTMLコードの表示 */}
      <div className="code-box">
        <div className="code-header">
          <h3>HTMLコード</h3>
          <button onClick={handleCopy} className="copy-button">
            {copyText}
          </button>
        </div>
        <pre>
          <code>{htmlCode}</code>
        </pre>
      </div>

      {/* CSSコードの表示 */}
      <div className="code-box">
        <div className="code-header">
          <h3>CSSコード</h3>
        </div>
        <pre>
          <code>{cssCode}</code>
        </pre>
      </div>
    </div>
  );
};

export default CodeDisplay;
