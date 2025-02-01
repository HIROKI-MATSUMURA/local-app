import React, { useState, useEffect } from 'react';

const VariableConfig = () => {
  // 初期状態をローカルストレージから取得
  const [variables, setVariables] = useState(() => {
    const savedVariables = localStorage.getItem('variables');
    return savedVariables ? JSON.parse(savedVariables) : {
      lInner: '1000',
      paddingPc: '25',
      paddingSp: '20',
      jaFont: '',
      enFont: '',
      primaryColor: '#231815',
      secondaryColor: '#0076ad',
      accentColor: '#ff5722',
      customColors: [
        { name: '$primary-color', color: '#231815' },
        { name: '$secondary-color', color: '#0076ad' },
        { name: '$accent-color', color: '#ff5722' },
      ],
      fonts: [{ id: Date.now(), name: '', url: '' }],
    };
  });

  // 変数変更時にローカルストレージに保存
  useEffect(() => {
    localStorage.setItem('variables', JSON.stringify(variables));
  }, [variables]);

  const handleFontChange = (index, value, type) => {
    const updatedFonts = [...variables.fonts];
    updatedFonts[index][type] = value;
    setVariables({ ...variables, fonts: updatedFonts });
  };

  const addFont = () => {
    setVariables({
      ...variables,
      fonts: [
        ...variables.fonts,
        { id: Date.now(), name: '', url: '' },
      ],
    });
  };

  const removeFont = (index) => {
    const updatedFonts = variables.fonts.filter((_, i) => i !== index);
    setVariables({ ...variables, fonts: updatedFonts });
  };

  const handleColorChange = (index, value) => {
    const updatedColors = [...variables.customColors];
    updatedColors[index].color = value;
    setVariables({ ...variables, customColors: updatedColors });
  };

  const addColor = () => {
    setVariables({ ...variables, customColors: [...variables.customColors, { name: '', color: '#000000' }] });
  };

  const removeColor = (index) => {
    const updatedColors = variables.customColors.filter((_, i) => i !== index);
    setVariables({ ...variables, customColors: updatedColors });
  };

  const handleSave = () => {
    // pxをremに変換する関数
    const toRem = (px) => {
      const remValue = px / 16;
      return remValue % 1 === 0 ? `${remValue.toFixed(0)}rem` : `${remValue.toFixed(2)}rem`;
    };

    const colorVariables = variables.customColors
      .map((color) => `${color.name}: ${color.color};`)
      .join('\n');

    const variablesInRem = {
      ...variables,
      lInner: toRem(variables.lInner),
      paddingPc: toRem(variables.paddingPc),
      paddingSp: toRem(variables.paddingSp),
    };

    const scssContent = `// インナー幅設定
$l-inner: ${variablesInRem.lInner};
$padding-pc: ${variablesInRem.paddingPc};
$padding-sp: ${variablesInRem.paddingSp};

// 色の指定
${colorVariables}

// フォント設定
$ja: "${variables.jaFont}";
$en: "${variables.enFont}";
`;

    window.api.send('save-scss-file', {
      filePath: 'src/scss/global/_setting.scss',
      content: scssContent,
    });

    console.log('Variables saved:', scssContent);
  };

  return (
    <div style={styles.container}>
      <h2>変数設定</h2>
      <form style={styles.form}>
        {/* インナー幅 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>インナー幅（pxで入力、自動的にremに変更）:</label>
          <input
            type="number"
            name="lInner"
            value={variables.lInner}
            onChange={(e) => setVariables({ ...variables, lInner: e.target.value })}
            style={styles.input}
          />
        </div>

        {/* PC Padding */}
        <div style={styles.formGroup}>
          <label style={styles.label}>PC用Padding幅（pxで入力、自動的にremに変更）:</label>
          <input
            type="number"
            name="paddingPc"
            value={variables.paddingPc}
            onChange={(e) => setVariables({ ...variables, paddingPc: e.target.value })}
            style={styles.input}
          />
        </div>

        {/* SP Padding */}
        <div style={styles.formGroup}>
          <label style={styles.label}>SP用Padding幅（pxで入力、自動的にremに変更）:</label>
          <input
            type="number"
            name="paddingSp"
            value={variables.paddingSp}
            onChange={(e) => setVariables({ ...variables, paddingSp: e.target.value })}
            style={styles.input}
          />
        </div>

        {/* フォント設定 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>フォント設定（URLから自動的にウェイトは取得して変数化）:</label>
          <div style={styles.fontsContainer}>
            {variables.fonts.map((font, index) => (
              <div key={font.id} style={styles.fontItem}>
                <input
                  type="text"
                  value={font.name}
                  onChange={(e) => handleFontChange(index, e.target.value, 'name')}
                  style={styles.input}
                  placeholder="変数名"
                />
                <input
                  type="text"
                  value={font.url}
                  onChange={(e) => handleFontChange(index, e.target.value, 'url')}
                  style={styles.input}
                  placeholder="Google Font URL"
                />
                <button
                  type="button"
                  onClick={() => removeFont(index)}
                  style={styles.removeButton}
                >
                  削除
                </button>
              </div>
            ))}
            <button type="button" onClick={addFont} style={styles.addFontButton}>
              フォントを追加
            </button>
          </div>
        </div>

        {/* 色設定 */}
        <div style={styles.formGroup}>
          <label style={styles.label}>色設定:</label>
          <div style={styles.colorPicker}>
            {variables.customColors.map((color, index) => (
              <div key={index} style={styles.colorItem}>
                <input
                  type="text"
                  value={color.name}
                  onChange={(e) => {
                    const updatedColors = [...variables.customColors];
                    updatedColors[index].name = e.target.value;
                    setVariables({ ...variables, customColors: updatedColors });
                  }}
                  style={styles.colorInput}
                />
                <input
                  type="text"
                  value={color.color}
                  onChange={(e) => handleColorChange(index, e.target.value)}
                  style={styles.colorInput}
                />
                <div
                  style={{
                    ...styles.colorPreview,
                    backgroundColor: color.color,
                  }}
                ></div>
                <button
                  type="button"
                  onClick={() => removeColor(index)}
                  style={styles.removeButton}
                >
                  削除
                </button>
              </div>
            ))}
            <button type="button" onClick={addColor} style={styles.addColorButton}>
              色を追加
            </button>
          </div>
        </div>

        {/* 保存ボタン */}
        <div style={styles.buttonContainer}>
          <button type="button" onClick={handleSave} style={styles.saveButton}>
            変更を保存
          </button>
        </div>
      </form>
    </div>
  );
};

// CSSスタイルの設定
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
    marginBottom: '20px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
  },
  input: {
    padding: '10px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    width: '100%',
  },
  fontsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fontItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '10px',
    borderBottom: '1px solid #ddd',
    paddingBottom: '10px',
  },
  removeButton: {
    backgroundColor: '#ff0000',
    color: 'white',
    padding: '5px 10px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  addFontButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    width: '200px',
  },
  colorPicker: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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
    width: '20%',
    marginRight: '10px',
  },
  colorPreview: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    marginLeft: '10px',
    marginRight: '30px',
  },
  addColorButton: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    width: '200px',
  },
  buttonContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  saveButton: {
    backgroundColor: '#F37A48',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    width: '100%',
  },
};

export default VariableConfig;
