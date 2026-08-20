'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Space } from 'antd';
import {
  MoonOutlined, SunOutlined, ArrowRightOutlined, ShopOutlined, InboxOutlined,
  WhatsAppOutlined, RiseOutlined, ShoppingOutlined, ThunderboltOutlined, CheckCircleFilled,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useThemeMode } from '../theme-context';
import { PolicyLinksFooter } from '../components/PolicyLinksFooter';

const { Title, Text } = Typography;

const TRUST_BADGES = ['Live inventory sync', 'WhatsApp orders', 'Instant payouts'];

export default function ShopLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isDark, toggle: toggleTheme } = useThemeMode();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/admin/login`,
        { email: values.email, password: values.password },
        { headers: { 'X-Portal-Host': window.location.host } },
      );
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

  const panelBg = isDark ? '#0a0a0a' : '#ffffff';
  // Same mesh-gradient treatment as the main admin login, in the shop
  // portal's teal/green brand family instead of blue — keeps the two
  // portals visually related without looking identical.
  const brandBackground = [
    'radial-gradient(circle at 15% 15%, rgba(45,212,191,0.5) 0%, rgba(45,212,191,0) 45%)',
    'radial-gradient(circle at 85% 20%, rgba(74,222,128,0.4) 0%, rgba(74,222,128,0) 50%)',
    'radial-gradient(circle at 30% 90%, rgba(25,154,142,0.55) 0%, rgba(25,154,142,0) 55%)',
    'linear-gradient(160deg, #0b3d38 0%, #0f5c50 45%, #0a2e2a 100%)',
  ].join(', ');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: panelBg }}>
      {/* ── Left: brand panel — hidden on narrow screens via CSS below ── */}
      <div
        className="shop-login-brand-panel"
        style={{
          flex: '0 0 46%',
          maxWidth: 620,
          position: 'relative',
          background: brandBackground,
          color: '#fff',
          padding: '48px 48px 0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 85%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 85%)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', background: '#fff',
              borderRadius: 10, padding: '8px 14px', marginBottom: 40,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.png" alt="ZyroHealth" style={{ height: 24, width: 'auto', display: 'block' }} />
          </div>

          <Title level={1} style={{ color: '#fff', fontSize: 34, lineHeight: 1.25, marginBottom: 12 }}>
            Run your pharmacy counter to stockroom, all in one place.
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.6 }}>
            Orders, billing, and stock — synced live with every patient who finds you on ZyroHealth.
          </Text>

          <Space size={8} style={{ marginTop: 20, flexWrap: 'wrap' }}>
            {TRUST_BADGES.map((b) => (
              <span
                key={b}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                  color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '4px 12px',
                }}
              >
                <CheckCircleFilled style={{ fontSize: 11, color: '#4ade80' }} />
                {b}
              </span>
            ))}
          </Space>
        </div>

        {/* ── Floating product mockup ── */}
        <div style={{ position: 'relative', zIndex: 1, flex: 1, marginTop: 32 }}>
          <div
            className="shop-login-float-slow"
            style={{
              position: 'absolute', bottom: 46, left: 0, right: 24,
              background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.18)', borderRadius: 18,
              padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              transform: 'rotate(-2deg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Today&apos;s Counter</Text>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4ade80' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                Live
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              {[
                { icon: <RiseOutlined />, label: 'Revenue', value: '₹32.1K' },
                { icon: <ShoppingOutlined />, label: 'Orders', value: '18' },
                { icon: <InboxOutlined />, label: 'Low stock', value: '5' },
              ].map((s) => (
                <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 6 }}>{s.icon}</div>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 700, display: 'block', lineHeight: 1.1 }}>{s.value}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{s.label}</Text>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 44 }}>
              {[45, 60, 35, 75, 50, 85, 58].map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1, height: `${h}%`, borderRadius: 4,
                    background: i === 5 ? '#4ade80' : 'rgba(255,255,255,0.28)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Floating decorative badges around the mockup card */}
          <div
            className="shop-login-float-fast"
            style={{
              position: 'absolute', top: 8, right: 8, width: 52, height: 52, borderRadius: 14,
              background: 'rgba(37,211,102,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 28px rgba(0,0,0,0.3)', transform: 'rotate(8deg)',
            }}
          >
            <WhatsAppOutlined style={{ fontSize: 22, color: '#fff' }} />
          </div>
          <div
            className="shop-login-float-medium"
            style={{
              position: 'absolute', top: 70, right: 60, width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-6deg)',
            }}
          >
            <ShopOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div
            className="shop-login-float-fast2"
            style={{
              position: 'absolute', bottom: 210, right: 4, width: 40, height: 40, borderRadius: 10,
              background: 'rgba(245,158,11,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 24px rgba(0,0,0,0.3)',
            }}
          >
            <ThunderboltOutlined style={{ fontSize: 16, color: '#fff' }} />
          </div>
        </div>
      </div>

      {/* ── Right: login form ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 24 }}>
        <Button
          type="text"
          shape="circle"
          icon={isDark ? <MoonOutlined /> : <SunOutlined />}
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ position: 'absolute', top: 24, right: 24 }}
        />

        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Compact brand mark shown only when the left panel is hidden (narrow screens) */}
          <div
            className="shop-login-mobile-brand"
            style={{
              display: 'none', alignItems: 'center', marginBottom: 40,
              background: '#fff', borderRadius: 10, padding: '8px 14px', alignSelf: 'flex-start',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.png" alt="ZyroHealth" style={{ height: 22, width: 'auto', display: 'block' }} />
          </div>

          <Title level={2} style={{ marginBottom: 6 }}>Medicine Shop Portal</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 32 }}>
            Sign in to manage your pharmacy on ZyroHealth
          </Text>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 20 }}
            />
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
              <Input placeholder="shop@example.com" autoComplete="email" style={{ borderRadius: 8 }} />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password placeholder="••••••••" autoComplete="current-password" style={{ borderRadius: 8 }} />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                icon={!loading && <ArrowRightOutlined />}
                iconPosition="end"
                style={{ height: 44, borderRadius: 8, fontWeight: 500, background: '#199A8E', borderColor: '#199A8E' }}
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <PolicyLinksFooter />
        </div>
      </div>

      <style>{`
        @keyframes shopLoginFloatSlow { 0%, 100% { transform: rotate(-2deg) translateY(0); } 50% { transform: rotate(-2deg) translateY(-10px); } }
        @keyframes shopLoginFloatMedium { 0%, 100% { transform: rotate(-6deg) translateY(0); } 50% { transform: rotate(-6deg) translateY(-8px); } }
        @keyframes shopLoginFloatFast { 0%, 100% { transform: rotate(8deg) translateY(0); } 50% { transform: rotate(8deg) translateY(-14px); } }
        @keyframes shopLoginFloatFast2 { 0%, 100% { transform: rotate(-8deg) translateY(0); } 50% { transform: rotate(-8deg) translateY(-12px); } }
        .shop-login-float-slow { animation: shopLoginFloatSlow 6s ease-in-out infinite; }
        .shop-login-float-medium { animation: shopLoginFloatMedium 5s ease-in-out infinite; }
        .shop-login-float-fast { animation: shopLoginFloatFast 4s ease-in-out infinite; }
        .shop-login-float-fast2 { animation: shopLoginFloatFast2 4.5s ease-in-out infinite; }
        @media (max-width: 900px) {
          .shop-login-brand-panel { display: none !important; }
          .shop-login-mobile-brand { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
