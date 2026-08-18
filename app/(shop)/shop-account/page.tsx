'use client';

import React, { useEffect, useState } from 'react';
import {
  Card, Avatar, Upload, Button, Form, Input, Typography, Spin,
  Alert, message, Tag, Tooltip, Row, Col, Tabs, theme,
} from 'antd';
import {
  UserOutlined, CameraOutlined, ThunderboltOutlined, SaveOutlined,
  IdcardOutlined, LockOutlined, MailOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { api, apiCall } from '../../../lib/api';
import { env } from '../../../lib/env';
import { activeStorage, getStoredUserRaw } from '../../../lib/session';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Me {
  id: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  role: string;
  avatarUrl?: string;
  bio?: string;
  shopStaffRole?: 'owner' | 'cashier';
}

// Shop accounts are usually just `User` rows with role === 'shop' — the
// meaningful distinction for them is shopStaffRole, not the generic role
// label every other portal shows. The one exception: a tenant admin
// viewing their OWN in-house shop is logged in as themselves (role stays
// 'admin', see AdminService.impersonateShop), so this correctly falls
// through to their real role label instead.
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
};

const roleLabel = (me: Me): string => {
  if (me.role === 'shop') return me.shopStaffRole === 'owner' ? 'Shop Owner' : 'Shop Staff';
  return ROLE_LABELS[me.role] ?? me.role;
};

