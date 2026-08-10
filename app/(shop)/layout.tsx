'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { Layout, Menu, Button, Typography, theme, App, Modal, Spin } from 'antd';
import type { MenuProps } from 'antd';
import {
  LogoutOutlined, MoonOutlined, SunOutlined, ShopOutlined, DashboardOutlined,
  ScanOutlined, MedicineBoxOutlined, ApartmentOutlined, ShoppingCartOutlined, FileTextOutlined, TeamOutlined,
  WhatsAppOutlined, CarOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { apiCall } from '../../lib/api';
import { getStoredToken, getStoredUserRaw, clearStoredSession, hasSessionStorageSession } from '../../lib/session';
import { useThemeMode } from '../theme-context';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

// Purchase Orders is owner-only — restocking decisions are the owner's
// call. Staff is NOT owner-only anymore: it's every shop user's own
// self-service hub too (check in/out, request leave, see your own
// payslips) — the page itself hides the owner-only tabs (Roles, staff
// administration) from non-owners, see app/(shop)/staff/page.tsx.
const MENU_ITEMS = [
  { key: '/shop-dashboard', icon: <DashboardOutlined />, label: 'Dashboard', ownerOnly: false },
  { key: '/requests', icon: <ScanOutlined />, label: 'Prescription Requests', ownerOnly: false },
  { key: '/orders', icon: <CarOutlined />, label: 'Orders', ownerOnly: false },
  { key: '/catalog', icon: <MedicineBoxOutlined />, label: 'Medicine List', ownerOnly: false },
  { key: '/purchase-orders', icon: <ShoppingCartOutlined />, label: 'Purchase Orders', ownerOnly: true },
  { key: '/billing', icon: <FileTextOutlined />, label: 'Billing', ownerOnly: false },
  { key: '/staff', icon: <TeamOutlined />, label: 'Staff', ownerOnly: false },
  { key: '/shop-whatsapp', icon: <WhatsAppOutlined />, label: 'WhatsApp', ownerOnly: false },
];

function ShopLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [shopName, setShopName] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  const { token } = theme.useToken();
  const { isDark, toggle: toggleTheme } = useThemeMode();

  useEffect(() => {
    // Quick-view bootstrap — a tenant admin's "Open Full View" opens a
    // brand new tab carrying a one-time session in these query params.
    // Stash it in THIS tab's sessionStorage (never localStorage, which is
    // shared across every tab of the origin) and strip the URL immediately
    // so the tokens don't linger in the address bar/history.
    const qvToken = searchParams.get('qvt');
    const qvRefresh = searchParams.get('qvr');
    const qvUser = searchParams.get('qvu');
    if (qvToken && qvRefresh && qvUser) {
      sessionStorage.setItem('token', qvToken);
      sessionStorage.setItem('refreshToken', qvRefresh);
      sessionStorage.setItem('user', qvUser);
      router.replace(pathname);
    }

    const storedToken = getStoredToken();
    const storedUser = JSON.parse(getStoredUserRaw() || '{}') as {
      role?: string;
      fullName?: string;
      shopStaffRole?: string;
    };
    if (!storedToken || storedUser.role !== 'shop') {
      router.push('/shop-login');
      return;
    }
    setIsOwner(storedUser.shopStaffRole !== 'cashier');
    // "Switch back to Platform" only makes sense for the OLD same-tab
    // impersonation swap (Manage in Tenant), which stashes platformToken
    // in localStorage. A quick-view tab (Open Full View) is a completely
    // separate mechanism using sessionStorage — it has no "platform"
    // session to switch back to in THIS tab, so it must never show this
    // banner even if some other, unrelated tab left a stale platformToken
    // sitting in localStorage (localStorage persists across tabs/reloads
    // until explicitly cleared, unlike sessionStorage).
    setImpersonating(!hasSessionStorageSession() && !!localStorage.getItem('platformToken'));
    setMounted(true);

    (async () => {
      try {
        const result = await apiCall('GET', '/api/shop/me');
        const profile = (result.data ?? result) as { shop: { name: string }; tenantName?: string };
        setShopName(profile.shop.name);
        setTenantName(profile.tenantName ?? null);
      } catch {
        /* keep header minimal if this fails */
      }
    })();
    // Deliberately excludes searchParams/pathname — re-running this on the
    // router.replace() above (which clears the qv* params) would refire
    // the /api/shop/me fetch for no reason; the bootstrap only ever needs
    // to run once, on the tab's first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const doLogout = () => {
    // Clears whichever storage this tab's session actually lives in — a
    // quick-view tab uses sessionStorage, so this must NOT touch
    // localStorage (that's shared with whatever tab opened it).
    clearStoredSession();
    router.push('/shop-login');
  };

  const handleLogout = () => {
    Modal.confirm({
      title: 'Log out?',
      content: "You'll need to sign in again to access the shop portal.",
      okText: 'Logout',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: doLogout,
    });
  };

  const onMenuClick: MenuProps['onClick'] = (e) => router.push(e.key);

  // Restores the super admin's own session, stashed by the platform
  // Medicine Shops page's "Manage in Tenant" before it swapped in this
  // shop's login — a standalone pharmacy tenant has no admin account to
  // land on instead, so without this a super admin would be stuck here.
  const handleSwitchBack = () => {
    // Defensive: this banner is now gated so it can never show in a
    // sessionStorage-based quick-view tab, but clear it anyway — if this
    // tab's sessionStorage ever had a token, it would otherwise keep
    // shadowing the localStorage values being restored below (every read
    // helper checks sessionStorage first).
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('user');

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
    router.push('/platform/medicine-shops');
  };

  if (!mounted) return null;

  return (
    <App>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider theme={isDark ? 'dark' : 'light'} width={220} style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px' }}>
            <div
              style={{
                width: 32, height: 32, background: '#1677ff', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <ShopOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <Text strong style={{ fontSize: 14, display: 'block', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                {shopName ?? 'Shop Portal'}
              </Text>
              {tenantName && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Serving {tenantName}
                </Text>
              )}
            </div>
          </div>
          <Menu
            mode="inline"
            theme={isDark ? 'dark' : 'light'}
            selectedKeys={[pathname]}
            items={MENU_ITEMS.filter((item) => !item.ownerOnly || isOwner).map(({ key, icon, label }) => ({ key, icon, label }))}
            onClick={onMenuClick}
          />
        </Sider>

        <Layout>
          <Header
            style={{
              background: token.colorBgContainer,
              padding: '0 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: impersonating ? 'space-between' : 'flex-end',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              position: 'sticky',
              top: 0,
              zIndex: 99,
            }}
          >
            {impersonating && (
              <Text style={{ fontSize: 13 }}>
                Viewing as <Text strong style={{ color: token.colorWarningText }}>{shopName ?? 'this shop'}</Text>&apos;s portal (super admin session)
              </Text>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {impersonating && (
                <Button icon={<ApartmentOutlined />} onClick={handleSwitchBack}>
                  Switch back to Platform
                </Button>
              )}
              <Button
                type="text"
                shape="circle"
                icon={isDark ? <MoonOutlined /> : <SunOutlined />}
                onClick={toggleTheme}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              />
              <Button type="text" danger icon={<LogoutOutlined />} onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </Header>

          <Content style={{ padding: 24, background: token.colorBgLayout, minHeight: 'calc(100vh - 64px)' }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </App>
  );
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>}>
      <ShopLayoutInner>{children}</ShopLayoutInner>
    </Suspense>
  );
}
