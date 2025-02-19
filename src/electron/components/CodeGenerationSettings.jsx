import React from "react";

const CodeGenerationSettings = ({ responsiveMode, breakpoints, aiBreakpoints, setAiBreakpoints }) => {
  const toggleAiBreakpoint = (index) => {
    const updatedBreakpoints = [...aiBreakpoints];
    updatedBreakpoints[index].aiActive = !updatedBreakpoints[index].aiActive;
    setAiBreakpoints(updatedBreakpoints);
  };

  return (
    <div className="code-generation-settings">
      {/* レスポンシブモード */}
      <div className="form-group">
        <label>レスポンシブモード:</label>
        <p>{responsiveMode === "sp" ? "モバイルファースト" : "デスクトップファースト"}</p>
      </div>

      {/* ブレークポイント表示 */}
      <div className="form-group">
        <label>アクティブなブレークポイント:</label>
        {aiBreakpoints.map((bp, index) => (
          <div key={index} className="breakpoint-item">
            <span>{bp.name}: {bp.value}px</span>
            <label>
              <input
                type="checkbox"
                checked={bp.aiActive}
                onChange={() => toggleAiBreakpoint(index)}
              />
              AIに指示
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CodeGenerationSettings;
