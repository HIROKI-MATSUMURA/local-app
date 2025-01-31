import React, { useState } from 'react';

const VariableConfig = () => {
  const [variables, setVariables] = useState({
    lInner: '1000px',
    paddingPc: '25px',
    paddingSp: '20px',
    jaFont: '',
    enFont: '',
    regularWeight: '300',
    normalWeight: '400',
    boldWeight: '700',
    primaryColor: '#231815',
    secondaryColor: '#0076ad',
    customColors: ['#ff0000', '#00ff00', '#0000ff'],
  });

  const [selectedWeights, setSelectedWeights] = useState([300, 400, 700]);

  const handleColorChange = (index, value) => {
    const updatedColors = [...variables.customColors];
    updatedColors[index] = value;
    setVariables({ ...variables, customColors: updatedColors });
  };

  const addColor = () => {
    setVariables({ ...variables, customColors: [...variables.customColors, '#000000'] });
  };

  const removeColor = (index) => {
    const updatedColors = variables.customColors.filter((_, i) => i !== index);
    setVariables({ ...variables, customColors: updatedColors });
  };

  const handleWeightChange = (weight) => {
    setSelectedWeights((prev) =>
      prev.includes(weight) ? prev.filter((w) => w !== weight) : [...prev, weight]
    );
  };

  const handleFontChange = (event, type) => {
    const updatedFonts = { ...variables };
    updatedFonts[type] = event.target.value;
    setVariables(updatedFonts);
  };

  const handleSave = () => {
    window.api.send('save-variables', variables);
    console.log('Variables saved:', variables);
  };

  return (
    <div style={styles.container}>
      <h2>変数設定</h2>
      <form style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>インナー幅 (l-inner):</label>
          <input
            type="text"
            name="lInner"
            value={variables.lInner}
            onChange={(e) => setVariables({ ...variables, lInner: e.target.value })}
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>PC Padding:</label>
          <input
            type="text"
            name="paddingPc"
            value={variables.paddingPc}
            onChange={(e) => setVariables({ ...variables, paddingPc: e.target.value })}
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>SP Padding:</label>
          <input
            type="text"
            name="paddingSp"
            value={variables.paddingSp}
            onChange={(e) => setVariables({ ...variables, paddingSp: e.target.value })}
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>日本語フォント (ja):</label>
          <input
            type="text"
            name="jaFont"
            value={variables.jaFont}
            onChange={(e) => handleFontChange(e, 'jaFont')}
            style={styles.input}
            placeholder="Google Font URL"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>英語フォント (en):</label>
          <input
            type="text"
            name="enFont"
            value={variables.enFont}
            onChange={(e) => handleFontChange(e, 'enFont')}
            style={styles.input}
            placeholder="Google Font URL"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>フォントウェイト:</label>
          <div style={styles.checkboxGroup}>
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => (
              <label key={weight}>
                <input
                  type="checkbox"
                  checked={selectedWeights.includes(weight)}
                  onChange={() => handleWeightChange(weight)}
                  style={styles.checkbox}
                />
                {weight}
              </label>
            ))}
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>色設定:</label>
          <div style={styles.colorPicker}>
            {variables.customColors.map((color, index) => (
              <div key={index} style={styles.colorItem}>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => handleColorChange(index, e.target.value)}
                  style={styles.colorInput}
                />
                <div
                  style={{
                    ...styles.colorPreview,
                    backgroundColor: color,
                  }}
                ></div>
                <button type="button" onClick={() => removeColor(index)} style={styles.removeButton}>
                  削除
                </button>
              </div>
            ))}
            <button type="button" onClick={addColor} style={styles.addColorButton}>
              色を追加
            </button>
          </div>
        </div>

        <div style={styles.buttonContainer}>
          <button type="button" onClick={handleSave} style={styles.saveButton}>
            変更を保存
          </button>
        </div>
      </form>
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
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  formGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
    flex: 1,
    textAlign: 'right',
    paddingRight: '20px',
    width: '30%',
  },
  input: {
    padding: '10px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    width: '70%',
  },
  checkboxGroup: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    width: '73%',
  },
  checkbox: {
    marginRight: '10px',
  },
  colorPicker: {
    display: 'flex',
    flexDirection: 'column',
    width: '73%',
  },
  colorItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  colorInput: {
    padding: '5px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    width: '40%',
    marginRight: '10px',
  },
  colorPreview: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    marginLeft: '10px',
    marginRight: '30px',
  },
  removeButton: {
    backgroundColor: '#ff0000',
    color: 'white',
    padding: '5px 10px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  addColorButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  buttonContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  saveButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
  },
};

export default VariableConfig;

