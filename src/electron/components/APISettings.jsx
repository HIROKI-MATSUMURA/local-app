import React, { useState, useEffect } from "react";

const APISettings = () => {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false); // APIキー表示切り替え

  // ローカルストレージキー
  const LOCAL_STORAGE_KEY = "aiCodeGeneratorAPIKey";

  // 初期化時にローカルストレージからAPIキーを読み込む
  useEffect(() => {
    const storedKey = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

  // APIキーを保存
  const handleSave = () => {
    if (!apiKey.trim()) {
      alert("APIキーを入力してください！");
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, apiKey);
    alert("APIキーを保存しました！");
  };

  // APIキーを削除
  const handleDelete = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setApiKey("");
    alert("APIキーを削除しました！");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "400px", margin: "0 auto", backgroundColor: "#f9f9f9", borderRadius: "8px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)" }}>
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>API設定</h2>

      <div style={{ marginBottom: "20px" }}>
        <label>
          <strong>APIキー:</strong>
        </label>
        <input
          type={showApiKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="ここにAPIキーを入力"
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "10px",
            borderRadius: "8px",
            border: "1px solid #ccc",
          }}
        />
        <div style={{ marginTop: "10px" }}>
          <label>
            <input
              type="checkbox"
              checked={showApiKey}
              onChange={() => setShowApiKey((prev) => !prev)}
            />{" "}
            APIキーを表示
          </label>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          onClick={handleSave}
          style={{
            backgroundColor: "#007bff",
            color: "white",
            padding: "10px 20px",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          保存
        </button>
        <button
          onClick={handleDelete}
          style={{
            backgroundColor: "#dc3545",
            color: "white",
            padding: "10px 20px",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
};
console.log(localStorage.getItem("aiCodeGeneratorAPIKey"));

export default APISettings;
