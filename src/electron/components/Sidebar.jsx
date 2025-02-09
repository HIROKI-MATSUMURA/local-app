import React from 'react';

const Sidebar = () => {
  return (
    <div style={{ width: '200px', backgroundColor: '#f4f4f4', padding: '10px' }}>
      <h3>メニュー</h3>
      <ul>
        <li>設定</li>
        <li>コードエディタ</li>
        <li>その他</li>
      </ul>
    </div>
  );
};

export default Sidebar;
