/**
 * プロジェクトデータストアモジュール
 * プロジェクト固有のデータをJSON形式で管理するユーティリティ
 */

// Electronアプリケーションコンテキストでのみ実行
const isElectronContext = typeof window !== 'undefined' && window.api;

/**
 * JSON文字列化と復元の際に型を保持するための機能
 * @param {any} data JSON文字列化する前のデータ
 * @returns {string} 型情報が付加されたJSON文字列
 */
const safeStringify = (data) => {
  try {
    // 特殊な値の処理
    return JSON.stringify(data, (key, value) => {
      // パスプロパティの特別処理
      if (key === 'path' && value !== null && value !== undefined) {
        // 確実に文字列に変換
        return String(value);
      }
      return value;
    });
  } catch (error) {
    console.error('JSONシリアライズエラー:', error);
    return JSON.stringify({});
  }
};

/**
 * 安全なJSONパースの実装
 * @param {string} jsonString JSONパースする文字列
 * @returns {any} パースされたデータ
 */
const safeParse = (jsonString) => {
  try {
    if (!jsonString) {
      return null;
    }
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSONパースエラー:', error);
    return null;
  }
};

/**
 * プロジェクトデータストアAPI
 */
const projectDataStore = {
  /**
   * プロジェクトのセクションデータを保存する
   * @param {string} projectId プロジェクトID
   * @param {string} section データセクション名
   * @param {object} data 保存するデータ
   * @returns {Promise<boolean>} 保存成功したかどうか
   */
  saveProjectData: async (projectId, section, data) => {
    if (!projectId) {
      console.error('プロジェクトIDが指定されていません');
      return false;
    }

    console.log(`プロジェクトデータの保存を開始: ${projectId}/${section}`);

    // データの検証と変換
    if (data && typeof data === 'object') {
      // path属性が含まれている場合は文字列化を確認
      if ('path' in data && data.path !== null && data.path !== undefined) {
        if (typeof data.path !== 'string') {
          console.warn(`パスデータが文字列ではありません: ${typeof data.path}`);
          try {
            data.path = String(data.path);
            console.log('パスを文字列に変換しました:', data.path);
          } catch (error) {
            console.error('パスの変換に失敗しました:', error);
            data.path = '';
          }
        }
      }
    }

    // Electron環境
    if (isElectronContext) {
      try {
        console.log(`IPCを使用してプロジェクトデータを保存: ${projectId}/${section}`);
        // 拡張したシリアライズ処理を使用
        const safeData = typeof data === 'object' ? data : { value: data };
        const result = await window.api.saveProjectData(projectId, section, safeData);
        if (result) {
          console.log(`プロジェクトデータの保存に成功: ${projectId}/${section}`);
        } else {
          console.log(`プロジェクトデータの保存に失敗: ${projectId}/${section}`);
        }
        return result;
      } catch (error) {
        console.error(`データ保存エラー (${section}):`, error);
        return false;
      }
    }
    // Electron環境でなければエラー
    else {
      console.error('Electron環境外ではプロジェクトデータの保存ができません');
      return false;
    }
  },

  /**
   * プロジェクトのセクションデータを読み込む
   * @param {string} projectId プロジェクトID
   * @param {string} section データセクション名
   * @returns {Promise<object|null>} 読み込んだデータまたはnull
   */
  loadProjectData: async (projectId, section) => {
    if (!projectId) {
      console.error('プロジェクトIDが指定されていません');
      return null;
    }

    console.log(`プロジェクトデータの読み込みを開始: ${projectId}/${section}`);

    // Electron環境
    if (isElectronContext) {
      try {
        console.log(`IPCを使用してプロジェクトデータを読み込み: ${projectId}/${section}`);
        const data = await window.api.loadProjectData(projectId, section);

        // データの検証と修正
        if (data && typeof data === 'object') {
          // path属性が含まれている場合は文字列化を確認
          if ('path' in data && data.path !== null && data.path !== undefined) {
            if (typeof data.path !== 'string') {
              console.warn(`読み込まれたパスデータが文字列ではありません: ${typeof data.path}`);
              try {
                data.path = String(data.path);
                console.log('パスを文字列に変換しました:', data.path);
              } catch (error) {
                console.error('パスの変換に失敗しました:', error);
                data.path = '';
              }
            }
          }
        }

        if (data) {
          console.log(`プロジェクトデータの読み込みに成功: ${projectId}/${section}`);
        } else {
          console.log(`プロジェクトデータが存在しないか空です: ${projectId}/${section}`);
        }
        return data;
      } catch (error) {
        console.error(`データ読み込みエラー (${section}):`, error);
        return null;
      }
    }
    // Electron環境でなければエラー
    else {
      console.error('Electron環境外ではプロジェクトデータの読み込みができません');
      return null;
    }
  }
};

export default projectDataStore;