export default function ShopAccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarHover, setAvatarHover] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const { token } = theme.useToken();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const fetchMe = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/auth/me');
      const user: Me = result.data ?? result;
      setMe(user);
      form.setFieldsValue({ fullName: user.fullName, email: user.email, bio: user.bio });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load your profile');
      else setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirrors the admin/account page's sync — the shop layout's header shows
  // name/avatar from a localStorage snapshot read once at mount, so this
  // page has to update storage AND broadcast the same event for it to
  // reflect a saved change without a full reload.
  const syncUserToStorage = (user: Me) => {
    const stored = JSON.parse(getStoredUserRaw() || '{}');
    const merged = { ...stored, ...user };
    activeStorage().setItem('user', JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('healthplus:user-updated', { detail: merged }));
  };

  const handleAvatarUpload = async (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', options.file as File);
    try {
      const res = await api.post(`${env.API_URL}/api/auth/me/avatar`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const user: Me = res.data.data ?? res.data;
      setMe(user);
      syncUserToStorage(user);
      message.success('Photo updated');
      options.onSuccess?.(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Upload failed');
      else message.error('Upload failed');
      options.onError?.(err as Error);
    } finally {
      setUploading(false);
    }
  };

  const generateBio = async () => {
    setGeneratingBio(true);
    try {
      const current = form.getFieldsValue();
      const result = await apiCall('POST', '/api/auth/me/generate-bio', {
        fullName: current.fullName,
        roleLabel: me ? roleLabel(me) : undefined,
        bio: current.bio,
      });
      const { value } = result.data ?? result;
      form.setFieldValue('bio', value);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'AI generation failed');
      else message.error('AI generation failed');
    } finally {
      setGeneratingBio(false);
    }
  };

  const handleSave = async (values: { fullName?: string; email?: string; bio?: string }) => {
    setSaving(true);
    try {
      const result = await apiCall('PATCH', '/api/auth/me', values);
      const user: Me = result.data ?? result;
      setMe(user);
      syncUserToStorage(user);
      message.success('Profile updated');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Update failed');
      else message.error('Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (values: { currentPassword: string; newPassword: string }) => {
    setChangingPassword(true);
    try {
      await apiCall('POST', '/api/auth/me/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Password updated');
      passwordForm.resetFields();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update password');
      else message.error('Failed to update password');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <Title level={4} style={{ marginBottom: 16 }}>My Account</Title>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 18,
            paddingBottom: 20,
            marginBottom: 20,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div
            style={{ position: 'relative', flexShrink: 0 }}
            onMouseEnter={() => setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
          >
            <Avatar
              size={72}
              src={me?.avatarUrl}
              icon={<UserOutlined />}
              style={{ background: token.colorFillSecondary }}
            />
            <Upload
              accept=".jpg,.jpeg,.png,.webp"
              showUploadList={false}
              customRequest={(opts) => { void handleAvatarUpload(opts); }}
              disabled={uploading}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: avatarHover || uploading ? 1 : 0,
                  transition: 'opacity 0.15s',
                }}
                title="Change photo"
              >
                {uploading ? <Spin size="small" /> : <CameraOutlined style={{ color: '#fff', fontSize: 18 }} />}
              </div>
            </Upload>
          </div>
          <div style={{ minWidth: 0, maxWidth: '100%' }}>
            <Text strong style={{ fontSize: 16, display: 'block' }}>{me?.fullName || 'Unnamed'}</Text>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', wordBreak: 'break-word' }}>{me?.email || me?.phoneNumber}</Text>
            {me && <Tag style={{ marginTop: 6 }}>{roleLabel(me)}</Tag>}
          </div>
        </div>

        <Tabs
            tabPosition={isMobile ? 'top' : 'left'}
            defaultActiveKey="profile"
            style={{ minHeight: 380 }}
            items={[
              {
                key: 'profile',
                label: <span><IdcardOutlined /> Profile Details</span>,
                children: (
                  <Form form={form} layout="vertical" onFinish={handleSave} style={{ maxWidth: 560 }}>
                    <Row gutter={16}>
                      <Col xs={24} sm={24} md={12}>
                        <Form.Item label="Full Name" name="fullName" rules={[{ required: true, message: 'Name is required' }]}>
                          <Input placeholder="Your full name" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={24} md={12}>
                        <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
                          <Input prefix={<MailOutlined style={{ color: token.colorTextTertiary }} />} placeholder="you@example.com" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item
                      label={
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span>Bio</span>
                          <Tooltip title="Generate with AI">
                            <Button
                              type="text"
                              size="small"
                              icon={<ThunderboltOutlined />}
                              loading={generatingBio}
                              onClick={generateBio}
                              style={{ color: token.colorPrimary }}
                            >
                              AI
                            </Button>
                          </Tooltip>
                        </div>
                      }
                      name="bio"
                    >
                      <TextArea rows={4} placeholder="A couple of sentences about yourself and your role…" />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                      <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>
                        Save Changes
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'security',
                label: <span><LockOutlined /> Security</span>,
                children: (
                  <Form
                    form={passwordForm}
                    layout="vertical"
                    onFinish={handleChangePassword}
                    style={{ maxWidth: 400 }}
                  >
                    <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginBottom: 16 }}>
                      Choose a strong password you don&apos;t use anywhere else.
                    </Text>
                    <Form.Item
                      label="Current Password"
                      name="currentPassword"
                      rules={[{ required: true, message: 'Enter your current password' }]}
                    >
                      <Input.Password autoComplete="current-password" placeholder="••••••••" />
                    </Form.Item>
                    <Form.Item
                      label="New Password"
                      name="newPassword"
                      rules={[
                        { required: true, message: 'Enter a new password' },
                        { min: 8, message: 'Must be at least 8 characters' },
                      ]}
                      hasFeedback
                    >
                      <Input.Password autoComplete="new-password" placeholder="At least 8 characters" />
                    </Form.Item>
                    <Form.Item
                      label="Confirm New Password"
                      name="confirmPassword"
                      dependencies={['newPassword']}
                      hasFeedback
                      rules={[
                        { required: true, message: 'Confirm your new password' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                            return Promise.reject(new Error('Passwords do not match'));
                          },
                        }),
                      ]}
                    >
                      <Input.Password autoComplete="new-password" placeholder="Re-enter new password" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                      <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={changingPassword}>
                        Update Password
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
        />
      </Card>
    </div>
  );
}
