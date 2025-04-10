/**
 * プロジェクトデータストアモジュール
 * プロジェクト固有のデータをJSON形式で管理するユーティリティ
 */

// Electronアプリケーションコンテキストでのみ実行
const isElectronContext = typeof window !== 'undefined' && window.api;

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

    // Electron環境
    if (isElectronContext) {
      try {
        console.log(`IPCを使用してプロジェクトデータを保存: ${projectId}/${section}`);
        const result = await window.api.saveProjectData(projectId, section, data);
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
