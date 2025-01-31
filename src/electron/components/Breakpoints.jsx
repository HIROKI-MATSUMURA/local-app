import React from 'react';

const Breakpoints = ({ responsiveMode, breakpoints, setBreakpoints }) => {
  const handleBreakpointChange = (id, key, value) => {
    setBreakpoints((prev) =>
      prev.map((bp) => (bp.id === id ? { ...bp, [key]: value } : bp))
    );
  };

  const toggleBreakpoint = (id) => {
    setBreakpoints((prev) =>
      prev.map((bp) => (bp.id === id ? { ...bp, active: !bp.active } : bp))
    );
  };

  const addBreakpoint = () => {
    setBreakpoints((prev) => [
      ...prev,
      { id: Date.now(), name: 'new', value: 0, active: true },
    ]);
  };

  const removeBreakpoint = (id) => {
    setBreakpoints((prev) => prev.filter((bp) => bp.id !== id));
  };

  return (
    <div style={styles.container}>
      <h3>ブレークポイント設定</h3>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th1}>有効</th>
            <th style={styles.th2}>名前</th>
            <th style={styles.th2}>値(px)</th>
            <th style={styles.th3}>削除</th>
          </tr>
        </thead>
        <tbody>
          {breakpoints.map((bp) => (
            <tr key={bp.id}>
              <td style={styles.td}>
                <input
                  type="checkbox"
                  checked={bp.active}
                  onChange={() => toggleBreakpoint(bp.id)}
                  disabled={bp.name === 'md'}
                  style={styles.checkbox}
                />
              </td>
              <td style={styles.td}>
                <input
                  type="text"
                  value={bp.name}
                  onChange={(e) =>
                    handleBreakpointChange(bp.id, 'name', e.target.value)
                  }
                  disabled={bp.name === 'md'}
                  style={styles.nameInput}
                />
              </td>
              <td style={styles.td}>
                <input
                  type="number"
                  value={bp.value}
                  onChange={(e) =>
                    handleBreakpointChange(bp.id, 'value', parseInt(e.target.value, 10))
                  }
                  style={styles.valueInput}
                />
              </td>
              <td style={styles.td}>
                {bp.name !== 'md' && (
                  <button onClick={() => removeBreakpoint(bp.id)} style={styles.removeButton}>
                    削除
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addBreakpoint} style={styles.addButton}>
        ブレークポイントを追加
      </button>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    maxWidth: '900px',
    margin: '0 auto',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '20px',
  },
  th1: {
    backgroundColor: '#f0f0f0',
    padding: '10px',
    textAlign: 'left',
    fontWeight: 'bold',
    width: '10%', // 1列目（有効）の幅を10%に設定
  },
  th2: {
    backgroundColor: '#f0f0f0',
    padding: '10px',
    textAlign: 'left',
    fontWeight: 'bold',
    width: '35%', // 2列目（名前）と3列目（値）の幅を35%に設定
  },
  th3: {
    backgroundColor: '#f0f0f0',
    padding: '10px',
    textAlign: 'left',
    fontWeight: 'bold',
    width: '20%', // 4列目（削除）の幅を20%に設定
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid #ddd',
  },
  nameInput: {
    padding: '10px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    width: '80%', // 幅を狭く設定
  },
  valueInput: {
    padding: '10px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    width: '60%', // 幅を少し狭く設定
  },
  checkbox: {
    width: '20px',
    height: '20px',
  },
  removeButton: {
    backgroundColor: '#ff4d4d',
    color: 'white',
    padding: '5px 10px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  addButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
  },
};

export default Breakpoints;
