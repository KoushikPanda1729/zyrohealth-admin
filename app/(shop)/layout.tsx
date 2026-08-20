'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { Layout, Menu, Button, Typography, theme, App, Modal, Spin, Drawer, Avatar, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  LogoutOutlined, MoonOutlined, SunOutlined, ShopOutlined, DashboardOutlined,
  ScanOutlined, MedicineBoxOutlined, ApartmentOutlined, ShoppingCartOutlined, FileTextOutlined, TeamOutlined,
  WhatsAppOutlined, CarOutlined, MenuOutlined, UserOutlined, IdcardOutlined, DownOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { apiCall } from '../../lib/api';
import { getStoredToken, getStoredUserRaw, clearStoredSession, hasSessionStorageSession, activeStorage } from '../../lib/session';
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
  const [userInfo, setUserInfo] = useState<{ fullName?: string; email?: string; avatarUrl?: string }>({});
  const [impersonating, setImpersonating] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { token } = theme.useToken();
  const { isDark, toggle: toggleTheme } = useThemeMode();

  // Below this width the 220px Sider would eat most of the viewport, so it's
  // swapped for an off-canvas Drawer opened via the header hamburger.
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const applyMatch = (matches: boolean) => setIsMobile(matches);
    applyMatch(mql.matches);
    const handler = (e: MediaQueryListEvent) => applyMatch(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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
      email?: string;
      avatarUrl?: string;
      shopStaffRole?: string;
      // Only present when a tenant admin opened their OWN in-house shop's
      // full view — they're logged in as themselves (role stays 'admin'),
      // this claim is what actually grants shop-portal access. See
      // AdminService.impersonateShop / attachRole.middleware.ts.
      actingShopId?: string;
    };
    if (!storedToken || (storedUser.role !== 'shop' && !storedUser.actingShopId)) {
      router.push('/shop-login');
      return;
    }
    setIsOwner(storedUser.shopStaffRole !== 'cashier');
    setUserInfo({ fullName: storedUser.fullName, email: storedUser.email, avatarUrl: storedUser.avatarUrl });
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

    // The avatarUrl cached in storage is a signed S3 URL that expires
    // after an hour — same staleness issue the admin layout guards
    // against. Re-fetch fresh on every mount instead of trusting the
    // cached snapshot set above.
    (async () => {
      try {
        const result = await apiCall('GET', '/api/auth/me');
        const fresh = (result.data ?? result) as { fullName?: string; email?: string; avatarUrl?: string };
        setUserInfo({ fullName: fresh.fullName, email: fresh.email, avatarUrl: fresh.avatarUrl });
        activeStorage().setItem('user', JSON.stringify({ ...storedUser, ...fresh }));
      } catch {
        /* keep the storage snapshot already set above */
      }
    })();
    // Deliberately excludes searchParams/pathname — re-running this on the
    // router.replace() above (which clears the qv* params) would refire
    // the /api/shop/me fetch for no reason; the bootstrap only ever needs
    // to run once, on the tab's first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // The account page updates storage (name/email/avatar) after a save or
  // photo upload, but this layout only reads it once at mount — without
  // this listener the header would show stale info until a full reload.
  useEffect(() => {
    const handleUserUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { fullName?: string; email?: string; avatarUrl?: string };
      setUserInfo((prev) => ({ ...prev, ...detail }));
    };
    window.addEventListener('healthplus:user-updated', handleUserUpdated);
    return () => window.removeEventListener('healthplus:user-updated', handleUserUpdated);
  }, []);

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
    { key: '/shop-account', icon: <IdcardOutlined />, label: 'My Account' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') handleLogout();
    else if (key === '/shop-account') router.push('/shop-account');
  };

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

  const sidebarBody = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px', flexShrink: 0 }}>
        <div
          style={{
            width: 32, height: 32, background: '#1677ff', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <ShopOutlined style={{ color: '#fff', fontSize: 16 }} />
        </div>
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
          <Text
            strong
            title={shopName ?? undefined}
            style={{ fontSize: 14, display: 'block', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {shopName ?? 'Shop Portal'}
          </Text>
          {tenantName && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Serving {tenantName}
            </Text>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Menu
          mode="inline"
          theme={isDark ? 'dark' : 'light'}
          selectedKeys={[pathname]}
          items={MENU_ITEMS.filter((item) => !item.ownerOnly || isOwner).map(({ key, icon, label }) => ({ key, icon, label }))}
          onClick={onMenuClick}
        />
      </div>

      {/* Pinned logout footer, same as the admin portal's sidebar — always
          visible without opening the header's account dropdown. */}
      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : token.colorBorderSecondary}`,
          padding: '8px 12px',
        }}
      >
        <Button
          type="text"
          danger
          block
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          title="Logout"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <App>
      <Layout style={{ minHeight: '100vh' }}>
        {isMobile ? (
          <Drawer
            placement="left"
            closable={false}
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
            size={220}
            styles={{ body: { padding: 0 } }}
          >
            {sidebarBody}
          </Drawer>
        ) : (
          <Sider theme={isDark ? 'dark' : 'light'} width={220} style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
            {sidebarBody}
          </Sider>
        )}

        <Layout>
          <Header
            style={{
              background: token.colorBgContainer,
              padding: isMobile ? '0 12px' : '0 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: impersonating && !isMobile ? 'space-between' : 'flex-end',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              position: 'sticky',
              top: 0,
              zIndex: 99,
              gap: 8,
            }}
          >
            {isMobile && (
              <Button
                type="text"
                shape="circle"
                icon={<MenuOutlined />}
                onClick={() => setMobileNavOpen(true)}
                title="Open menu"
                style={{ marginRight: 'auto' }}
              />
            )}
            {impersonating && !isMobile && (
              <Text style={{ fontSize: 13 }}>
                Viewing as <Text strong style={{ color: token.colorWarningText }}>{shopName ?? 'this shop'}</Text>&apos;s portal (super admin session)
              </Text>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {impersonating && !isMobile && (
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
              {!isMobile && <div style={{ width: 1, height: 24, background: token.colorBorderSecondary, margin: '0 8px' }} />}
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
                  {!isMobile && (
                    <Text style={{ fontSize: 13, maxWidth: 120 }} ellipsis>
                      {userInfo.fullName || 'Account'}
                    </Text>
                  )}
                  <DownOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
                </div>
              </Dropdown>
            </div>
          </Header>

          {impersonating && isMobile && (
            <div
              style={{
                background: token.colorWarningBg,
                borderBottom: `1px solid ${token.colorWarningBorder}`,
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 12 }}>
                Viewing as <Text strong style={{ color: token.colorWarningText }}>{shopName ?? 'this shop'}</Text>&apos;s portal
              </Text>
              <Button size="small" icon={<ApartmentOutlined />} onClick={handleSwitchBack}>
                Switch back
              </Button>
            </div>
          )}

          <Content style={{ padding: isMobile ? 12 : 24, background: token.colorBgLayout, minHeight: 'calc(100vh - 64px)' }}>
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
