import React, { useState } from "react";
import "../styles/StyleXConverter.scss";

const StyleXConverter = () => {
  const [htmlContent, setHtmlContent] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [stylexOutput, setStylexOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleHtmlChange = (e) => {
    setHtmlContent(e.target.value);
  };

  const handleCssChange = (e) => {
    setCssContent(e.target.value);
  };

  const handleConvert = async () => {
    if (!htmlContent.trim() && !cssContent.trim()) {
      setError("HTMLまたはCSSを入力してください");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // API設定コンポーネントから保存されたAPIキーを取得
      const apiKey = localStorage.getItem("aiCodeGeneratorAPIKey");

      if (!apiKey) {
        throw new Error("API設定から OpenAI APIキーを設定してください。");
      }

      const prompt = `
HTMLとCSSのコードをStyleXとReactのコンポーネントに変換してください。
変換後は、React.js（または適切なフレームワーク）を使用し、StyleXを実装してください。
コードをシンプルで再利用可能な形に整理し、適切なコンポーネント設計を心がけてください。

HTML:
\`\`\`html
${htmlContent}
\`\`\`

CSS:
\`\`\`css
${cssContent}
\`\`\`

以下の形式で返してください：
1. StyleXスタイルの定義
2. Reactコンポーネント実装
3. 使用例
`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are an expert web developer who specializes in converting HTML/CSS to React with StyleX." },
            { role: "user", content: prompt }
          ],
          max_tokens: 2000,
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        throw new Error(`APIエラー: ${response.status}`);
      }

      const data = await response.json();
      setStylexOutput(data.choices[0].message.content);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyOutput = () => {
    navigator.clipboard.writeText(stylexOutput);
    alert("コピーしました！");
  };

  return (
    <div className="stylex-converter">
      <h2>StyleXコンバーター</h2>
      <p>HTMLとCSSをStyleXを使用したReactコンポーネントに変換します</p>

      <div className="input-container">
        <div className="input-group">
          <label>HTML</label>
          <textarea
            value={htmlContent}
            onChange={handleHtmlChange}
            placeholder="<div class='card'>...</div>"
            rows={10}
          />
        </div>

        <div className="input-group">
          <label>CSS</label>
          <textarea
            value={cssContent}
            onChange={handleCssChange}
            placeholder=".card { ... }"
            rows={10}
          />
        </div>
      </div>

      <div className="actions">
        <button
          className="convert-button"
          onClick={handleConvert}
          disabled={loading}
        >
          {loading ? "変換中..." : "StyleXに変換"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {stylexOutput && (
        <div className="output-container">
          <div className="output-header">
            <h3>変換結果</h3>
            <button className="copy-button" onClick={handleCopyOutput}>
              コピー
            </button>
          </div>
          <pre className="output-code">{stylexOutput}</pre>
        </div>
      )}
    </div>
  );
};

export default StyleXConverter;
