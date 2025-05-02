// テンプレートファイル - 実際のAPIキーは含まれていません
// 実際の値は.envファイルに設定してください

module.exports = {
  // Anthropic (Claude) API設定
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  API_VERSION: '2025-06-01',
  API_BASE_URL: 'https://api.anthropic.com/v1',

  // デフォルトのモデル設定
  DEFAULT_MODEL: 'claude-3-5-haiku-20241022',

  // OpenAI API設定
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
};
