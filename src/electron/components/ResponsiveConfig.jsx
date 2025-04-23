import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import '../styles/ResponsiveConfig.scss';
import Header from './Header';
import projectDataStore from '../utils/projectDataStore';

// Electronコンテキストかどうかを判定
const isElectronContext = typeof window !== 'undefined' && window.api;

// パス操作のためのヘルパー関数（Node.jsのpathモジュールの代替）
const pathHelper = {
  basename: (filePath) => {
    if (!filePath) return '';
    // 両方のパスセパレータに対応
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || '';
  },

  dirname: (filePath) => {
    if (!filePath) return '';
    // 両方のパスセパレータに対応
    const normalizedPath = filePath.replace(/\\/g, '/');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    return lastSlashIndex > -1 ? normalizedPath.substring(0, lastSlashIndex) : '';
  },

  join: (...parts) => {
    // 各パーツを文字列に変換し、nullやundefinedや非文字列オブジェクトを適切に処理
    const validParts = parts.map(part => {
      // nullやundefinedは空文字に
      if (part === null || part === undefined) return '';

      // オブジェクトや配列の場合は文字列に変換
      if (typeof part === 'object') {
        // オブジェクトの場合はJSON文字列化して警告
        console.warn('pathHelper.join: オブジェクト型の値が渡されました:', part);

        // オブジェクトが単純な値を持っている場合は文字列化を試みる
        try {
          return String(part);
        } catch (error) {
          console.error('オブジェクトの文字列変換に失敗:', error);
          return '';
        }
      }

      // 空文字列、NaN、Infinityなどの特殊な値も空文字に
      if (part === '' || Number.isNaN(part) || part === Infinity || part === -Infinity) {
        console.warn('pathHelper.join: 特殊な値が渡されました:', part);
        return '';
      }

      // それ以外は文字列に変換
      try {
        return String(part);
      } catch (error) {
        console.error('pathHelper.join: 文字列変換に失敗しました:', error);
        return '';
      }
    });

    // 値がある要素だけをフィルタリングして結合
    const path = validParts.filter(Boolean).join('/');

    // 重複スラッシュを削除して返す
    return path.replace(/\/+/g, '/');
  }
};

// 個別のブレークポイント行をメモ化したコンポーネントとして分離
const BreakpointRow = memo(({ breakpoint, onUpdate, onRemove }) => {
  return (
    <tr className={breakpoint.active ? "" : "inactive"}>
      <td>
        <input
          type="checkbox"
          checked={breakpoint.active}
          onChange={() => onUpdate(breakpoint.id, 'active', !breakpoint.active)}
          className="bp-checkbox"
          disabled={breakpoint.name === 'md'}
        />
      </td>
      <td>
        <input
          type="text"
          value={breakpoint.name}
          onChange={(e) => onUpdate(breakpoint.id, 'name', e.target.value)}
          className="bp-name"
          disabled={breakpoint.name === 'md'}
        />
      </td>
      <td>
        <input
          type="number"
          value={breakpoint.value}
          onChange={(e) => onUpdate(breakpoint.id, 'value', parseInt(e.target.value, 10) || 0)}
          min="0"
          max="9999"
          className="bp-value"
        />
      </td>
      <td>
        <button
          onClick={() => onRemove(breakpoint.id)}
          className="remove-button"
          title="このブレークポイントを削除"
          disabled={breakpoint.name === 'md'}
        >
          削除
        </button>
      </td>
    </tr>
  );
});

