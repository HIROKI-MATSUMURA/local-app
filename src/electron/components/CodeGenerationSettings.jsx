import React from "react";

const CodeGenerationSettings = ({ responsiveMode, breakpoints, aiBreakpoints = [], setAiBreakpoints }) => {
  const toggleAiBreakpoint = (index) => {
    if (!aiBreakpoints || !setAiBreakpoints) return;

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
        {aiBreakpoints && aiBreakpoints.length > 0 ? (
          aiBreakpoints.map((bp, index) => (
            <div key={index} className="breakpoint-item">
              <span>{bp.name}: {bp.value}px</span>
              {setAiBreakpoints && (
                <label>
                  <input
                    type="checkbox"
                    checked={bp.aiActive}
                    onChange={() => toggleAiBreakpoint(index)}
                  />
                  AIに指示
                </label>
              )}
            </div>
          ))
        ) : (
          <p>ブレークポイントが設定されていません</p>
        )}
      </div>
    </div>
  );
};

export default CodeGenerationSettings;
