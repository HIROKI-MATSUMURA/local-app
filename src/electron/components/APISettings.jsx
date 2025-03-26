import React, { useState, useEffect } from "react";

const APISettings = () => {
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [showApiKeys, setShowApiKeys] = useState(false); // APIキー表示切り替え
  const [selectedProvider, setSelectedProvider] = useState("openai"); // デフォルトはOpenAI
  const [isLoading, setIsLoading] = useState(true);

  // 初期化時にAPIキーを読み込む
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        setIsLoading(true);
        // メインプロセスからAPIキーを取得
        const storedData = await window.api.getApiKey();
        if (storedData) {
          if (storedData.openaiKey) {
            setOpenaiKey(storedData.openaiKey);
            // ローカルストレージにも保存（AICodeGeneratorが現在それを使用しているため）
            localStorage.setItem("aiCodeGeneratorAPIKey", storedData.openaiKey);
          }
          if (storedData.claudeKey) {
            setClaudeKey(storedData.claudeKey);
          }
          if (storedData.selectedProvider) {
            setSelectedProvider(storedData.selectedProvider);
          }
        }
      } catch (error) {
        console.error("APIキーの読み込みに失敗しました:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadApiKey();
  }, []);

  // APIキーの保存が完了したときのリスナーを設定
  useEffect(() => {
    const handleApiKeySaved = (success) => {
      if (success) {
        alert("API設定を保存しました！");
        // ローカルストレージにも保存（AICodeGeneratorが現在それを使用しているため）
        localStorage.setItem("aiCodeGeneratorAPIKey", selectedProvider === 'openai' ? openaiKey : claudeKey);
      } else {
        alert("API設定の保存に失敗しました。");
      }
    };

    // リスナーを登録
    window.api.receive("api-key-saved", handleApiKeySaved);

    // クリーンアップ
    return () => {
      // リスナーの削除は不要（preload.jsでremoveAllListenersを行っているため）
    };
  }, [openaiKey, claudeKey, selectedProvider]);

  // APIキーを保存
  const handleSave = () => {
    const apiKeyToCheck = selectedProvider === 'openai' ? openaiKey : claudeKey;

    if (!apiKeyToCheck.trim()) {
      alert(`選択されたプロバイダ(${selectedProvider})のAPIキーを入力してください！`);
      return;
    }

    // Claude APIキーの簡易検証
    if (selectedProvider === 'claude' && !claudeKey.startsWith('sk-ant-')) {
      if (!confirm('Claude APIキーは通常「sk-ant-」から始まります。このキーを使用しますか？')) {
        return;
      }
    }

    console.log(`API設定を保存します: プロバイダ=${selectedProvider}, キーの長さ=${apiKeyToCheck.length}`);

    // メインプロセスにAPIキーを送信して保存
    window.api.saveApiKey({
      apiKey: openaiKey,
      claudeKey: claudeKey,
      selectedProvider: selectedProvider
    });

    // LocalStorageにも即時反映
    localStorage.setItem("aiCodeGeneratorAPIKey", apiKeyToCheck);
    console.log(`LocalStorageにも保存しました: aiCodeGeneratorAPIKey=${apiKeyToCheck.substring(0, 5)}...`);
  };

  // APIキーを削除
  const handleDelete = () => {
    // 空のAPIキーを保存して実質的に削除
    window.api.saveApiKey({
      apiKey: "",
      claudeKey: "",
      selectedProvider: "openai"
    });
    setOpenaiKey("");
    setClaudeKey("");
    setSelectedProvider("openai");
    localStorage.removeItem("aiCodeGeneratorAPIKey");
    alert("API設定を削除しました！");
  };

  // プロバイダの変更
  const handleProviderChange = (e) => {
    setSelectedProvider(e.target.value);

    // 選択されたプロバイダのAPIキーをローカルストレージに保存
    const apiKeyToSave = e.target.value === 'openai' ? openaiKey : claudeKey;
    if (apiKeyToSave) {
      localStorage.setItem("aiCodeGeneratorAPIKey", apiKeyToSave);
    }
  };

  if (isLoading) {
    return <div>API設定を読み込み中...</div>;
  }

  return (
    <div style={{ padding: "20px", maxWidth: "500px", margin: "0 auto", backgroundColor: "#f9f9f9", borderRadius: "8px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)" }}>
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>API設定</h2>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: "10px" }}>
          APIプロバイダの選択:
        </label>
        <div style={{ display: "flex", gap: "15px", marginBottom: "20px" }}>
          <label>
            <input
              type="radio"
              name="provider"
              value="openai"
              checked={selectedProvider === "openai"}
              onChange={handleProviderChange}
            />{" "}
            OpenAI (GPT-4o)
          </label>
          <label>
            <input
              type="radio"
              name="provider"
              value="claude"
              checked={selectedProvider === "claude"}
              onChange={handleProviderChange}
            />{" "}
            Anthropic (Claude)
          </label>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label>
            <strong>OpenAI APIキー:</strong>
          </label>
          <input
            type={showApiKeys ? "text" : "password"}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="OpenAI APIキーを入力"
            style={{
              width: "100%",
              padding: "10px",
              marginTop: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              backgroundColor: selectedProvider === "openai" ? "#fff" : "#f0f0f0",
            }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label>
            <strong>Claude APIキー:</strong>
          </label>
          <input
            type={showApiKeys ? "text" : "password"}
            value={claudeKey}
            onChange={(e) => setClaudeKey(e.target.value)}
            placeholder="Claude APIキーを入力"
            style={{
              width: "100%",
              padding: "10px",
              marginTop: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              backgroundColor: selectedProvider === "claude" ? "#fff" : "#f0f0f0",
            }}
          />
          <div style={{ fontSize: "12px", marginTop: "5px", color: "#666" }}>
            <p>※ Claude APIキーは「sk-ant-」から始まるキーを使用してください。</p>
            <p>※ API Key Console: <a href="https://console.anthropic.com/keys" target="_blank" rel="noopener noreferrer">https://console.anthropic.com/keys</a></p>
          </div>
        </div>

        <div style={{ marginTop: "10px" }}>
          <label>
            <input
              type="checkbox"
              checked={showApiKeys}
              onChange={() => setShowApiKeys((prev) => !prev)}
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

export default APISettings;
