'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useThemeMode } from '../theme-context';

const { Title, Text } = Typography;

export default function ShopLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isDark, toggle: toggleTheme } = useThemeMode();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/admin/login`, {
        email: values.email,
        password: values.password,
      });
      const { accessToken, refreshToken, user } = res.data.data;
      if (user.role !== 'shop') {
        setError('This login is for medicine shop accounts only.');
        return;
      }
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      router.push('/shop-dashboard');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: isDark
          ? 'linear-gradient(135deg, #141414 0%, #1f1f1f 100%)'
          : 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
      }}
    >
      <Button
        type="text"
        shape="circle"
        icon={isDark ? <MoonOutlined /> : <SunOutlined />}
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{ position: 'absolute', top: 20, right: 20 }}
      />
      <Card style={{ width: 420, boxShadow: '0 8px 32px rgba(22, 119, 255, 0.12)', borderRadius: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56, height: 56, background: '#1677ff', borderRadius: 14,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>F</Text>
          </div>
          <Title level={2} style={{ marginBottom: 4, color: '#1677ff' }}>HealthPlus</Title>
          <Text type="secondary">Medicine Shop Portal — Sign In</Text>
        </div>

        {error && (
          <Alert message={error} type="error" showIcon closable onClose={() => setError(null)} style={{ marginBottom: 20 }} />
        )}

        <Form name="shop-login" layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="shop@example.com" autoComplete="email" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password placeholder="••••••••" autoComplete="current-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, borderRadius: 8 }}>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
