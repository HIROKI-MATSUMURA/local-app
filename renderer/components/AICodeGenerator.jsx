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

      // 分析結果の圧縮
      const compressedResults = await window.imageAnalysis.compressAnalysisResults(analysisResults);
      console.log('分析結果を圧縮しました', compressedResults);

      // 圧縮結果からコード生成
      const response = await window.api.generateCodeFromAnalysis(compressedResults);

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
    <Box sx={{ mt: 2 }}>
      <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          AIコード生成
        </Typography>

        <Button
          variant="contained"
          color="primary"
          onClick={generateCodeFromImage}
          disabled={loading || !imageData}
          sx={{ mb: 2 }}
        >
          {loading ? (
            <>
              <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
              処理中...
            </>
          ) : 'デザインからコードを生成'}
        </Button>

        {comparisonResult && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" gutterBottom>
              比較結果: {(comparisonResult.ssim * 100).toFixed(1)}% 一致
            </Typography>

            {comparisonResult.differenceImage && (
              <Box sx={{ mt: 1, mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  差分ヒートマップ:
                </Typography>
                <img
                  src={comparisonResult.differenceImage}
                  alt="Difference heatmap"
                  style={{ maxWidth: '100%', border: '1px solid #ddd' }}
                />
              </Box>
            )}

            <Button
              variant="outlined"
              color="secondary"
              onClick={regenerateCodeWithFeedback}
              disabled={feedbackInProgress || !comparisonResult}
              sx={{ mt: 1 }}
            >
              {feedbackInProgress ? (
                <>
                  <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
                  修正中...
                </>
              ) : 'フィードバックに基づき修正'}
            </Button>
          </Box>
        )}
      </Paper>

      {/* プレビュー要素 (非表示) */}
      <div
        ref={previewRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1024px',
          height: '768px',
          overflow: 'hidden'
        }}
      >
        {generatedCode && (
          <div dangerouslySetInnerHTML={{
            __html: `
            <style>${generatedCode.scss}</style>
            ${generatedCode.html}
          `}} />
        )}
      </div>

      {error && (
        <Snackbar
          open={!!error}
          autoHideDuration={6000}
          onClose={() => setError(null)}
        >
          <Alert onClose={() => setError(null)} severity="error">
            {error}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
};

export default AICodeGenerator;
