/**
 * メモリ管理モジュール
 * 
 * アプリケーションのメモリ使用状況を監視し、ガベージコレクションを定期的に実行します
 */

const { app } = require('electron');

/**
 * 定期的なガベージコレクションを開始
 * @returns {Function} ガベージコレクション停止関数
 */
function startPeriodicGC() {
  console.log('定期的なガベージコレクションを開始します');

  // メモリ使用状況をチェックし、必要に応じてGCを実行
  const gcInterval = setInterval(() => {
    try {
      if (global.gc) {
        // メモリ使用状況をログ
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
        const rssMemoryMB = Math.round(memUsage.rss / (1024 * 1024));

        // メモリ使用量が一定のしきい値を超えた場合のみGCを実行
        const HEAP_THRESHOLD_MB = 300; // 300MB

        if (heapUsedMB > HEAP_THRESHOLD_MB) {
          console.log(`メモリ使用量しきい値超過 (${heapUsedMB}MB)。ガベージコレクションを実行します`);
          global.gc();

          // GC後のメモリ使用状況をログ
          const afterGcMemUsage = process.memoryUsage();
          const afterHeapUsedMB = Math.round(afterGcMemUsage.heapUsed / (1024 * 1024));
          console.log(`GC後のメモリ使用量: ${afterHeapUsedMB}MB (解放: ${heapUsedMB - afterHeapUsedMB}MB)`);
        } else {
          console.log(`現在のメモリ使用量: ${heapUsedMB}MB (ヒープ), ${rssMemoryMB}MB (RSS)`);
        }
      }
    } catch (error) {
      console.error('定期的なガベージコレクション中にエラーが発生しました:', error);
    }
  }, 60000); // 1分ごとにチェック

  // アプリケーション終了時にインターバルをクリア
  app.on('quit', () => {
    clearInterval(gcInterval);
    console.log('定期的なガベージコレクションを停止しました');
  });
  
  // 停止関数を返す
  return () => {
    clearInterval(gcInterval);
    console.log('定期的なガベージコレクションを停止しました');
  };
}

/**
 * システム情報を取得
 * @returns {Object} システム情報
 */
function getSystemInfo() {
  try {
    return {
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  } catch (error) {
    console.error('システム情報の取得に失敗:', error);
    return null;
  }
}

/**
 * コンソール情報を定期的に取得する関数
 * @param {BrowserWindow} mainWindow メインウィンドウ
 * @returns {Function} 監視停止関数
 */
function startSystemMonitoring(mainWindow) {
  const interval = setInterval(() => {
    const sysInfo = getSystemInfo();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-info-updated', sysInfo);
    }
  }, 5000); // 5秒ごとに更新
  
  // 停止関数を返す
  return () => {
    clearInterval(interval);
    console.log('システム監視を停止しました');
  };
}

/**
 * 手動でガベージコレクションを実行
 */
function runGC() {
  if (global.gc) {
    console.log('手動ガベージコレクションを実行します');
    global.gc();
    
    // GC後のメモリ使用状況をログ
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
    const rssMemoryMB = Math.round(memUsage.rss / (1024 * 1024));
    console.log(`GC後のメモリ使用量: ${heapUsedMB}MB (ヒープ), ${rssMemoryMB}MB (RSS)`);
  } else {
    console.warn('GC機能が利用できません。--expose-gcフラグ付きでアプリを起動してください');
  }
}

module.exports = {
  startPeriodicGC,
  getSystemInfo,
  startSystemMonitoring,
  runGC
};