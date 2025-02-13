import React, { useState, useEffect } from "react";
import "../styles/AICodeGenerator.scss";
import CodeDisplay from "./CodeDisplay";
import CodeGenerationSettings from "./CodeGenerationSettings";

const AICodeGenerator = () => {
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [generatedCSS, setGeneratedCSS] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem("aiCodeGeneratorAPIKey") || "");
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);

  // レスポンシブ設定
  const [responsiveMode, setResponsiveMode] = useState("sp");
  const [breakpoints, setBreakpoints] = useState([]);
  const [aiBreakpoints, setAiBreakpoints] = useState([]);

  // 画像アップロード用の状態
  const [pcImage, setPcImage] = useState(null);
  const [spImage, setSpImage] = useState(null);

  // 初期化処理
  useEffect(() => {
    const storedKey = localStorage.getItem("aiCodeGeneratorAPIKey");
    if (storedKey) setApiKey(storedKey);

    const storedResponsiveMode = localStorage.getItem("responsiveMode") || "sp";
    const storedBreakpoints = JSON.parse(localStorage.getItem("breakpoints")) || [];
    setResponsiveMode(storedResponsiveMode);
    setBreakpoints(storedBreakpoints);
    setAiBreakpoints(
      storedBreakpoints.filter((bp) => bp.active).map((bp) => ({ ...bp, aiActive: true }))
    );
  }, []);

  // プロンプト生成関数
  const generatePrompt = () => {
    const activeBreakpoints = aiBreakpoints.filter((bp) => bp.aiActive);
    const breakpointDescriptions = activeBreakpoints
      .map((bp) => `${bp.name}: ${bp.value}px`)
      .join(", ");

    return `
Generate HTML and CSS based on the following details:

Responsive Mode: ${responsiveMode === "sp" ? "Mobile First" : "Desktop First"}
Breakpoints: ${breakpointDescriptions || "None specified"}
PC Image: ${pcImage ? pcImage.fileName : "No PC image provided"}
SP Image: ${spImage ? spImage.fileName : "No SP image provided"}

Output format:
- HTML enclosed in <html>...</html>
- CSS enclosed in <style>...</style>
    `;
  };

  const handleGenerateCode = async () => {
    if (!apiKey) {
      alert("Please set your API key.");
      return;
    }

    setLoading(true);
    const prompt = generatePrompt();

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are an assistant that generates HTML and CSS." },
            { role: "user", content: prompt },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const output = data.choices[0]?.message.content || "";

      // 正規表現でHTMLとCSSを抽出
      const htmlMatch = output.match(/<html>[\s\S]*<\/html>/i);
      const cssMatch = output.match(/<style>[\s\S]*<\/style>/i);

      // 抽出した結果を管理画面に渡す
      setGeneratedHTML(htmlMatch ? htmlMatch[0] : "HTML not found");
      setGeneratedCSS(cssMatch ? cssMatch[0].replace(/<\/?style>/g, "") : "CSS not found");
      setShowGeneratedCode(true);

      console.log("Generated HTML:", htmlMatch ? htmlMatch[0] : "HTML not found");
      console.log("Generated CSS:", cssMatch ? cssMatch[0].replace(/<\/?style>/g, "") : "CSS not found");

    } catch (error) {
      console.error("Error generating code:", error);
      alert("コード生成中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };


  // 画像アップロード処理
  const handleImageUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file); // アップロード画像をプレビューするためのURL
      const imageData = { fileName: file.name, preview: fileUrl };
      if (type === "pc") {
        setPcImage(imageData);
      } else if (type === "sp") {
        setSpImage(imageData);
      }
    }
  };

  // 画像削除処理
  const handleDeleteImage = (type) => {
    if (type === "pc") {
      setPcImage(null);
    } else if (type === "sp") {
      setSpImage(null);
    }
  };

  return (
    <div className="ai-code-generator">
      <h2>AIコードジェネレーター</h2>

      {/* 設定表示 */}
      <CodeGenerationSettings
        responsiveMode={responsiveMode}
        breakpoints={breakpoints}
        aiBreakpoints={aiBreakpoints}
        setAiBreakpoints={setAiBreakpoints}
      />

      {/* 画像アップロード */}
      <div className="form-group">
        <label>画像をアップロード:</label>
        <div className="image-container">
          {/* PC用 */}
          <div className="image-preview">
            <h4>PC用画像</h4>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, "pc")}
            />
            {pcImage && (
              <>
                <img src={pcImage.preview} alt="PC用画像" />
                <p>{pcImage.fileName}</p>
                <button
                  onClick={() => handleDeleteImage("pc")}
                  className="delete-button"
                >
                  削除
                </button>
              </>
            )}
          </div>
          {/* SP用 */}
          <div className="image-preview">
            <h4>SP用画像</h4>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, "sp")}
            />
            {spImage && (
              <>
                <img src={spImage.preview} alt="SP用画像" />
                <p>{spImage.fileName}</p>
                <button
                  onClick={() => handleDeleteImage("sp")}
                  className="delete-button"
                >
                  削除
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* コード生成ボタン */}
      <button onClick={handleGenerateCode} disabled={loading} className="generate-button">
        {loading ? "生成中..." : "コード生成"}
      </button>

      {/* 生成されたコードの表示 */}
      {showGeneratedCode && <CodeDisplay htmlCode={generatedHTML} cssCode={generatedCSS} />}
    </div>
  );
};

export default AICodeGenerator;
