// AI生成コードの保存
saveAIGeneratedCode: async (scssCode, htmlCode, blockName, targetHtmlFile) => {
  console.log('preload.js: saveAIGeneratedCode呼び出し', {
    blockName,
    targetHtmlFile,
    hasHtmlCode: !!htmlCode,
    htmlCodeLength: htmlCode ? htmlCode.length : 0,
    hasScssCode: !!scssCode,
    scssCodeLength: scssCode ? scssCode.length : 0
  });
  // デバッグ用にHTMLコードの先頭部分を表示
  if (htmlCode && htmlCode.trim() !== '') {
    console.log(`HTMLコードの先頭50文字: ${htmlCode.substring(0, 50)}...`);
  } else {
    console.log('HTMLコードが空か存在しません');
  }
  return await ipcRenderer.invoke('save-ai-generated-code', {
    scssCode,
    htmlCode,
    blockName,
    targetHtmlFile
  });
},
