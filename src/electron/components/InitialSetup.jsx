import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import logo from '../../assets/CreAIteCodeLogo.png';

// アニメーションの定義
const float = keyframes`
  0%,100% { transform: translateY(0) scale(1); }
  50%     { transform: translateY(-15px) scale(1.03); }
`;

const blob = keyframes`
  0%,100% {
    border-radius: 42% 58% 58% 42% / 42% 42% 58% 58%;
  }
  50% {
    border-radius: 58% 42% 42% 58% / 58% 58% 42% 42%;
  }
`;

// スタイルコンポーネント
const Container = styled(motion.div)`
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(
    135deg,
    #0b1a2f 0%,
    #102542 60%,
    #13293b 100%
  );
  overflow: hidden;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 300px;
    height: 300px;
    background: rgba(47, 79, 112, 0.2);
    filter: blur(80px);
    animation: ${blob} 7s ease-in-out infinite;
  }
  &::before { top: -60px; left: -60px; }
  &::after  { bottom: -60px; right: -60px; animation-delay: 3.5s; }
`;

const GlassForm = styled.div`
  position: relative;
  z-index: 1;
  width: 420px;
  padding: 48px;
  background: rgba(20, 30, 45, 0.5);
  border-radius: 14px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(14px);
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const Logo = styled(motion.img)`
  width: 110px;
  margin-bottom: 28px;
  animation: ${float} 3.5s ease-in-out infinite;
`;

const Title = styled.h2`
  margin-bottom: 36px;
  font-size: 2rem;
  color: #e1e8f0;
  text-shadow: 0 2px 6px rgba(0,0,0,0.8);
`;

const Input = styled.input`
  width: 100%;
  padding: 14px;
  margin-bottom: 22px;
  font-size: 1rem;
  color: #f0f4f8;
  background: rgba(255,255,255,0.05);
  border: 2px solid transparent;
  border-radius: 10px;
  transition: border-color 0.3s, background 0.3s;
  &::placeholder { color: rgba(255,255,255,0.5); }
  &:focus {
    outline: none;
    border-color: #3a8fb7;
    background: rgba(255,255,255,0.12);
  }
`;

const Button = styled.button`
  width: 100%;
  padding: 14px;
  font-size: 1rem;
  font-weight: bold;
  color: #f0f4f8;
  background: linear-gradient(90deg, #3a8fb7, #1f5673);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(47, 79, 112, 0.5);
  transition: transform 0.2s, box-shadow 0.2s;
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 28px rgba(47, 79, 112, 0.7);
  }
  &:active {
    transform: translateY(0);
    box-shadow: 0 6px 20px rgba(47, 79, 112, 0.5);
  }
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorText = styled.p`
  margin-top: 18px;
  color: #ff4d4f;
`;

const SuccessText = styled.p`
  margin-top: 18px;
  margin-bottom: 24px;
  color: #52c41a;
  font-size: 1.1rem;
`;

const FormGroup = styled.div`
  width: 100%;
  margin-bottom: 20px;
  text-align: left;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  color: #e1e8f0;
  font-size: 0.9rem;
`;

const InitialSetup = () => {
  const [email, setEmail] = useState('');
  const [acid, setAcid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Electronの環境かどうかを検出
  const isElectronEnv = typeof window !== 'undefined' &&
    (window.api || window.electron ||
      navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

  console.log('Current path:', location.pathname);
  console.log('Is Electron environment:', isElectronEnv);

  // 安全なナビゲーション関数
  const safeNavigate = (path) => {
    console.log(`Navigating to: ${path}`);

    try {
      // Electronの場合は特別な処理
      if (isElectronEnv) {
        // まず通常のReact Routerナビゲーション
        navigate(path);

        // Electron APIが利用可能ならそれも使用
        if (window.api && typeof window.api.navigateTo === 'function') {
          console.log('Using Electron API for navigation');
          setTimeout(() => window.api.navigateTo(path), 100);
        }
      } else {
        // 通常のブラウザ環境
        navigate(path);
      }
    } catch (err) {
      console.error('Navigation error:', err);
      // フォールバック
      window.location.href = path;
    }
  };

  const handleRegister = async () => {
    if (!email || !acid) {
      setError('メールアドレスと初回ログイン番号を入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://payments.codeups.jp/register-email', {
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
    <Container
      initial={{ opacity: 0.5 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      <GlassForm>
        <Logo
          src={logo}
          alt="Logo"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
        />
        <Title>初回設定</Title>

        {success ? (
          <>
            <SuccessText>メールアドレスに送信しました！</SuccessText>
            <Button onClick={() => safeNavigate('/')}>
              ログイン画面へ戻る
            </Button>
          </>
        ) : (
          <>
            <FormGroup>
              <Label>メールアドレス</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="例）sample@example.com"
              />
            </FormGroup>

            <FormGroup>
              <Label>初回ログイン番号</Label>
              <Input
                type="text"
                value={acid}
                onChange={(e) => setAcid(e.target.value)}
                placeholder="例）1002933222"
              />
            </FormGroup>

            <Button onClick={handleRegister} disabled={loading}>
              {loading ? '認証中...' : 'アクティベーションキーを受け取る'}
            </Button>

            <p style={{
              fontSize: '0.8rem',
              color: 'rgba(225, 232, 240, 0.6)',
              margin: '12px 0 20px',
              textAlign: 'center'
            }}>
              認証完了後にメールアドレス宛にアクティベーションキーを送付します
            </p>

            <div style={{ marginTop: '20px' }}>
              <span
                onClick={() => safeNavigate('/')}
                style={{
                  color: 'rgb(225, 232, 240)',
                  position: 'relative',
                  textDecoration: 'none',
                  transition: 'color 0.3s ease, text-shadow 0.3s ease',
                  padding: '4px 2px',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'white';
                  e.currentTarget.style.textShadow = '0 0 8px rgba(255, 255, 255, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgb(225, 232, 240)';
                  e.currentTarget.style.textShadow = 'none';
                }}
              >
                ログイン画面へ戻る
              </span>
            </div>

            {error && <ErrorText>{error}</ErrorText>}
          </>
        )}
      </GlassForm>
    </Container>
  );
};

export default InitialSetup;
