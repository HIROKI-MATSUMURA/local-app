import React, { useState, useEffect } from "react";
import "../styles/AICodeGenerator.scss";
import CodeDisplay from "./CodeDisplay";
import CodeGenerationSettings from "./CodeGenerationSettings";
import { generatePrompt } from "../utils/promptGenerator";
import { extractTextFromImage, extractColorsFromImage } from "../utils/imageAnalyzer.js";


const LOCAL_STORAGE_KEY = "ai_code_generator_state";

const AICodeGenerator = () => {
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [generatedCSS, setGeneratedCSS] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem("aiCodeGeneratorAPIKey") || "");
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);

  // レスポンシブ設定
  const [responsiveMode, setResponsiveMode] = useState("sp");
  const [breakpoints, setBreakpoints] = useState([]);
  const [aiBreakpoints, setAiBreakpoints] = useState([]);

  // 画像解析結果
  const [pcColors, setPcColors] = useState([]);
  const [spColors, setSpColors] = useState([]);
  const [pcText, setPcText] = useState("");
  const [spText, setSpText] = useState("");
  const [pcLayout, setPcLayout] = useState([]);
  const [spLayout, setSpLayout] = useState([]);

  // 画像アップロード用
  const [pcImage, setPcImage] = useState(null);
  const [spImage, setSpImage] = useState(null);

  // 初期化処理（ローカルストレージから設定を読み込む）
  useEffect(() => {
    const storedKey = localStorage.getItem("aiCodeGeneratorAPIKey");
    if (storedKey) setApiKey(storedKey);

    const storedResponsiveMode = localStorage.getItem("responsiveMode") || "sp";
    const storedBreakpoints = JSON.parse(localStorage.getItem("breakpoints")) || [];
    setResponsiveMode(storedResponsiveMode);
    setBreakpoints(storedBreakpoints);
    setAiBreakpoints(storedBreakpoints.filter((bp) => bp.active).map((bp) => ({ ...bp, aiActive: true })));
  }, []);


  const [pcImageBase64, setPcImageBase64] = useState(null);
  const [spImageBase64, setSpImageBase64] = useState(null);


  const handleGenerateCode = async () => {
    if (!apiKey) {
      alert("APIキーを設定してください。");
      return;
    }

    if (!pcImageBase64 && !spImageBase64) {
      alert("画像をアップロードしてください。");
      return;
    }

    setLoading(true);

    try {
      const prompt = await generatePrompt({
        responsiveMode,
        aiBreakpoints,
        pcImageBase64,
        spImageBase64,
      });

      console.log("生成されたプロンプト:", prompt);

      // 空のプロンプトを送らないようチェック
      if (!prompt || prompt.trim() === "") {
        console.error("エラー: 送信するプロンプトが空です");
        alert("プロンプトが空のため、コードを生成できません。");
        setLoading(false);
        return;
      }

      const requestBody = {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an assistant that generates HTML and CSS." },
          { role: "user", content: prompt }
        ],
        max_tokens: 3000, // 2000 から 1000 に変更（調整）
        temperature: 0.7
      };

      console.log("送信する API リクエスト:", JSON.stringify(requestBody, null, 2));

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(`APIエラー: ${response.status} - ${errorMessage}`);
      }

      const data = await response.json();
      console.log("APIレスポンス:", data);

      // 生成されたコードを取得
      const generatedCode = data.choices?.[0]?.message?.content || "";
      if (!generatedCode) {
        console.error("エラー: コードが生成されませんでした");
        alert("コードが生成されませんでした。");
        return;
      }

      // HTML と CSS の分割処理
      // const htmlMatch = generatedCode.match(/<html>[\s\S]*<\/html>/);
      // const cssMatch = generatedCode.match(/<style>[\s\S]*<\/style>/);

      console.log("生成されたコード:", generatedCode);

      const htmlMatch = generatedCode.match(/<html>[\s\S]*<\/html>/);
      const cssMatch = generatedCode.match(/<style>[\s\S]*<\/style>/);

      const extractedHTML = htmlMatch ? htmlMatch[0] : "";
      const extractedCSS = cssMatch ? cssMatch[0].replace(/<\/?style>/g, "") : "";

      console.log("抽出された HTML:", extractedHTML);
      console.log("抽出された CSS:", extractedCSS);

      setGeneratedHTML(extractedHTML);
      setGeneratedCSS(extractedCSS);

      setShowGeneratedCode(true); // 追加


      setGeneratedHTML(htmlMatch ? htmlMatch[0] : "<p>HTMLが生成されませんでした。</p>");
      setGeneratedCSS(cssMatch ? cssMatch[0].replace(/<\/?style>/g, "") : "/* CSSが生成されませんでした。 */");




      setGeneratedCode(generatedCode);
      // 生成されたコードを表示
      console.log("生成されたコード:", generatedCode);


    } catch (error) {
      console.error("エラー:", error);
      alert(`エラーが発生しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };


  // 画像アップロード時の処理
  const handleImageUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = reader.result;

      if (type === "pc") {
        setPcImage({ fileName: file.name, preview: fileUrl });
        setPcImageBase64(base64); // useState に保存
        setPcColors(await extractColorsFromImage(base64));
        setPcText(await extractTextFromImage(base64));
      } else {
        setSpImage({ fileName: file.name, preview: fileUrl });
        setSpImageBase64(base64); // useState に保存
        setSpColors(await extractColorsFromImage(base64));
        setSpText(await extractTextFromImage(base64));
      }
    };

    reader.readAsDataURL(file);
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
                  onClick={() => setPcImage(null)}
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
                  onClick={() => setSpImage(null)}
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
