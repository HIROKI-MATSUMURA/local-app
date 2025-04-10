import React, { useState, useEffect } from "react";
import Header from './Header';

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

    // OpenAI APIキーの簡易検証
    if (selectedProvider === 'openai' && !openaiKey.startsWith('sk-')) {
      if (!confirm('OpenAI APIキーは通常「sk-」から始まります。このキーを使用しますか？')) {
        return;
      }
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
    return (
      <div className="api-settings">
        <div className="loader">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="api-settings">
      <Header
        title="API設定"
        description="AI機能を使用するためのAPIキーを設定します"
      />

      <div className="provider-selection">
        <label className="section-title">
          APIプロバイダの選択
        </label>
        <div className="provider-options">
          <div className="provider-option">
            <input
              type="radio"
              id="provider-openai"
              name="provider"
              value="openai"
              checked={selectedProvider === "openai"}
              onChange={handleProviderChange}
            />
            <label htmlFor="provider-openai" className="provider-card">
              <div className="provider-icon">🤖</div>
              <div className="provider-name">OpenAI (GPT-4o)</div>
              <div className="provider-check">✓</div>
            </label>
          </div>
          <div className="provider-option">
            <input
              type="radio"
              id="provider-claude"
              name="provider"
              value="claude"
              checked={selectedProvider === "claude"}
              onChange={handleProviderChange}
            />
            <label htmlFor="provider-claude" className="provider-card">
              <div className="provider-icon">🧠</div>
              <div className="provider-name">Anthropic (Claude)</div>
              <div className="provider-check">✓</div>
            </label>
          </div>
        </div>
      </div>

      <div className="api-form">
        <div className={`api-field ${selectedProvider === "openai" ? "active" : "inactive"}`}>
          <div className="field-header">
            <label className="api-label">OpenAI APIキー</label>
          </div>
          <input
            type={showApiKeys ? "text" : "password"}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="OpenAI APIキーを入力"
            className={`api-input ${selectedProvider !== "openai" ? "disabled" : ""}`}
          />
          <div className="field-info">
            <p>※ OpenAI APIキーは「sk-」から始まるキーを使用してください。</p>
            <p>※ API Key Console: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">https://platform.openai.com/api-keys</a></p>
          </div>
        </div>

        <div className={`api-field ${selectedProvider === "claude" ? "active" : "inactive"}`}>
          <div className="field-header">
            <label className="api-label">Claude APIキー</label>
          </div>
          <input
            type={showApiKeys ? "text" : "password"}
            value={claudeKey}
            onChange={(e) => setClaudeKey(e.target.value)}
            placeholder="Claude APIキーを入力"
            className={`api-input ${selectedProvider !== "claude" ? "disabled" : ""}`}
          />
          <div className="field-info">
            <p>※ Claude APIキーは「sk-ant-」から始まるキーを使用してください。</p>
            <p>※ API Key Console: <a href="https://console.anthropic.com/keys" target="_blank" rel="noopener noreferrer">https://console.anthropic.com/keys</a></p>
          </div>
        </div>

        <div className="show-api-toggle">
          <input
            type="checkbox"
            id="show-api-keys"
            checked={showApiKeys}
            onChange={() => setShowApiKeys((prev) => !prev)}
          />
          <label htmlFor="show-api-keys">APIキーを表示</label>
        </div>
      </div>

      <div className="action-buttons">
        <button onClick={handleSave} className="save-button">
          <span>保存</span>
        </button>
        <button onClick={handleDelete} className="delete-button">
          <span>削除</span>
        </button>
      </div>
    </div>
  );
};

export default APISettings;
