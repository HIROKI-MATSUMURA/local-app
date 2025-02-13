import React from "react";

const CodeDisplay = ({ htmlCode, cssCode }) => {
  return (
    <div className="code-display">
      <div>
        <h3>HTMLコード</h3>
        <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "5px" }}>
          {htmlCode}
        </pre>
      </div>
      <div>
        <h3>CSSコード</h3>
        <pre style={{ background: "#e8f7ff", padding: "10px", borderRadius: "5px" }}>
          {cssCode}
        </pre>
      </div>
    </div>
  );
};

export default CodeDisplay;
