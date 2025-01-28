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
    <div>
      <h3>ブレークポイント設定</h3>
      <table>
        <thead>
          <tr>
            <th>有効</th>
            <th>名前</th>
            <th>値(px)</th>
            <th>削除</th>
          </tr>
        </thead>
        <tbody>
          {breakpoints.map((bp) => (
            <tr key={bp.id}>
              <td>
                <input
                  type="checkbox"
                  checked={bp.active}
                  onChange={() => toggleBreakpoint(bp.id)}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={bp.name}
                  onChange={(e) =>
                    handleBreakpointChange(bp.id, 'name', e.target.value)
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  value={bp.value}
                  onChange={(e) =>
                    handleBreakpointChange(bp.id, 'value', parseInt(e.target.value, 10))
                  }
                />
              </td>
              <td>
                <button onClick={() => removeBreakpoint(bp.id)}>削除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addBreakpoint}>ブレークポイントを追加</button>
    </div>
  );
};

export default Breakpoints;
