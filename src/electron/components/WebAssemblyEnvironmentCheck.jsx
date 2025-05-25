import React, { useState, useEffect } from 'react';
// CommonJSモジュールの呼び出し方を修正
// window.api経由でWebAssembly関連機能にアクセス

// 環境チェック・セットアップモーダルが使用できない場合のスキップ用関数
const skipEnvironmentCheck = (onComplete) => {
  console.warn('WebAssembly環境チェックがスキップされました');
  if (onComplete) {
    setTimeout(() => onComplete(false), 100);
  }
};

/**
 * WebAssembly環境チェック・セットアップのモーダルコンポーネント
 */
const WebAssemblyEnvironmentCheck = ({ onComplete }) => {
  // window.apiが存在しない場合はスキップ
  useEffect(() => {
    if (!window.api) {
      console.error('window.apiが見つかりません。環境チェックをスキップします。');
      skipEnvironmentCheck(onComplete);
    }
  }, [onComplete]);

  // 環境チェックのステータス
  const [checkStatus, setCheckStatus] = useState({
    isChecking: true,
    isComplete: false,
    isWebAssemblyAvailable: false,
    isMissingLibraries: false,
    missingLibraries: [],
    error: null,
    setupInProgress: false,
    setupComplete: false,
    setupSuccess: false,
    setupMessage: '',
    showSkipButton: false
  });

  // 初回レンダリング時に環境チェックを実行
  useEffect(() => {
    checkEnvironment();
  }, []);

  // 10秒後にスキップボタンを表示
  useEffect(() => {
    const timer = setTimeout(() => {
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        showSkipButton: true
      }));
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  /**
   * Python環境をチェックする
   */
  const checkEnvironment = async () => {
    try {
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        isChecking: true,
        error: null
      }));

      // WebAssembly環境をチェック
      const result = await window.api.checkEnvironment();

      if (result.error) {
        // エラーが発生した場合
        setCheckStatus(prevStatus => ({
          ...prevStatus,
          isChecking: false,
          error: result.error,
          showSkipButton: true
        }));
        return;
      }

      // チェック完了、結果を状態に反映
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        isChecking: false,
        isComplete: true,
        isWebAssemblyAvailable: result.opencv_available || result.status === 'ok',
        isMissingLibraries: !result.tesseract_available || result.status !== 'ok',
        missingLibraries: !result.tesseract_available ? ['tesseract.js'] : [],
        error: null
      }));

      // WebAssembly環境が正常な場合は完了
      if (result.status === 'ok' && result.opencv_available && result.tesseract_available) {
        // 少し待ってから完了を通知（UIの表示確認のため）
        setTimeout(() => {
          if (onComplete) onComplete(true);
        }, 1500);
      }
    } catch (error) {
      console.error('WebAssembly環境チェックエラー:', error);
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        isChecking: false,
        error: '環境チェック中にエラーが発生しました',
        showSkipButton: true
      }));
    }
  };

  /**
   * WebAssembly環境をセットアップする
   */
  const setupEnvironment = async () => {
    try {
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        setupInProgress: true,
        setupMessage: 'WebAssembly環境をセットアップしています...',
        error: null
      }));

      // WebAssembly環境をセットアップ
      const result = await window.api.setupEnvironment();

      // セットアップ結果を状態に反映
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        setupInProgress: false,
        setupComplete: true,
        setupSuccess: result.success,
        setupMessage: result.message,
        error: result.success ? null : 'セットアップに失敗しました'
      }));

      // セットアップ成功の場合、少し待ってから完了を通知
      if (result.success) {
        setTimeout(() => {
          if (onComplete) onComplete(true);
        }, 2000);
      }
    } catch (error) {
      console.error('WebAssembly環境セットアップエラー:', error);
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        setupInProgress: false,
        setupComplete: true,
        setupSuccess: false,
        setupMessage: 'セットアップ中にエラーが発生しました',
        error: error.message || '不明なエラー',
        showSkipButton: true
      }));
    }
  };

  /**
   * セットアップをスキップする
   */
  const skipSetup = () => {
    if (onComplete) onComplete(false);
  };

  // ステータスに基づいてメッセージを生成
  const getMessage = () => {
    if (checkStatus.isChecking) {
      return 'WebAssembly環境をチェックしています...';
    }

    if (checkStatus.error) {
      return `エラーが発生しました: ${checkStatus.error}`;
    }

    if (checkStatus.isComplete) {
      if (!checkStatus.isWebAssemblyAvailable) {
        return 'WebAssemblyをサポートするモジュールが読み込めません。設定が必要です。';
      }

      if (checkStatus.isMissingLibraries) {
        return `必要なWebAssemblyモジュールが読み込めません: ${checkStatus.missingLibraries.join(', ')}`;
      }

      return 'WebAssembly環境は正常に設定されています。';
    }

    if (checkStatus.setupInProgress) {
      return checkStatus.setupMessage;
    }

    if (checkStatus.setupComplete) {
      return checkStatus.setupSuccess
        ? 'WebAssembly環境のセットアップが完了しました!'
        : `セットアップに失敗しました: ${checkStatus.setupMessage}`;
    }

    return 'WebAssembly環境をチェックしています...';
  };

  return (
    <div className="webassembly-environment-check modal-overlay">
      <div className="modal-content">
        <h2>WebAssembly環境チェック</h2>

        <div className="status-message">
          <p>{getMessage()}</p>

          {/* ローディングインジケーター */}
          {(checkStatus.isChecking || checkStatus.setupInProgress) && (
            <div className="loader"></div>
          )}
        </div>

        {/* アクションボタン */}
        <div className="action-buttons">
          {/* Pythonが利用できない、またはライブラリが不足している場合 */}
          {checkStatus.isComplete &&
            (!checkStatus.isWebAssemblyAvailable || checkStatus.isMissingLibraries) &&
            !checkStatus.setupInProgress &&
            !checkStatus.setupComplete && (
              <button
                className="setup-button"
                onClick={setupEnvironment}
                disabled={checkStatus.setupInProgress}
              >
                WebAssemblyをセットアップする
              </button>
            )}

          {/* スキップボタン */}
          {checkStatus.showSkipButton && !checkStatus.setupSuccess && (
            <button
              className="skip-button"
              onClick={skipSetup}
            >
              スキップ（機能制限あり）
            </button>
          )}

          {/* セットアップ完了時の続行ボタン */}
          {checkStatus.setupComplete && checkStatus.setupSuccess && (
            <button
              className="continue-button"
              onClick={() => onComplete(true)}
            >
              続行
            </button>
          )}
        </div>
      </div>

      {/* スタイル */}
      <style jsx>{`
        .webassembly-environment-check {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .modal-content {
          background-color: white;
          padding: 30px;
          border-radius: 8px;
          width: 500px;
          max-width: 90%;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }

        h2 {
          margin-top: 0;
          color: #333;
          font-size: 24px;
        }

        .status-message {
          margin: 20px 0;
          padding: 15px;
          background-color: #f5f5f5;
          border-radius: 4px;
          min-height: 100px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .loader {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #3498db;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 2s linear infinite;
          margin-top: 15px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .action-buttons {
          display: flex;
          justify-content: center;
          gap: 15px;
          margin-top: 20px;
        }

        button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.3s;
        }

        .setup-button {
          background-color: #4caf50;
          color: white;
        }

        .setup-button:hover {
          background-color: #45a049;
        }

        .skip-button {
          background-color: #f44336;
          color: white;
        }

        .skip-button:hover {
          background-color: #d32f2f;
        }

        .continue-button {
          background-color: #2196f3;
          color: white;
        }

        .continue-button:hover {
          background-color: #0b7dda;
        }

        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default WebAssemblyEnvironmentCheck;
