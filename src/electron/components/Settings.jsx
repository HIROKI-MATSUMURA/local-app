import React, { useState, useEffect } from 'react';

const Settings = ({ addLog }) => {
  const [currentStructure, setCurrentStructure] = useState('FLOCSS');
  const [selectedStructure, setSelectedStructure] = useState('FLOCSS');

  useEffect(() => {
    setSelectedStructure(currentStructure); // 親の状態に合わせて選択状態を更新
  }, [currentStructure]);

  const handleStructureChange = (event) => {
    const newStructure = event.target.value;
    setSelectedStructure(newStructure);

    // Electronに構造変更リクエストを送信
    window.api.send('generate-structure', newStructure);

    // structure-generated イベントをリッスン
    window.api.receive('structure-generated', (newLog) => {
      console.log('React: structure-generated受信', newLog);
      setCurrentStructure(newStructure); // 親の状態を更新
      addLog(newLog); // ログを追加
    });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>設定</h2>

      <div>
        <label>現在の構築方法: {currentStructure}</label>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>
          <input
            type="radio"
            name="responsiveMode"
            value="FLOCSS"
            checked={selectedStructure === 'FLOCSS'}
            onChange={handleStructureChange}
          />
          FLOCSS
        </label>
        <label style={{ marginLeft: '10px' }}>
          <input
            type="radio"
            name="responsiveMode"
            value="BEM"
            checked={selectedStructure === 'BEM'}
            onChange={handleStructureChange}
          />
          BEM
        </label>
      </div>

      <button onClick={() => window.api.send('save-scss-file')}>変更を保存</button>
    </div>
  );
};

export default Settings;
