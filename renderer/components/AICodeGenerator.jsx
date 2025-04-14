import React, { useState, useRef, useEffect } from 'react';
import { Button, Box, Typography, CircularProgress, Snackbar, Alert, Paper, Divider } from '@mui/material';

const AICodeGenerator = ({ imageData, onCodeGenerated }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [feedbackInProgress, setFeedbackInProgress] = useState(false);
  const previewRef = useRef(null);

  // 画像分析に基づいてコードを生成
  const generateCodeFromImage = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('画像分析を開始します...');

      // 画像の分析実行
      const analysisResults = await window.imageAnalysis.analyzeAll(imageData);
      console.log('画像分析が完了しました', analysisResults);

      // 詳細なログを追加
      console.log('🔎🔎🔎 analyzeAll詳細結果:');
      console.log(`🔎🔎🔎 結果型: ${typeof analysisResults}`);

      if (analysisResults) {
        console.log(`🔎🔎🔎 結果構造: ${Object.keys(analysisResults).join(', ')}`);

        // テキスト情報の確認
        if (analysisResults.text !== undefined) {
          console.log(`🔎🔎🔎 text型: ${typeof analysisResults.text}`);
          console.log(`🔎🔎🔎 text長さ: ${analysisResults.text.length || 0}文字`);
        } else {
          console.log('🔎🔎🔎 text: undefined');
        }

        // テキストブロックの確認
        if (analysisResults.textBlocks !== undefined) {
          console.log(`🔎🔎🔎 textBlocks型: ${typeof analysisResults.textBlocks}, 配列か: ${Array.isArray(analysisResults.textBlocks)}`);
          console.log(`🔎🔎🔎 textBlocks長さ: ${Array.isArray(analysisResults.textBlocks) ? analysisResults.textBlocks.length : 'not an array'}`);
        } else {
          console.log('🔎🔎🔎 textBlocks: undefined');
        }

        // 色情報の確認
        if (analysisResults.colors !== undefined) {
          console.log(`🔎🔎🔎 colors型: ${typeof analysisResults.colors}, 配列か: ${Array.isArray(analysisResults.colors)}`);
          console.log(`🔎🔎🔎 colors長さ: ${Array.isArray(analysisResults.colors) ? analysisResults.colors.length : 'not an array'}`);
        } else {
          console.log('🔎🔎🔎 colors: undefined');
        }

        // 結果データの完全なJSONを出力
        try {
          console.log('🔎🔎🔎 分析結果全体:', JSON.stringify(analysisResults, null, 2));
        } catch (e) {
          console.error(`🔎🔎🔎 JSONシリアライズエラー: ${e.message}`);
        }
      } else {
        console.log("🔎🔎🔎 分析結果はnullまたはundefinedです");
      }

      // 分析結果の圧縮
      const compressedResults = await window.imageAnalysis.compressAnalysisResults(analysisResults);
      console.log('分析結果を圧縮しました', compressedResults);

      // プロンプト生成のコンソールログを追加
      console.log('==== 生成されるプロンプトの完全版 ====');
      // プロンプトが生成される処理を呼び出す前にプロンプトを取得して表示
      try {
        const promptPreview = await window.api.getPromptPreview(compressedResults);
        console.log(promptPreview);
        console.log('==== プロンプト完全版ここまで ====');
      } catch (promptError) {
        console.error('プロンプトプレビュー取得エラー:', promptError);
      }

      // 圧縮結果からコード生成
      console.log('=== BEFORE GENERATE CODE CALL ===');
      console.log('compressedResults:', JSON.stringify(compressedResults, null, 2));

      const response = await window.api.generateCodeFromAnalysis(compressedResults);

      console.log('=== AFTER GENERATE CODE CALL ===');
      if (response.success && response.data && response.data.prompt) {
        console.log('実際に使用されたプロンプト:');
        console.log(response.data.prompt);
      }

      if (response.success) {
        console.log('コード生成成功:', response.data);

        setGeneratedCode({
          html: response.data.html,
          scss: response.data.scss,
          prompt: response.data.prompt
        });

        // 親コンポーネントにコードを渡す
        if (onCodeGenerated) {
          onCodeGenerated(response.data.html, response.data.scss);
        }

        // プレビューが表示されるのを待ってから比較を実行
        setTimeout(compareGeneratedResult, 1500);
      } else {
        console.error('コード生成エラー:', response.error);
        setError(`コード生成に失敗しました: ${response.error}`);
      }
    } catch (error) {
      console.error('AI処理中にエラーが発生しました:', error);
      setError(`処理中にエラーが発生しました: ${error.message || '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  // 生成されたコードのプレビューを元の画像と比較
  const compareGeneratedResult = async () => {
    if (!previewRef.current || !imageData) return;

    try {
      console.log('レンダリング結果と元画像の比較を開始します...');

      // プレビューをキャプチャ
      const canvas = document.createElement('canvas');
      const previewElement = previewRef.current;
      canvas.width = previewElement.clientWidth;
      canvas.height = previewElement.clientHeight;
      const ctx = canvas.getContext('2d');

      // HTML要素をキャンバスに描画
      const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            ${previewElement.innerHTML}
          </div>
        </foreignObject>
      </svg>`;

      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        // キャンバスをBase64エンコード
        const renderedImageData = canvas.toDataURL('image/png');

        // 比較APIを呼び出し
        const result = await window.api.compareImages(imageData, renderedImageData);
        console.log('比較結果:', result);

        setComparisonResult(result);
      };

      img.src = url;
    } catch (error) {
      console.error('比較中にエラーが発生しました:', error);
      setError(`比較中にエラーが発生しました: ${error.message || '不明なエラー'}`);
    }
  };

  // フィードバックに基づいてコードを修正
  const regenerateCodeWithFeedback = async () => {
    if (!comparisonResult || !generatedCode) return;

    try {
      setFeedbackInProgress(true);

      console.log('フィードバックに基づいてコードを再生成します...');

      const response = await window.api.regenerateCodeWithFeedback({
        prompt: generatedCode.prompt,
        feedback: comparisonResult.feedback,
        originalCode: {
          html: generatedCode.html,
          scss: generatedCode.scss
        }
      });

      if (response.success) {
        console.log('コード修正が完了しました:', response.data);

        setGeneratedCode({
          html: response.data.html,
          scss: response.data.scss,
          prompt: response.data.prompt
        });

        // 親コンポーネントにコードを渡す
        if (onCodeGenerated) {
          onCodeGenerated(response.data.html, response.data.scss);
        }

        // プレビューが更新されるのを待ってから再度比較
        setTimeout(compareGeneratedResult, 1500);
      } else {
        console.error('コード修正エラー:', response.error);
        setError(`コード修正に失敗しました: ${response.error}`);
      }
    } catch (error) {
      console.error('フィードバック処理中にエラーが発生しました:', error);
      setError(`フィードバック処理中にエラーが発生しました: ${error.message || '不明なエラー'}`);
    } finally {
      setFeedbackInProgress(false);
    }
  };

  return (
    <div>
      {/* コンポーネントのUIコード */}
    </div>
  );
};

export default AICodeGenerator;
