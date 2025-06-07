/**
 * 🔧 設定ファイルローダー - ハードコーディング回避システム
 * 外部設定ファイルから動的に設定を読み込みます
 */

// デフォルト設定（フォールバック用）
const DEFAULT_CONFIG = {
  stage1_config: {
    device_thresholds: {
      pc: { min_area_multiplier: 1.0, max_elements: 30 },
      sp: { min_area_multiplier: 0.1, max_elements: 40 }
    },
    color_extraction: { max_colors: 5, resize_width: 300 }
  },
  stage2_config: {
    grouping: { min_group_size: 3 }
  }
};

/**
 * 設定を動的に読み込む
 * @param {string} configPath - 設定ファイルのパス
 * @returns {Promise<Object>} 読み込まれた設定
 */
const loadConfig = async (configPath = './config/analysis-config.json') => {
  try {
    console.log(`🔧 設定ファイルを読み込み中: ${configPath}`);

    // ブラウザ環境での設定読み込み
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch(configPath);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const config = await response.json();
        console.log('✅ 設定ファイル読み込み成功 (fetch)');
        return mergeWithDefaults(config);
      } catch (fetchError) {
        console.warn('⚠️ 設定ファイル読み込み失敗、デフォルト設定を使用:', fetchError.message);
        return DEFAULT_CONFIG;
      }
    }

    // Node.js環境での設定読み込み
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        const path = require('path');
        const configFile = path.resolve(configPath);
        const configData = fs.readFileSync(configFile, 'utf8');
        const config = JSON.parse(configData);
        console.log('✅ 設定ファイル読み込み成功 (fs)');
        return mergeWithDefaults(config);
      } catch (fsError) {
        console.warn('⚠️ 設定ファイル読み込み失敗、デフォルト設定を使用:', fsError.message);
        return DEFAULT_CONFIG;
      }
    }

    // フォールバック
    console.warn('⚠️ 環境不明、デフォルト設定を使用');
    return DEFAULT_CONFIG;

  } catch (error) {
    console.error('❌ 設定読み込みエラー:', error);
    return DEFAULT_CONFIG;
  }
};

/**
 * デフォルト設定とマージ
 * @param {Object} userConfig - ユーザー設定
 * @returns {Object} マージされた設定
 */
const mergeWithDefaults = (userConfig) => {
  return deepMerge(DEFAULT_CONFIG, userConfig);
};

/**
 * オブジェクトの深いマージ
 * @param {Object} target - マージ先
 * @param {Object} source - マージ元
 * @returns {Object} マージ結果
 */
const deepMerge = (target, source) => {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
};

/**
 * 設定値を安全に取得
 * @param {Object} config - 設定オブジェクト
 * @param {string} path - 設定パス（例: 'stage1_config.device_thresholds.pc.max_elements'）
 * @param {*} defaultValue - デフォルト値
 * @returns {*} 設定値
 */
const getConfigValue = (config, path, defaultValue = null) => {
  try {
    const keys = path.split('.');
    let current = config;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current !== undefined ? current : defaultValue;
  } catch (error) {
    console.warn(`⚠️ 設定値取得エラー (${path}):`, error);
    return defaultValue;
  }
};

/**
 * 動的設定変更
 * @param {Object} config - 設定オブジェクト
 * @param {string} path - 設定パス
 * @param {*} value - 新しい値
 * @returns {Object} 更新された設定
 */
const setConfigValue = (config, path, value) => {
  try {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = config;

    // パスを辿って親オブジェクトまで移動
    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    // 値を設定
    current[lastKey] = value;
    console.log(`🔧 設定更新: ${path} = ${JSON.stringify(value)}`);

    return config;
  } catch (error) {
    console.error(`❌ 設定値更新エラー (${path}):`, error);
    return config;
  }
};

// 設定管理クラス
class ConfigManager {
  constructor() {
    this.config = null;
    this.loadPromise = null;
  }

  async init(configPath) {
    if (!this.loadPromise) {
      this.loadPromise = loadConfig(configPath);
    }
    this.config = await this.loadPromise;
    return this.config;
  }

  get(path, defaultValue) {
    return getConfigValue(this.config, path, defaultValue);
  }

  set(path, value) {
    return setConfigValue(this.config, path, value);
  }

  getDeviceConfig(deviceType) {
    return this.get(`stage1_config.device_thresholds.${deviceType}`, {});
  }

  getZoneConfig(deviceType) {
    return this.get(`stage2_config.zone_analysis.${deviceType}`, {});
  }
}

// シングルトンインスタンス
const configManager = new ConfigManager();

// エクスポート
const configLoader = {
  loadConfig,
  getConfigValue,
  setConfigValue,
  configManager,
  DEFAULT_CONFIG
};

// CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = configLoader;
}

// ブラウザ環境
if (typeof window !== 'undefined') {
  window.ConfigLoader = configLoader;
  console.log('🔧 ConfigLoader が利用可能になりました');
}
