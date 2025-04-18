// src/components/Login.jsx
import React, { useState } from 'react';
import axios from 'axios';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import logo from '../../assets/CreAIteCodeLogo.png';
import { Link } from 'react-router-dom';

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

const GlassForm = styled.form`
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

const Title = styled.h1`
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
`;

const ErrorText = styled.p`
  margin-top: 18px;
  color: #ff4d4f;
`;

const Login = ({ onLoginSuccess }) => {
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!activationKey) {
      setError('アクティベーションキーを入力してください');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await axios.post(
        'https://payments.codeups.jp/auth',
        { activeKey: activationKey }
      );
      if (res.status === 200) {
        onLoginSuccess();
      } else {
        setError('認証に失敗しました');
      }
    } catch {
      setError('認証に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      <GlassForm onSubmit={handleLogin}>
        <Logo
          src={logo}
          alt="Logo"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
        />
        <Title>CreAIte Code ログイン</Title>

        <Input
          type="text"
          placeholder="アクティベーションキーを入力"
          value={activationKey}
          onChange={e => setActivationKey(e.target.value)}
        />

        <Button type="submit" disabled={loading}>
          {loading ? '認証中...' : '認証'}
        </Button>
        <div style={{ marginTop: '20px' }}>
          <Link
            to="/setup"
            style={{
              color: 'rgb(225, 232, 240)',
              position: 'relative',
              textDecoration: 'none',
              transition: 'color 0.3s ease',
              padding: '4px 2px'
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
            初めてご利用の方はこちら
          </Link>
        </div>

        {error && <ErrorText>{error}</ErrorText>}
      </GlassForm>

    </Container>
  );
};

export default Login;
