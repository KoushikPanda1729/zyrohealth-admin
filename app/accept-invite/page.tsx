'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Spin } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useThemeMode } from '../theme-context';

const { Text } = Typography;

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [checking, setChecking] = useState(true);
  const [invitee, setInvitee] = useState<{ fullName?: string; email?: string } | null>(null);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isDark, toggle: toggleTheme } = useThemeMode();

  useEffect(() => {
    if (!token) {
      setInvalidReason('This invite link is missing its token.');
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/verify-invite`, {
          params: { token },
        });
        setInvitee(res.data.data ?? res.data);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) setInvalidReason(err.response?.data?.error || 'This invite link is invalid or has expired.');
        else setInvalidReason('This invite link is invalid or has expired.');
      } finally {
        setChecking(false);
      }
    })();
  }, [token]);

  const onFinish = async (values: { newPassword: string }) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/accept-invite`, {
        token,
        newPassword: values.newPassword,
      });
      const { accessToken, refreshToken, user } = res.data.data;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      router.push(user.role === 'super_admin' ? '/platform/tenants' : '/dashboard');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.error || 'Failed to set your password.');
      else setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
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
        padding: '0 16px',
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
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 8px 32px rgba(22, 119, 255, 0.12)',
          borderRadius: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full.png" alt="ZyroHealth" style={{ height: 34, width: 'auto', display: 'block', margin: '0 auto 16px' }} />
          <Text type="secondary">
            {invitee?.fullName ? `Welcome, ${invitee.fullName} — set your password` : 'Set your password'}
          </Text>
        </div>

        {checking ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spin /></div>
        ) : invalidReason ? (
          <>
            <Alert message={invalidReason} type="error" showIcon style={{ marginBottom: 20 }} />
            <Button block onClick={() => router.push('/login')}>Back to login</Button>
          </>
        ) : (
          <Form name="accept-invite" layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
            {invitee?.email && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                {invitee.email}
              </Text>
            )}

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

            <Form.Item
              label="New Password"
              name="newPassword"
              rules={[
                { required: true, message: 'Please choose a password' },
                { min: 8, message: 'Must be at least 8 characters' },
              ]}
              hasFeedback
            >
              <Input.Password placeholder="At least 8 characters" autoComplete="new-password" />
            </Form.Item>

            <Form.Item
              label="Confirm Password"
              name="confirmPassword"
              dependencies={['newPassword']}
              hasFeedback
              rules={[
                { required: true, message: 'Please confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="Re-enter password" autoComplete="new-password" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                block
                style={{ height: 44, borderRadius: 8 }}
              >
                Set Password &amp; Sign In
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
