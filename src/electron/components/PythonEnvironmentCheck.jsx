import React, { useState, useEffect } from 'react';
// CommonJSモジュールの呼び出し方を修正
// 1. window.api経由でアクセスする方法
const pythonBridge = window.api?.pythonBridge;

// 環境チェック・セットアップモーダルが使用できない場合のスキップ用関数
const skipEnvironmentCheck = (onComplete) => {
  console.warn('Python環境チェックがスキップされました');
  if (onComplete) {
    setTimeout(() => onComplete(false), 100);
  }
};

/**
 * Python環境チェック・セットアップのモーダルコンポーネント
 */
const PythonEnvironmentCheck = ({ onComplete }) => {
  // pythonBridgeが存在しない場合はスキップ
  useEffect(() => {
    if (!pythonBridge) {
      console.error('pythonBridgeモジュールが見つかりません。環境チェックをスキップします。');
      skipEnvironmentCheck(onComplete);
    }
  }, [onComplete]);

  // 環境チェックのステータス
  const [checkStatus, setCheckStatus] = useState({
    isChecking: true,
    isComplete: false,
    isPythonAvailable: false,
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

      // Python環境をチェック - メインのpython_bridgeモジュールを使用
      const result = await pythonBridge.checkPythonEnvironment();

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
        isPythonAvailable: result.summary.python_compatible && result.summary.pip_installed,
        isMissingLibraries: !result.summary.all_libraries_installed,
        missingLibraries: result.summary.missing_libraries || [],
        error: null
      }));

      // Python環境と必要なライブラリが揃っている場合は完了
      if (result.summary.python_compatible &&
        result.summary.pip_installed &&
        result.summary.all_libraries_installed) {
        // 少し待ってから完了を通知（UIの表示確認のため）
        setTimeout(() => {
          if (onComplete) onComplete(true);
        }, 1500);
      }
    } catch (error) {
      console.error('Python環境チェックエラー:', error);
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        isChecking: false,
        error: '環境チェック中にエラーが発生しました',
        showSkipButton: true
      }));
    }
  };

  /**
   * Python環境をセットアップする
   */
  const setupEnvironment = async () => {
    try {
      setCheckStatus(prevStatus => ({
        ...prevStatus,
        setupInProgress: true,
        setupMessage: 'Python環境をセットアップしています...',
        error: null
      }));

      // Python環境をセットアップ - メインのpython_bridgeモジュールを使用
      const result = await pythonBridge.setupPythonEnvironment();

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
      console.error('Python環境セットアップエラー:', error);
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
      return 'Python環境をチェックしています...';
    }

    if (checkStatus.error) {
      return `エラーが発生しました: ${checkStatus.error}`;
    }

    if (checkStatus.isComplete) {
      if (!checkStatus.isPythonAvailable) {
        return 'Pythonがインストールされていないか、バージョンが互換性がありません。インストールが必要です。';
      }

      if (checkStatus.isMissingLibraries) {
        return `必要なPythonライブラリがインストールされていません: ${checkStatus.missingLibraries.join(', ')}`;
      }

      return 'Python環境は正常に設定されています。';
    }

    if (checkStatus.setupInProgress) {
      return checkStatus.setupMessage;
    }

    if (checkStatus.setupComplete) {
      return checkStatus.setupSuccess
        ? 'Python環境のセットアップが完了しました!'
        : `セットアップに失敗しました: ${checkStatus.setupMessage}`;
    }

    return '環境をチェックしています...';
  };

  return (
    <div className="python-environment-check modal-overlay">
      <div className="modal-content">
        <h2>Python環境チェック</h2>

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
            (!checkStatus.isPythonAvailable || checkStatus.isMissingLibraries) &&
            !checkStatus.setupInProgress &&
            !checkStatus.setupComplete && (
              <button
                className="setup-button"
                onClick={setupEnvironment}
                disabled={checkStatus.setupInProgress}
              >
                Pythonをセットアップする
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
        .python-environment-check {
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

export default PythonEnvironmentCheck;
