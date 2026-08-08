'use client';

import React, { Suspense, useState } from 'react';
import { Form, Input, Button, Typography, Alert, Spin, Space } from 'antd';
import {
  MoonOutlined, SunOutlined, ArrowRightOutlined, MessageOutlined, MedicineBoxOutlined,
  HeartOutlined, RiseOutlined, CalendarOutlined, ShoppingOutlined, CheckCircleFilled,
} from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useThemeMode } from '../theme-context';

const { Title, Text } = Typography;

const TRUST_BADGES = ['Multi-tenant', 'WhatsApp-native', 'Role-based access'];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitRedirect = searchParams.get('redirect');
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
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      // An explicit redirect (e.g. from a session-expiry bounce) is always
      // honored; otherwise land super_admin on tenant management and
      // everyone else on the regular dashboard.
      const validExplicitRedirect =
        explicitRedirect && !explicitRedirect.startsWith('/login')
          ? explicitRedirect
          : null;
      router.push(
        validExplicitRedirect ??
          (user.role === 'super_admin' ? '/platform/tenants' : '/dashboard'),
      );
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
  // A layered "mesh gradient" — several soft, offset radial glows on a
  // deep-blue base, plus a faint dot-grid — reads as a designed surface
  // rather than a flat two-stop gradient.
  const brandBackground = [
    'radial-gradient(circle at 15% 15%, rgba(56,189,248,0.55) 0%, rgba(56,189,248,0) 45%)',
    'radial-gradient(circle at 85% 20%, rgba(129,140,248,0.45) 0%, rgba(129,140,248,0) 50%)',
    'radial-gradient(circle at 30% 90%, rgba(59,130,246,0.5) 0%, rgba(59,130,246,0) 55%)',
    'linear-gradient(160deg, #0a2a6e 0%, #0d3f8f 45%, #06336b 100%)',
  ].join(', ');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: panelBg }}>
      {/* ── Left: brand panel — hidden on narrow screens via CSS below ── */}
      <div
        className="login-brand-panel"
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
        {/* Faint dot-grid texture for surface depth */}
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
            One platform for every clinic and pharmacy you run.
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.6 }}>
            Bookings, prescriptions, billing, and inventory — synced live across every tenant.
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

        {/* ── Floating product mockup — a stylized "live dashboard" card,
            since this is a local dev tool with no marketing photography
            to hotlink; a real illustration would live here in production. */}
        <div style={{ position: 'relative', zIndex: 1, flex: 1, marginTop: 32 }}>
          <div
            className="login-float-slow"
            style={{
              position: 'absolute', bottom: 46, left: 0, right: 24,
              background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.18)', borderRadius: 18,
              padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              transform: 'rotate(-2deg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Today&apos;s Overview</Text>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4ade80' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                Live
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              {[
                { icon: <RiseOutlined />, label: 'Revenue', value: '₹85.4K' },
                { icon: <CalendarOutlined />, label: 'Bookings', value: '24' },
                { icon: <ShoppingOutlined />, label: 'Orders', value: '12' },
              ].map((s) => (
                <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 6 }}>{s.icon}</div>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 700, display: 'block', lineHeight: 1.1 }}>{s.value}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{s.label}</Text>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 44 }}>
              {[38, 55, 30, 70, 48, 90, 62].map((h, i) => (
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
            className="login-float-fast"
            style={{
              position: 'absolute', top: 8, right: 8, width: 52, height: 52, borderRadius: 14,
              background: 'rgba(37,211,102,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 28px rgba(0,0,0,0.3)', transform: 'rotate(8deg)',
            }}
          >
            <MessageOutlined style={{ fontSize: 22, color: '#fff' }} />
          </div>
          <div
            className="login-float-medium"
            style={{
              position: 'absolute', top: 70, right: 60, width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-6deg)',
            }}
          >
            <MedicineBoxOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div
            className="login-float-fast2"
            style={{
              position: 'absolute', bottom: 210, right: 4, width: 40, height: 40, borderRadius: 10,
              background: 'rgba(244,63,94,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 24px rgba(0,0,0,0.3)',
            }}
          >
            <HeartOutlined style={{ fontSize: 16, color: '#fff' }} />
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
            className="login-mobile-brand"
            style={{
              display: 'none', alignItems: 'center', marginBottom: 40,
              background: '#fff', borderRadius: 10, padding: '8px 14px', alignSelf: 'flex-start',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.png" alt="ZyroHealth" style={{ height: 22, width: 'auto', display: 'block' }} />
          </div>

          <Title level={2} style={{ marginBottom: 6 }}>Welcome back</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 32 }}>
            Sign in to your admin panel to continue
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

          <Form
            name="login"
            layout="vertical"
            onFinish={onFinish}
            size="large"
            requiredMark={false}
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' },
              ]}
            >
              <Input placeholder="admin@fullhealth.com" autoComplete="email" style={{ borderRadius: 8 }} />
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
                style={{ height: 44, borderRadius: 8, fontWeight: 500 }}
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>

      <style>{`
        @keyframes loginFloatSlow { 0%, 100% { transform: rotate(-2deg) translateY(0); } 50% { transform: rotate(-2deg) translateY(-10px); } }
        @keyframes loginFloatMedium { 0%, 100% { transform: rotate(-6deg) translateY(0); } 50% { transform: rotate(-6deg) translateY(-8px); } }
        @keyframes loginFloatFast { 0%, 100% { transform: rotate(8deg) translateY(0); } 50% { transform: rotate(8deg) translateY(-14px); } }
        @keyframes loginFloatFast2 { 0%, 100% { transform: rotate(-8deg) translateY(0); } 50% { transform: rotate(-8deg) translateY(-12px); } }
        .login-float-slow { animation: loginFloatSlow 6s ease-in-out infinite; }
        .login-float-medium { animation: loginFloatMedium 5s ease-in-out infinite; }
        .login-float-fast { animation: loginFloatFast 4s ease-in-out infinite; }
        .login-float-fast2 { animation: loginFloatFast2 4.5s ease-in-out infinite; }
        @media (max-width: 900px) {
          .login-brand-panel { display: none !important; }
          .login-mobile-brand { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
