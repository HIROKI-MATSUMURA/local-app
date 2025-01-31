import React, { useState, useEffect } from 'react';

const Settings = ({ addLog }) => {
  const [selectedStructure, setSelectedStructure] = useState('FLOCSS'); // 初期値はFLOCSS

  // ページが読み込まれたときにlocalStorageから構造設定を取得
  useEffect(() => {
    const storedStructure = localStorage.getItem('selectedStructure');
    if (storedStructure) {
      setSelectedStructure(storedStructure); // 保存されていればそれを使用
    }
  }, []);

  // 構造変更があった場合にlocalStorageに保存
  useEffect(() => {
    localStorage.setItem('selectedStructure', selectedStructure); // localStorageに保存
  }, [selectedStructure]);

  const handleStructureChange = (event) => {
    const newStructure = event.target.value;
    setSelectedStructure(newStructure);

    // Electronに構造変更リクエストを送信
    window.api.send('generate-structure', newStructure);

    // structure-generated イベントをリッスン
    window.api.receive('structure-generated', (newLog) => {
      console.log('React: structure-generated受信', newLog);
      addLog(newLog); // ログを追加
    });
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>設定</h2>

      <div style={styles.currentStructure}>
        <label style={styles.currentLabel}>現在の構築方法: <strong>{selectedStructure}</strong></label>
      </div>

      <div style={styles.radioButtonsContainer}>
        <label style={styles.radioLabel}>
          <input
            type="radio"
            name="structureType"
            value="FLOCSS"
            checked={selectedStructure === 'FLOCSS'}
            onChange={handleStructureChange}
            style={styles.radioInput}
          />
          FLOCSS
        </label>
        <label style={styles.radioLabel}>
          <input
            type="radio"
            name="structureType"
            value="BEM"
            checked={selectedStructure === 'BEM'}
            onChange={handleStructureChange}
            style={styles.radioInput}
          />
          BEM
        </label>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#f7f8f9',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
  },
  header: {
    textAlign: 'center',
    fontSize: '24px',
    color: '#333',
    fontWeight: 'bold',
    marginBottom: '20px',
  },
  currentStructure: {
    marginBottom: '20px',
    textAlign: 'center',
    fontSize: '18px',
  },
  currentLabel: {
    color: '#555',
  },
  radioButtonsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    marginBottom: '20px',
  },
  radioLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '16px',
    color: '#333',
  },
  radioInput: {
    marginRight: '10px',
    accentColor: '#F37A48', // ラジオボタンの選択色
  },
};

export default Settings;
