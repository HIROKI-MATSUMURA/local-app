// 環境変数からAPIキーを設定ファイルに埋め込むスクリプト
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 環境変数からAPIキーを取得
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

console.log(`環境変数から読み込み: ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY ? '設定済み' : '未設定'}`);

// 設定ファイルの内容を作成
const configContent = `// 自動生成ファイル - 手動編集しないでください
// ビルド時に環境変数から生成されました

module.exports = {
  // Anthropic (Claude) API設定
  ANTHROPIC_API_KEY: '${ANTHROPIC_API_KEY}',
  API_VERSION: '2023-06-01',
  API_BASE_URL: 'https://api.anthropic.com/v1',

  // デフォルトのモデル設定
  DEFAULT_MODEL: 'claude-3-5-haiku-20241022',

  // OpenAI API設定
  OPENAI_API_KEY: '${OPENAI_API_KEY}'
};`;

// ディレクトリ作成（存在しない場合）
const configDir = path.join(__dirname, '..', 'src', 'config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// ファイルに書き込み
const configFilePath = path.join(configDir, 'api-keys.js');
fs.writeFileSync(configFilePath, configContent);
console.log(`環境変数からconfig/api-keys.jsを生成しました: ${configFilePath}`);
