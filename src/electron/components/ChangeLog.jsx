import React from 'react';

const ChangeLog = ({ logs }) => {
  return (
    <div>
      <h2>変更ログ</h2>
      <ul>
        {logs.map((log, index) => (
          <li key={index}>
            <strong>{log.time || 'No Time'}</strong>: {log.message || 'No Message'}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChangeLog;
