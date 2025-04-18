import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const InitialSetup = () => {
  const [email, setEmail] = useState('');
  const [acid, setAcid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!email || !acid) {
      setError('メールアドレスと初回ログイン番号を入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://payments.codeups.jp/register-acid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, acid }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        setSuccess(true);
      } else {
        setError(data.message || '登録に失敗しました');
      }
    } catch (err) {
      setError('サーバーエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2>初回設定</h2>

      {success ? (
        <>
          <p>メールアドレス登録完了！</p>
          <button onClick={() => navigate('/login')} style={styles.button}>
            ログイン画面へ戻る
          </button>
        </>
      ) : (
        <>
          <div style={styles.formGroup}>
            <label>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="例）sample@example.com"
            />
          </div>

          <div style={styles.formGroup}>
            <label>初回ログイン番号</label>
            <input
              type="text"
              value={acid}
              onChange={(e) => setAcid(e.target.value)}
              style={styles.input}
              placeholder="例）1002933222"
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button onClick={handleRegister} style={styles.button} disabled={loading}>
            {loading ? '登録中...' : '登録する'}
          </button>
        </>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '30px',
    maxWidth: '400px',
    margin: '50px auto',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: '20px',
    textAlign: 'left',
  },
  input: {
    width: '100%',
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    marginTop: '5px',
  },
  button: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    fontSize: '16px',
    cursor: 'pointer',
  },
  error: {
    color: 'red',
    marginBottom: '10px',
  },
};

export default InitialSetup;
