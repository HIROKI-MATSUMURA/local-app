import React, { useState } from 'react';
import axios from 'axios';
import logo from '../../assets/CreAIteCodeLogo.png'; // ← ロゴ画像パス合わせてね！

const Login = ({ onLoginSuccess }) => {

  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!activationKey) {
      setError('アクティベーションキーを入力してください');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('https://payments.codeups.jp/auth', { activeKey: activationKey });

      if (response.status === 200) {
        onLoginSuccess();
      } else {
        setError('認証に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setError('認証に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <img
        src={logo}
        alt="Logo"
        style={{
          ...styles.logo,
          animation: loading ? 'float 2s ease-in-out infinite' : 'none',
        }}
      />
      <h1 style={styles.title}>CreAIte Code ログイン</h1>

      <input
        type="text"
        placeholder="アクティベーションキーを入力"
        value={activationKey}
        onChange={(e) => setActivationKey(e.target.value)}
        style={styles.input}
      />

      <button onClick={handleLogin} style={styles.button} disabled={loading}>
        {loading ? '認証中...' : '認証'}
      </button>

      {error && <p style={styles.error}>{error}</p>}

      {/* ロゴふわふわアニメーション */}
      <style>
        {`
          @keyframes float {
            0% { transform: translatey(0px); }
            50% { transform: translatey(-10px); }
            100% { transform: translatey(0px); }
          }
        `}
      </style>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f7fa',
    padding: '20px',
  },
  logo: {
    width: '120px',
    marginBottom: '20px',
  },
  title: {
    marginBottom: '30px',
    color: '#333',
  },
  input: {
    width: '300px',
    padding: '12px',
    marginBottom: '20px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  button: {
    width: '300px',
    padding: '12px',
    backgroundColor: '#00aaff',
    color: 'white',
    fontSize: '16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  error: {
    marginTop: '15px',
    color: 'red',
  },
};

export default Login;