const ResponsiveConfig = ({ activeProject }) => {
  console.log('ResponsiveConfig コンポーネントがレンダリングされました');
  console.log('activeProject:', activeProject);

  // React Strictモードでの不要な再レンダリングを抑制するためのフラグ
  const isMounted = useRef(false);
  const isChangingMode = useRef(false);
  // スクロール位置を保存するための参照
  const scrollPositionRef = useRef(0);
  // コンテナ要素の参照
  const containerRef = useRef(null);

  const [responsiveMode, setResponsiveMode] = useState('sp'); // 'sp' -> スマホファースト, 'pc' -> PCファースト
  const [breakpoints, setBreakpoints] = useState([
    { id: 1, name: 'sm', value: 600, active: true },
    { id: 2, name: 'md', value: 768, active: true },
    { id: 3, name: 'lg', value: 1024, active: true },
    { id: 4, name: 'xl', value: 1440, active: true },
  ]);

  const [isProcessing, setIsProcessing] = useState(false); // 処理中フラグ
  const [isSaved, setIsSaved] = useState(true); // 保存状態
  const [statusMessage, setStatusMessage] = useState(''); // ステータスメッセージ
  const [isInitialized, setIsInitialized] = useState(false); // 初期化フラグ

  // ステータスメッセージの自動クリア
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage('');
      }, 3000); // 3秒後にメッセージを消す
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // ステータス表示関数
  const showStatus = useCallback((message, autoClear = true) => {
    setStatusMessage(message);
    if (!autoClear) return;
  }, []);

  // ブレークポイント設定からSCSSコードを生成する関数
  const generateScssContent = useCallback((breakpointsArr, mode) => {
    const currentMode = mode || responsiveMode;
    console.log(`SCSSコード生成: モード = ${currentMode}`);

    // アクティブなブレークポイントだけをフィルタリング
    const activeBreakpoints = breakpointsArr.filter(bp => bp.active);
    console.log(`アクティブなブレークポイント:`, activeBreakpoints);

    const scssCode = `@use "sass:map";

// どっちファーストの設定（"sp" or "pc"）
$startFrom: ${currentMode};

// ブレークポイント
$breakpoints: (
${activeBreakpoints.map(bp => `  ${bp.name}: ${bp.value}px`).join(',\n')}
);

// メディアクエリ
$mediaquerys: (
${activeBreakpoints.map(bp => {
      // SPファーストの場合はmin-width、PCファーストの場合はmax-width
      const condition = currentMode === 'sp'
        ? `"screen and (min-width: #{map.get($breakpoints,'${bp.name}')})"`
        : `"screen and (max-width: #{map.get($breakpoints,'${bp.name}')})"`;
      return `  ${bp.name}: ${condition}`;
    }).join(',\n')}
);

// メディアクエリMixin
@mixin mq($mediaquery: md) {
  @media #{map.get($mediaquerys, $mediaquery)} {
    @content;
  }
}
`;

    console.log(`生成されたSCSSコード:`, scssCode);
    return scssCode;
  }, [responsiveMode]);

  // プロジェクト変更時のデータ初期化・読み込み
  useEffect(() => {
    console.log('ResponsiveConfig: activeProject変更が検出されました', {
      id: activeProject?.id,
      name: activeProject?.name,
      path: activeProject?.path
    });

    // プロジェクトパスの検証
    if (activeProject?.path) {
      // パスが文字列であることを確認
      if (typeof activeProject.path !== 'string') {
        console.error('activeProject.pathが文字列ではありません:', typeof activeProject.path);
      } else if (activeProject.path.trim() === '') {
        console.error('activeProject.pathが空文字列です');
      } else {
        console.log('有効なプロジェクトパス:', activeProject.path);

        // 必要なサブディレクトリパスの構築（ログ目的）- pathHelper.joinを使用
        const projectPath = activeProject.path.trim();
        const srcDir = pathHelper.join(projectPath, 'src');
        const scssDir = pathHelper.join(srcDir, 'scss');
        const globalDir = pathHelper.join(scssDir, "globals");
        const filePath = pathHelper.join(globalDir, '_breakpoints.scss');

        console.log('予想されるパス構造:', {
          scssDir,
          globalDir,
          breakpointsFile: filePath
        });
      }
    }

    // プロジェクト切り替え時にステートをリセット
    setIsProcessing(false);
    setIsSaved(true); // 初期状態は保存済みに設定
    setStatusMessage('');
    setIsInitialized(false);

    // activeProjectが変更された場合に実行
    if (activeProject && activeProject.id) {
      console.log(`プロジェクト[${activeProject.id}]のレスポンシブ設定を読み込みます`);

      const loadResponsiveData = async () => {
        try {
          setIsProcessing(true);

          // JSONからデータを読み込み
          const savedSettings = await projectDataStore.loadProjectData(activeProject.id, 'responsiveSettings');

          if (savedSettings) {
            console.log('JSONから読み込んだレスポンシブ設定:', savedSettings);

            if (savedSettings.responsiveMode) {
              const mode = savedSettings.responsiveMode;
              console.log(`設定されるレスポンシブモード: ${mode}`);

              // 読み込んだモードを設定（マウント済みフラグをオンにする前にセット）
              setResponsiveMode(mode);
            }

            if (savedSettings.breakpoints && Array.isArray(savedSettings.breakpoints)) {
              // mdが存在するか確認し、存在する場合はactiveをtrueに設定
              const updatedBreakpoints = savedSettings.breakpoints.map(bp => {
                if (bp.name === 'md') {
                  return { ...bp, active: true };
                }
                return bp;
              });
              setBreakpoints(updatedBreakpoints);
            }

            showStatus('レスポンシブ設定を読み込みました');
          } else {
            console.log('JSONにレスポンシブ設定が存在しないため、デフォルト値を使用します');

            // デフォルト値
            const defaultMode = 'sp';
            const defaultBreakpoints = [
              { id: 1, name: 'sm', value: 600, active: true },
              { id: 2, name: 'md', value: 768, active: true }, // mdは常に有効
              { id: 3, name: 'lg', value: 1024, active: true },
              { id: 4, name: 'xl', value: 1440, active: true },
            ];

            setResponsiveMode(defaultMode);
            setBreakpoints(defaultBreakpoints);

            // JSONに保存
            const settings = {
              responsiveMode: defaultMode,
              breakpoints: defaultBreakpoints
            };
            await projectDataStore.saveProjectData(activeProject.id, 'responsiveSettings', settings);

            // ファイルシステムにも反映
            if (isElectronContext && activeProject.path) {
              await saveToFile(defaultBreakpoints, defaultMode);
            }

            showStatus('デフォルトのレスポンシブ設定を作成しました');
          }

          // マウント済みフラグをセット
          isMounted.current = true;
          setIsInitialized(true);
          setIsSaved(true);
        } catch (error) {
          console.error('レスポンシブ設定読み込みエラー:', error);
          showStatus('エラーが発生しました: ' + error.message, false);
        } finally {
          setIsProcessing(false);
        }
      };

      loadResponsiveData();
    }

    // コンポーネントのアンマウント時にフラグをリセット
    return () => {
      isMounted.current = false;
    };
  }, [activeProject?.id, activeProject?.path, generateScssContent, showStatus]);
  console.log('SCSSファイル保存前の activeProject:', activeProject);
  console.log('activeProject.path:', activeProject?.path);

  // SCSSファイルを保存する関数
  const saveToFile = async (breakpointsData, mode) => {
    if (!isElectronContext || !activeProject || !activeProject.id) {
      console.error('ファイル保存に必要な条件が満たされていません: Electron環境でないか、アクティブなプロジェクトがありません');
      return false;
    }

    // activeProject.pathの検証
    if (!activeProject.path) {
      console.error('プロジェクトパスが設定されていません');
      return false;
    }

    if (typeof activeProject.path !== 'string') {
      console.error('プロジェクトパスが文字列ではありません:', typeof activeProject.path);
      console.error('プロジェクトパスの内容:', activeProject.path);
      return false;
    }

    try {
      // プロジェクトのパスを正確に確認
      console.log(`プロジェクトパス: ${activeProject.path}`);

      // パスを段階的に構築して検証
      const projectPath = activeProject.path.trim();
      console.log(`検証済みプロジェクトパス: ${projectPath}`);

      // src ディレクトリのパスを構築
      const srcDir = pathHelper.join(projectPath, 'src');
      console.log(`srcディレクトリパス: ${srcDir}`);

      // scss ディレクトリのパスを構築
      const scssDir = pathHelper.join(srcDir, 'scss');
      console.log(`scssディレクトリパス: ${scssDir}`);

      // global ディレクトリのパスを構築
      const globalDir = pathHelper.join(scssDir, "globals");
      console.log(`globalディレクトリパス: ${globalDir}`);

      // ファイルパスを構築
      const filePath = pathHelper.join(globalDir, '_breakpoints.scss');
      console.log(`SCSSファイルの保存先パス: ${filePath}`);

      // ディレクトリの存在確認
      const dirExists = await window.api.fs.exists(globalDir);

      if (!dirExists.exists) {
        console.log(`ディレクトリが存在しないため作成します: ${globalDir}`);
        await window.api.fs.mkdir(globalDir, { recursive: true });
      }

      // SCSSコードを生成して保存
      const scssContent = generateScssContent(breakpointsData, mode);
      const result = await window.api.fs.writeFile(filePath, scssContent);

      if (result.success) {
        console.log(`_breakpoints.scssを正常に保存しました: ${filePath}`);
        return true;
      } else {
        console.error(`_breakpoints.scssの保存に失敗しました: ${filePath}`, result.error);
        return false;
      }
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      return false;
    }
  };

  // スクロール位置を保存するハンドラ
  const saveScrollPosition = useCallback(() => {
    if (containerRef.current) {
      scrollPositionRef.current = containerRef.current.scrollTop;
      console.log('スクロール位置を保存:', scrollPositionRef.current);
    }
  }, []);

  // スクロール位置を復元するハンドラ
  const restoreScrollPosition = useCallback(() => {
    if (containerRef.current && scrollPositionRef.current > 0) {
      console.log('スクロール位置を復元:', scrollPositionRef.current);
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = scrollPositionRef.current;
        }
      }, 0);
    }
  }, []);

  // レスポンシブモードの変更ハンドラ
  const handleModeChange = (event) => {
    // すでにモード変更中なら処理を中断
    if (isChangingMode.current) {
      console.log('既にモード変更処理中のため、重複した処理をスキップします');
      return;
    }

    // 同じモードが選択された場合は何もしない
    const newMode = event.target.value;
    if (newMode === responsiveMode) {
      console.log(`同じモード(${newMode})が選択されたため、処理をスキップします`);
      return;
    }

    // スクロール位置を保存
    saveScrollPosition();

    isChangingMode.current = true;
    console.log(`選択されたモード: ${newMode}`);

    // 強制的に再レンダリングをトリガーするためにデータをコピー
    if (newMode === 'pc') {
      console.log('PCファーストモードへ変更します');
    } else {
      console.log('SPファーストモードへ変更します');
    }

    // レンダリングを最適化するため、状態更新を少し遅延させる
    setTimeout(() => {
      // 状態を一回だけ更新するため、バッチ更新する
      setResponsiveMode(newMode);
      setIsSaved(false);

      // 即時にローカルストレージと状態を反映
      try {
        // 現在のブレークポイント設定を取得
        const breakpointsCopy = [...breakpoints];
        // 設定オブジェクトを作成
        const settings = {
          responsiveMode: newMode,
          breakpoints: breakpointsCopy
        };

        // プロジェクトが初期化済みかつIDがある場合はデータを保存
        if (isInitialized && activeProject?.id) {
          console.log('設定を一時保存:', settings);

          // モード変更の永続化
          projectDataStore.saveProjectData(activeProject.id, 'responsiveSettings', settings)
            .then(() => {
              console.log(`モード変更を保存しました: ${newMode}`);
              // スクロール位置を復元
              restoreScrollPosition();
            })
            .catch(error => {
              console.error('モード変更の保存中にエラーが発生:', error);
            })
            .finally(() => {
              // 処理完了フラグを戻す
              isChangingMode.current = false;
            });
        } else {
          // それ以外の場合は単にフラグを戻す
          isChangingMode.current = false;
          // スクロール位置を復元
          restoreScrollPosition();
        }
      } catch (error) {
        console.error('モード変更中にエラーが発生:', error);
        isChangingMode.current = false;
        // エラー時にもスクロール位置を復元
        restoreScrollPosition();
      }
    }, 10); // 10msの遅延を追加
  };

  // レスポンシブモードの変更ハンドラをメモ化
  const handleModeChangeCallback = useCallback((event) => {
    handleModeChange(event);
  }, [handleModeChange]);

  // ブレークポイント変更検知用の副作用
  useEffect(() => {
    // マウント時の初期化処理ではスキップ
    if (isMounted.current && isInitialized) {
      setIsSaved(false);
    }
  }, [breakpoints, isInitialized]);

  // responsiveMode変更の追跡用
  useEffect(() => {
    console.log(`responsiveMode が変更されました: ${responsiveMode}`);
    // マウント時の初期化処理ではスキップ
    if (isMounted.current && isInitialized) {
      setIsSaved(false);

      // クラスの更新を確認
      console.log('モード変更によるスタイル更新:', {
        'sp-active': responsiveMode === 'sp',
        'pc-active': responsiveMode === 'pc'
      });
    }
  }, [responsiveMode, isInitialized]);

  // responsiveMode変更後にスクロール位置を復元
  useEffect(() => {
    if (isMounted.current && isInitialized) {
      restoreScrollPosition();
    }
  }, [responsiveMode, restoreScrollPosition]);

  // フォーマット済み初期値を保持
  const formattedInitialState = useRef(null);

  // 初期データをフォーマットして保存する関数
  const formatStateForComparison = useCallback((mode, bps) => {
    return JSON.stringify({
      responsiveMode: mode,
      breakpoints: bps.map(bp => ({
        id: bp.id,
        name: bp.name,
        value: bp.value,
        active: bp.active
      }))
    });
  }, []);

  // 初期値と現在値を比較する関数
  const hasChanges = useCallback(() => {
    if (!formattedInitialState.current || !isInitialized) return false;

    const currentState = formatStateForComparison(responsiveMode, breakpoints);
    return formattedInitialState.current !== currentState;
  }, [formatStateForComparison, responsiveMode, breakpoints, isInitialized]);

  // 初期値の設定とその後の変更検出
  useEffect(() => {
    if (isInitialized && !formattedInitialState.current) {
      // 初期値を設定
      formattedInitialState.current = formatStateForComparison(responsiveMode, breakpoints);
      console.log('初期値を設定しました');
    } else if (isInitialized && formattedInitialState.current) {
      // 現在の状態と初期値を比較して変更があるか確認
      const hasStateChanged = hasChanges();
      setIsSaved(!hasStateChanged);
      console.log('状態変更の検出:', hasStateChanged ? '変更あり' : '変更なし');
    }
  }, [responsiveMode, breakpoints, isInitialized, formatStateForComparison, hasChanges]);

  // 保存ボタンクリックハンドラ
  const handleSave = async () => {
    if (!activeProject || !activeProject.id) {
      showStatus('プロジェクトが選択されていません', false);
      return;
    }

    // 既に処理中なら重複実行を防止
    if (isProcessing) {
      console.log('既に保存処理中です');
      return;
    }

    setIsProcessing(true);
    showStatus('保存中...', false);

    try {
      console.log('保存前の状態確認:', { currentMode: responsiveMode });

      // mdのブレークポイントを常に有効にする
      const validatedBreakpoints = breakpoints.map(bp => {
        if (bp.name === 'md') {
          return { ...bp, active: true };
        }
        return bp;
      });

      // JSONに保存するデータ
      const settings = {
        responsiveMode: responsiveMode,
        breakpoints: validatedBreakpoints
      };

      console.log('保存するデータ:', settings);

      // JSONに保存
      const saveResult = await projectDataStore.saveProjectData(activeProject.id, 'responsiveSettings', settings);

      if (!saveResult) {
        throw new Error('データの保存に失敗しました');
      }

      // ファイルシステムにも保存
      if (isElectronContext && activeProject.path) {
        const fileResult = await saveToFile(validatedBreakpoints, responsiveMode);
        if (!fileResult) {
          console.error('SCSSファイルの保存に失敗しました');
          // エラーを投げるのではなく、ユーザーに警告を表示
          showStatus('JSONには保存しましたが、SCSSファイルの保存に失敗しました。パスを確認してください。', false);
        } else {
          // 状態を更新
          setBreakpoints(validatedBreakpoints);
          setIsSaved(true);
          showStatus('レスポンシブ設定を保存しました');

          console.log('レスポンシブ設定を保存しました', settings);
        }
      } else {
        // Electron環境以外またはプロジェクトパスがない場合
        setBreakpoints(validatedBreakpoints);
        setIsSaved(true);
        showStatus('JSONに設定を保存しました (SCSSファイルは保存されていません)');
      }

      // 再読み込みを行ってデータの整合性を確保
      const reloadedSettings = await projectDataStore.loadProjectData(activeProject.id, 'responsiveSettings');
      if (reloadedSettings && reloadedSettings.responsiveMode) {
        console.log('保存後に再読み込みしたモード:', reloadedSettings.responsiveMode);
      }
    } catch (error) {
      console.error('保存エラー:', error);
      showStatus('保存中にエラーが発生しました: ' + error.message, false);
    } finally {
      setIsProcessing(false);
    }
  };

  // ブレークポイント追加ハンドラ
  const handleAddBreakpoint = () => {
    // 既存の名前をチェック
    const existingNames = breakpoints.map(bp => bp.name);

    // ユニークな名前を生成 (new, new1, new2, ...)
    let newName = 'new';
    let counter = 1;
    while (existingNames.includes(newName)) {
      newName = `new${counter}`;
      counter++;
    }

    setBreakpoints(prev => [
      ...prev,
      { id: Date.now(), name: newName, value: 0, active: true },
    ]);
    setIsSaved(false);
  };

  // ブレークポイント削除ハンドラ
  const handleRemoveBreakpoint = (id) => {
    // 削除対象のブレークポイントを特定
    const targetBreakpoint = breakpoints.find(bp => bp.id === id);

    // mdの場合は削除しない
    if (targetBreakpoint && targetBreakpoint.name === 'md') {
      console.log('mdブレークポイントは削除できません');
      showStatus('mdブレークポイントは必須のため削除できません', true);
      return;
    }

    setBreakpoints(prev => prev.filter(item => item.id !== id));
    setIsSaved(false);
  };

  // ブレークポイント更新ハンドラ
  const handleUpdateBreakpoint = (id, field, value) => {
    setBreakpoints(prev =>
      prev.map(item => {
        if (item.id === id) {
          // mdの場合はactiveをtrueに固定
          if (item.name === 'md' && field === 'active') {
            return item; // mdの場合はactiveの変更を無視
          }
          return { ...item, [field]: value };
        }
        return item;
      })
    );
    setIsSaved(false);
  };

  // ブレークポイント更新ハンドラをメモ化
  const handleUpdateBreakpointCallback = useCallback((id, field, value) => {
    handleUpdateBreakpoint(id, field, value);
  }, [handleUpdateBreakpoint]);

  // ブレークポイント削除ハンドラをメモ化
  const handleRemoveBreakpointCallback = useCallback((id) => {
    handleRemoveBreakpoint(id);
  }, [handleRemoveBreakpoint]);

  return (
    <div
      className="responsive-config"
      ref={containerRef}
      onScroll={() => {
        // スクロール位置を随時保存
        if (!isChangingMode.current) {
          scrollPositionRef.current = containerRef.current?.scrollTop || 0;
        }
      }}
    >
      <Header
        title="レスポンシブ設定"
        description="レスポンシブデザインの設定を管理します"
      />

      <div className="responsive-container">
        {!activeProject ? (
          <div className="no-project-message">
            <p>プロジェクトが選択されていません。プロジェクト管理からプロジェクトを選択してください。</p>
          </div>
        ) : isProcessing ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>読み込み中...</p>
          </div>
        ) : (
          <>
            {/* スマホファースト/PCファースト切り替え */}
            <div className="radio-group">
              <h3>レスポンシブ方式</h3>
              <div className="radio-options">
                <label className={responsiveMode === 'sp' ? 'active-radio' : ''}>
                  <input
                    type="radio"
                    name="responsiveMode"
                    value="sp"
                    checked={responsiveMode === 'sp'}
                    onChange={handleModeChangeCallback}
                    id="radio-sp"
                  />
                  <span>スマホファースト (min-width)</span>
                </label>
                <label className={responsiveMode === 'pc' ? 'active-radio' : ''}>
                  <input
                    type="radio"
                    name="responsiveMode"
                    value="pc"
                    checked={responsiveMode === 'pc'}
                    onChange={handleModeChangeCallback}
                    id="radio-pc"
                  />
                  <span>PCファースト (max-width)</span>
                </label>
              </div>
            </div>

            {/* ブレークポイント設定 */}
            <div className="breakpoints-container">
              <h3>ブレークポイント設定</h3>
              <table className="breakpoints-table">
                <thead>
                  <tr>
                    <th>有効</th>
                    <th>名前</th>
                    <th>値(px)</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {breakpoints.map((bp) => (
                    <BreakpointRow
                      key={bp.id}
                      breakpoint={bp}
                      onUpdate={handleUpdateBreakpointCallback}
                      onRemove={handleRemoveBreakpointCallback}
                    />
                  ))}
                </tbody>
              </table>
              <button
                onClick={handleAddBreakpoint}
                className="add-button"
              >
                ブレークポイントを追加
              </button>
            </div>

            {/* 保存ボタンとステータス */}
            <div className="editor-actions">
              <div className="editor-status">
                {statusMessage && <p className="status-message">{statusMessage}</p>}
                {!isSaved && hasChanges() && (
                  <p className="save-status">
                    <span className="unsaved">
                      ● 未保存の変更があります
                    </span>
                  </p>
                )}
              </div>

              <button
                onClick={handleSave}
                className="save-button"
                disabled={isProcessing || isSaved || !hasChanges()}
              >
                {isProcessing ? "保存中..." : "変更を保存"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResponsiveConfig;
