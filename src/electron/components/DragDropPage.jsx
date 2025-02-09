import React, { useState, useEffect } from 'react';

// コンポーネント例：Header
const Header = ({ title, logoUrl }) => (
  <div>
    <h1>{title}</h1>
    <img src={logoUrl} alt="Logo" />
  </div>
);

// コンポーネント例：Footer
const Footer = ({ footerText }) => (
  <div>
    <p>{footerText}</p>
  </div>
);

const DragDropPage = () => {
  const [parts, setParts] = useState([]); // 配置されたパーツを管理

  // 初期化時にローカルストレージから配置したパーツを復元
  useEffect(() => {
    const savedParts = localStorage.getItem('pageParts');
    if (savedParts) {
      try {
        const parsedParts = JSON.parse(savedParts);
        // ローカルストレージに保存されたデータが配列であるか確認
        if (Array.isArray(parsedParts)) {
          setParts(parsedParts);
        } else {
          setParts([]); // 配列でない場合は空の配列に設定
        }
      } catch (error) {
        console.error('Error parsing saved parts:', error);
        setParts([]); // エラーがあれば空の配列に設定
      }
    }
  }, []);

  // ページを保存
  const handleSavePage = () => {
    const pageData = {
      pageName: "トップページ",
      components: parts.map(part => ({
        type: part.toLowerCase(),
        properties: {
          title: `${part} title`,
          logoUrl: `/path/to/${part.toLowerCase()}-logo.png`
        }
      })),
    };

    // ページデータをJSONとして保存
    window.api.send('save-page', pageData);  // ここで送信
    console.log('Page saved:', pageData);  // 保存データの確認

    // ローカルストレージにも保存
    localStorage.setItem('pageParts', JSON.stringify(parts));
  };

  // パーツを追加
  const addPart = (part) => {
    const newParts = [...parts, part];
    setParts(newParts);

    // ローカルストレージに保存
    localStorage.setItem('pageParts', JSON.stringify(newParts));
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
