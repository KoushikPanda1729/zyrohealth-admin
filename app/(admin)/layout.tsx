'use client';

import React, { useEffect, useState } from 'react';
import { Layout, Menu, Button, Typography, theme, App, Select, message, Avatar, Dropdown, Modal } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  MedicineBoxOutlined,
  CalendarOutlined,
  FileTextOutlined,
  DollarOutlined,
  RobotOutlined,
  TeamOutlined,
  LogoutOutlined,
  PhoneOutlined,
  CarOutlined,
  WhatsAppOutlined,
  ApartmentOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  ClusterOutlined,
  ScanOutlined,
  ShopOutlined,
  MoonOutlined,
  SunOutlined,
  IdcardOutlined,
  WalletOutlined,
  DownOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import axios from 'axios';
import { apiCall } from '../../lib/api';
import { env } from '../../lib/env';
import { useThemeMode } from '../theme-context';
import StudioAssistant from './studio-assistant';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

// Each tenant-scoped nav item's required permission key — items are
// hidden client-side if the logged-in admin's role doesn't grant it
// (the real enforcement is server-side; this is just UX). Grouped under a
// section label purely for sidebar readability.
const TENANT_MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard', permission: null, section: 'Overview' },
  { key: '/doctors', icon: <MedicineBoxOutlined />, label: 'Doctors', permission: 'doctors.view', section: 'Clinical' },
  { key: '/bookings', icon: <CalendarOutlined />, label: 'Bookings', permission: 'bookings.view', section: 'Clinical' },
  { key: '/prescriptions', icon: <FileTextOutlined />, label: 'Prescriptions', permission: 'prescriptions.view', section: 'Clinical' },
  { key: '/medicine-orders', icon: <CarOutlined />, label: 'Medicine Orders', permission: 'medicine_orders.view', section: 'Clinical' },
  { key: '/prescription-requests', icon: <ScanOutlined />, label: 'Prescription Requests', permission: 'medicine_shops.view', section: 'Clinical' },
  { key: '/medicine-shops', icon: <ShopOutlined />, label: 'Medicine Shops', permission: 'medicine_shops.view', section: 'Clinical' },
  { key: '/whatsapp', icon: <WhatsAppOutlined />, label: 'WhatsApp', permission: 'whatsapp.view', section: 'Automation' },
  { key: '/ai-sessions', icon: <RobotOutlined />, label: 'AI Sessions', permission: 'analytics.view', section: 'Automation' },
  { key: '/ai-doctors', icon: <TeamOutlined />, label: 'AI Doctors', permission: 'ai_doctors.view', section: 'Automation' },
  { key: '/voice-agents', icon: <PhoneOutlined />, label: 'Voice Agents', permission: 'voice_agent.view', section: 'Automation' },
  { key: '/payments', icon: <DollarOutlined />, label: 'Payments', permission: 'payments.view', section: 'Finance' },
  { key: '/users', icon: <UserOutlined />, label: 'Users', permission: 'users.view', section: 'Administration' },
  { key: '/roles', icon: <SafetyCertificateOutlined />, label: 'Roles & Permissions', permission: 'roles.manage', section: 'Administration' },
  { key: '/departments', icon: <ClusterOutlined />, label: 'Departments', permission: 'users.manage', section: 'Administration' },
] as const;

