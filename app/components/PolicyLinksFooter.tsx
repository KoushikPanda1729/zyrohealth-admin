'use client';

import React, { useEffect, useState } from 'react';
import { Typography } from 'antd';
import axios from 'axios';
import Link from 'next/link';
import { env } from '../../lib/env';

const { Text } = Typography;

interface PolicyItem {
  slug: string;
  title: string;
}

// Shown on every login/register screen (admin, shop portal) — pulls
// whatever the platform owner has published on the Policies admin page
// (backend/src/modules/policies), so it never goes stale as policies are
// added, renamed, or unpublished. Links to the real /policies/[slug]
// route (a public page, same precedent as /login, /shop-login,
// /accept-invite) rather than a modal.
export function PolicyLinksFooter() {
  const [policies, setPolicies] = useState<PolicyItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${env.API_URL}/api/policies`)
      .then((res) => {
        if (!cancelled) setPolicies(res.data?.data ?? []);
      })
      .catch(() => {
        // Non-fatal — the login form itself doesn't depend on this.
      });
    return () => { cancelled = true; };
  }, []);

  if (policies.length === 0) return null;

  return (
    <div style={{ textAlign: 'center', marginTop: 28 }}>
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        By continuing, you agree to our{' '}
        {policies.map((p, i) => (
          <React.Fragment key={p.slug}>
            <Link href={`/policies/${p.slug}`} target="_blank" rel="noopener noreferrer">{p.title}</Link>
            {i < policies.length - 2 ? ', ' : i === policies.length - 2 ? ' and ' : ''}
          </React.Fragment>
        ))}
        .
      </Text>
    </div>
  );
}
