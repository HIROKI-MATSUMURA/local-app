import React, { useState } from 'react';

const DragDropPage = () => {
  const [parts, setParts] = useState([]); // 配置されたパーツを管理

  const handleSavePage = () => {
    // 保存ボタンをクリックしたときに配置されたパーツを保存
    const pageContent = JSON.stringify(parts);
    localStorage.setItem('pageParts', pageContent);
    console.log('Page saved:', pageContent);
  };

  const addPart = (part) => {
    setParts([...parts, part]);
  };

  return (
    <div>
      <h2>ページ作成</h2>

      <div>
        <button onClick={() => addPart('Header')}>Headerを追加</button>
        <button onClick={() => addPart('Footer')}>Footerを追加</button>
        <button onClick={() => addPart('Sidebar')}>Sidebarを追加</button>
        <button onClick={() => addPart('Card')}>Cardを追加</button>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>配置されたパーツ</h3>
        <ul>
          {parts.map((part, index) => (
            <li key={index}>{part}</li>
          ))}
        </ul>
      </div>

      <button onClick={handleSavePage}>ページを保存</button>
    </div>
  );
};

export default DragDropPage;
