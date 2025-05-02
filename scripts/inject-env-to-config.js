// 環境変数からAPIキーを設定ファイルに埋め込むスクリプト
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// .envファイルから環境変数を直接読み込む（process.envを無視）
const envPath = path.resolve(process.cwd(), '.env');
let ANTHROPIC_API_KEY = '';
let OPENAI_API_KEY = '';

// .envファイルが存在するか確認
if (fs.existsSync(envPath)) {
  // .envファイルを直接読み込んでパース
  const envConfig = dotenv.parse(fs.readFileSync(envPath));

  // APIキーを取得（.envファイルから直接取得するため、システム環境変数より優先される）
  ANTHROPIC_API_KEY = envConfig.ANTHROPIC_API_KEY || '';
  OPENAI_API_KEY = envConfig.OPENAI_API_KEY || '';

  console.log(`.envファイルから読み込み: ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY ? '設定済み' : '未設定'}`);
} else {
  // .envファイルがない場合はprocess.envから読み込む
  ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
  OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

  console.log(`環境変数から読み込み: ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY ? '設定済み' : '未設定'}`);
}

// 設定ファイルの内容を作成 - パッケージ化されたアプリケーション用に実際のキーを埋め込む
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

// distディレクトリにも同じファイルをコピー
const distConfigDir = path.join(__dirname, '..', 'dist', 'config');
if (!fs.existsSync(distConfigDir)) {
  fs.mkdirSync(distConfigDir, { recursive: true });
}

const distConfigFilePath = path.join(distConfigDir, 'api-keys.js');
fs.writeFileSync(distConfigFilePath, configContent);
console.log(`distディレクトリにもconfig/api-keys.jsをコピーしました: ${distConfigFilePath}`);
