import React, { useState } from 'react';

const HeadConfig = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [favicon, setFavicon] = useState('');
  const [metaInfo, setMetaInfo] = useState('');
  const [noIndex, setNoIndex] = useState(false);  // noindex設定を追加

  const handleSave = () => {
    const headData = { title, description, keywords, favicon, metaInfo, noIndex };
    window.api.send('save-head', headData);  // メインプロセスに送信
    console.log('Head settings saved:', headData);
  };

  return (
    <div>
      <h2>Head設定</h2>
      <div>
        <label>タイトル</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label>ディスクリプション</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label>キーワード</label>
        <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </div>
      <div>
        <label>ファビコン（アイコンURL）</label>
        <input type="text" value={favicon} onChange={(e) => setFavicon(e.target.value)} />
      </div>
      <div>
        <label>Meta情報</label>
        <input type="text" value={metaInfo} onChange={(e) => setMetaInfo(e.target.value)} />
      </div>
      <div>
        <label>NoIndex</label>
        <input
          type="checkbox"
          checked={noIndex}
          onChange={(e) => setNoIndex(e.target.checked)}
        />
      </div>
      <button onClick={handleSave}>保存</button>
    </div>
  );
};