const SUPER_ADMIN_MENU_ITEMS = [
  { key: '/platform/tenants', icon: <ApartmentOutlined />, label: 'Home', superAdminOnly: false },
  { key: '/platform/admins', icon: <TeamOutlined />, label: 'Tenant Admin', superAdminOnly: false },
  { key: '/platform/medicine-shops', icon: <ShopOutlined />, label: 'Medicine Shops', superAdminOnly: false },
  { key: '/platform/shop-payouts', icon: <WalletOutlined />, label: 'Shop Payouts', superAdminOnly: false },
  // Managing who else gets platform-level access is itself a sensitive
  // action — never shown to a platform_support viewer, only super_admin.
  { key: '/platform/team', icon: <SafetyCertificateOutlined />, label: 'Platform Team', superAdminOnly: true },
];

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/doctors': 'Doctors Management',
  '/users': 'Users Management',
  '/bookings': 'Bookings',
  '/prescriptions': 'Prescriptions',
  '/medicine-orders': 'Medicine Orders',
  '/prescription-requests': 'Prescription Requests',
  '/medicine-shops': 'Medicine Shops',
  '/whatsapp': 'WhatsApp',
  '/payments': 'Payments',
  '/ai-sessions': 'AI Sessions',
  '/ai-doctors': 'AI Doctors',
  '/voice-agents': 'Voice Agents',
  '/roles': 'Roles & Permissions',
  '/departments': 'Departments',
  '/account': 'My Account',
  '/platform/tenants': 'Tenant Management',
  '/platform/admins': 'Tenant Admin',
  '/platform/medicine-shops': 'Medicine Shops',
  '/platform/shop-payouts': 'Shop Payouts',
  '/platform/team': 'Platform Team',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [userInfo, setUserInfo] = useState<{ fullName?: string; email?: string; avatarUrl?: string }>({});
  const [impersonatingTenant, setImpersonatingTenant] = useState<string | null>(null);
  const [impersonatingTenantId, setImpersonatingTenantId] = useState<string | null>(null);
  const [platformTenants, setPlatformTenants] = useState<{ id: string; name: string }[]>([]);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const { token } = theme.useToken();
  const { isDark, toggle: toggleTheme } = useThemeMode();

  useEffect(() => {
    (async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      const storedUser = JSON.parse(localStorage.getItem('user') || '{}') as {
        role?: string;
        fullName?: string;
        email?: string;
        avatarUrl?: string;
      };
      const currentRole = storedUser.role ?? null;
      // Shop accounts have their own dedicated portal (app/(shop)/) — this
      // permission-driven shell has no menu items for them (shops bypass
      // the permission catalog entirely, see attachRole.middleware.ts), so
      // landing here shows a near-blank "Dashboard" and nothing else.
      if (currentRole === 'shop') {
        router.push('/shop-dashboard');
        return;
      }
      setRole(currentRole);
      setUserInfo({ fullName: storedUser.fullName, email: storedUser.email, avatarUrl: storedUser.avatarUrl });
      setImpersonatingTenant(localStorage.getItem('impersonatingTenantName'));
      setImpersonatingTenantId(localStorage.getItem('impersonatingTenantId'));
      try {
        setPlatformTenants(JSON.parse(localStorage.getItem('platformTenants') || '[]'));
      } catch {
        setPlatformTenants([]);
      }

      if (currentRole === 'super_admin' || currentRole === 'platform_support') {
        // Platform-level roles have no tenant to fetch permissions for —
        // /api/admin/me/permissions is meaningless to them.
        if (!pathname.startsWith('/platform')) {
          router.push('/platform/tenants');
          return;
        }
      } else {
        if (pathname.startsWith('/platform')) {
          router.push('/dashboard');
          return;
        }
        try {
          const result = await apiCall('GET', '/api/admin/me/permissions');
          setPermissions((result.data ?? result).permissions ?? []);
        } catch {
          setPermissions([]);
        }
      }

      // The avatarUrl cached in localStorage is a signed S3 URL that
      // expires after an hour — reusing that stale snapshot forever is why
      // the header photo silently breaks (renders a blank circle) well
      // into a session. Re-fetch it fresh on every mount, the same way the
      // Account page does on its own load, instead of trusting the cache.
      try {
        const result = await apiCall('GET', '/api/auth/me');
        const fresh = (result.data ?? result) as {
          fullName?: string;
          email?: string;
          avatarUrl?: string;
        };
        setUserInfo({ fullName: fresh.fullName, email: fresh.email, avatarUrl: fresh.avatarUrl });
        localStorage.setItem('user', JSON.stringify({ ...storedUser, ...fresh }));
      } catch {
        /* keep the localStorage snapshot already set above */
      }

      setMounted(true);
    })();
  }, [router, pathname]);

  // The account page updates localStorage['user'] (name/email/avatar) after
  // a save or photo upload, but this layout only reads it once at mount —
  // without this listener the header/sidebar would show stale info until a
  // full page reload. See syncUserToStorage in app/(admin)/account/page.tsx.
  useEffect(() => {
    const handleUserUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        fullName?: string;
        email?: string;
        avatarUrl?: string;
      };
      setUserInfo((prev) => ({ ...prev, ...detail }));
    };
    window.addEventListener('healthplus:user-updated', handleUserUpdated);
    return () => window.removeEventListener('healthplus:user-updated', handleUserUpdated);
  }, []);

  const doLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch { /* ignore */ }
    }
    localStorage.clear();
    router.push('/login');
  };

  const handleLogout = () => {
    Modal.confirm({
      title: 'Log out?',
      content: "You'll need to sign in again to access the admin panel.",
      okText: 'Logout',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: doLogout,
    });
  };

  const handleSwitchBack = () => {
    const platformToken = localStorage.getItem('platformToken');
    const platformRefreshToken = localStorage.getItem('platformRefreshToken');
    const platformUser = localStorage.getItem('platformUser');
    if (platformToken) localStorage.setItem('token', platformToken);
    if (platformRefreshToken) localStorage.setItem('refreshToken', platformRefreshToken);
    if (platformUser) localStorage.setItem('user', platformUser);
    localStorage.removeItem('platformToken');
    localStorage.removeItem('platformRefreshToken');
    localStorage.removeItem('platformUser');
    localStorage.removeItem('impersonatingTenantName');
    localStorage.removeItem('impersonatingTenantId');
    localStorage.removeItem('platformTenants');
    router.push('/platform/tenants');
  };

  // Jump directly to another tenant without returning to /platform/tenants
  // first — reuses the stashed super admin token (the active session right
  // now is the impersonated tenant admin's, not the super admin's).
  const handleQuickSwitch = async (newTenantId: string) => {
    const platformToken = localStorage.getItem('platformToken');
    if (!platformToken) return;
    const tenant = platformTenants.find((t) => t.id === newTenantId);
    setSwitchingTenant(true);
    try {
      const res = await axios.post(
        `${env.API_URL}/api/platform/tenants/${newTenantId}/impersonate`,
        {},
        { headers: { Authorization: `Bearer ${platformToken}` } },
      );
      const { user, accessToken, refreshToken } = res.data.data;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('impersonatingTenantId', newTenantId);
      if (tenant) localStorage.setItem('impersonatingTenantName', tenant.name);
      // A hard reload, not router.push — if we're already on /dashboard (or
      // any other admin page), pushing the same route is a no-op and
      // nothing re-fetches for the new tenant. This guarantees every page
      // (this layout included) re-reads the swapped session from scratch.
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to switch tenant');
      else message.error('An unexpected error occurred');
      setSwitchingTenant(false);
    }
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    router.push(key);
  };

  const currentTitle = pageTitles[pathname] || 'ZyroHealth Admin';

  // Tenant nav is grouped into labeled sections for readability; super
  // admin's short 2-item nav stays flat.
  const menuItems: MenuProps['items'] =
    role === 'super_admin' || role === 'platform_support'
      ? SUPER_ADMIN_MENU_ITEMS.filter((item) => !item.superAdminOnly || role === 'super_admin')
      : (() => {
          const visible = TENANT_MENU_ITEMS.filter(
            (item) => !item.permission || permissions.includes(item.permission),
          );
          const sections: string[] = [];
          for (const item of visible) {
            if (!sections.includes(item.section)) sections.push(item.section);
          }
          return sections.map((section) => ({
            key: `section-${section}`,
            type: 'group' as const,
            label: section,
            children: visible
              .filter((item) => item.section === section)
              .map(({ key, icon, label }) => ({ key, icon, label })),
          }));
        })();

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'account-header',
      label: (
        <div style={{ padding: '2px 4px', minWidth: 180 }}>
          <Text strong style={{ display: 'block', fontSize: 13 }}>{userInfo.fullName || 'My Account'}</Text>
          {userInfo.email && <Text type="secondary" style={{ fontSize: 12 }}>{userInfo.email}</Text>}
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    { key: '/account', icon: <IdcardOutlined />, label: 'My Account' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') handleLogout();
    else if (key === '/account') router.push('/account');
  };

  if (!mounted) return null;

  return (
    <App>
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
        trigger={null}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Logo */}
          <div
            style={{
              height: 64,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              paddingLeft: collapsed ? 0 : 20,
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {collapsed ? (
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: '#fff',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: 4,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icon.png" alt="ZyroHealth" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ) : (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-full.png" alt="ZyroHealth" style={{ height: 18, width: 'auto', display: 'block' }} />
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[pathname]}
              items={menuItems}
              onClick={handleMenuClick}
              style={{ marginTop: 8, border: 'none' }}
            />
          </div>

          {/* Pinned logout footer — always visible without opening a menu,
              separate from the header's account dropdown. Identity (name)
              lives in the header dropdown, not duplicated here. */}
          <div
            style={{
              flexShrink: 0,
              borderTop: '1px solid rgba(255,255,255,0.1)',
              padding: collapsed ? '8px' : '8px 12px',
            }}
          >
            <Button
              type="text"
              danger
              block={!collapsed}
              shape={collapsed ? 'circle' : 'default'}
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              title="Logout"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                margin: collapsed ? '0 auto' : undefined,
              }}
            >
              {!collapsed && 'Logout'}
            </Button>
          </div>
        </div>
      </Sider>

      {/* Edge-attached collapse toggle, straddling the sidebar/content
          boundary — replaces the old hamburger button inside the header. */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          position: 'fixed',
          top: 72,
          left: collapsed ? 80 - 12 : 220 - 12,
          zIndex: 101,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }}
      >
        {collapsed ? <RightOutlined style={{ fontSize: 10 }} /> : <LeftOutlined style={{ fontSize: 10 }} />}
      </div>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        {impersonatingTenant && (
          <div
            style={{
              background: token.colorWarningBg,
              borderBottom: `1px solid ${token.colorWarningBorder}`,
              padding: '8px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              zIndex: 100,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 13, color: token.colorWarningText }}>
                Viewing as <Text strong style={{ color: token.colorWarningText }}>{impersonatingTenant}</Text>&apos;s admin (super admin session)
              </Text>
              {platformTenants.length > 1 && (
                <Select
                  size="small"
                  style={{ width: 180 }}
                  value={impersonatingTenantId ?? undefined}
                  loading={switchingTenant}
                  disabled={switchingTenant}
                  onChange={handleQuickSwitch}
                  options={platformTenants.map((t) => ({ value: t.id, label: t.name }))}
                />
              )}
            </div>
            <Button size="small" icon={<SwapOutlined />} onClick={handleSwitchBack}>
              Switch back to Platform
            </Button>
          </div>
        )}
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: 600 }}>{currentTitle}</Text>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button
              type="text"
              shape="circle"
              icon={isDark ? <MoonOutlined /> : <SunOutlined />}
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            />
            <div style={{ width: 1, height: 24, background: token.colorBorderSecondary, margin: '0 8px' }} />
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              trigger={['click']}
              placement="bottomRight"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 8,
                }}
              >
                <Avatar size={30} src={userInfo.avatarUrl} icon={<UserOutlined />} />
                <Text style={{ fontSize: 13, maxWidth: 120 }} ellipsis>
                  {userInfo.fullName || 'Account'}
                </Text>
                <DownOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content
          style={{
            padding: 24,
            background: token.colorBgLayout,
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          {children}
        </Content>
      </Layout>
      {role !== 'super_admin' && <StudioAssistant />}
    </Layout>
    </App>
  );
}
