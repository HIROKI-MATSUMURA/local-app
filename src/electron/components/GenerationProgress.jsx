import React from 'react';

/**
 * 生成段階の進行状況を表示するコンポーネント
 * @param {Object} props
 * @param {string} props.stage - 現在の生成段階
 * @param {boolean} props.isLoading - ローディング中かどうか
 */
const GenerationProgress = ({ stage, isLoading }) => {
  if (!stage || !isLoading) return null;

  let stageText = '';
  switch (stage) {
    case 'header':
      stageText = 'ヘッダー構造を生成中...';
      break;
    case 'drawer':
      stageText = 'ドロワーメニューを生成中...';
      break;
    case 'integration':
      stageText = 'コンポーネントを統合中...';
      break;
    default:
      stageText = '生成中...';
  }

  return (
    <div className="generation-progress">
      <div className="generation-loader"></div>
      <div className="generation-stage">{stageText}</div>
    </div>
  );
};

export default GenerationProgress;
