'use client';
import { ConfigProvider, theme as antdTheme } from 'antd';
import React from 'react';
import { ThemeModeProvider, useThemeMode } from './theme-context';

function AntdThemeBridge({ children }: { children: React.ReactNode }) {
  const { isDark } = useThemeMode();
  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: '#1677ff', borderRadius: 8 },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeModeProvider>
      <AntdThemeBridge>{children}</AntdThemeBridge>
    </ThemeModeProvider>
  );
}
