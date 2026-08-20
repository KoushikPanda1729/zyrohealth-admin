import type { Metadata } from 'next';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface PolicyData {
  title: string;
  content: string;
  updatedAt: string;
}

interface Props {
  params: Promise<{ slug: string }>;
}

// Public — no auth, same precedent as /login, /shop-login, /accept-invite
// (nothing under app/(admin) or app/(shop)). Reads from the same
// backend/src/modules/policies public endpoint health-frontend's
// /privacy and /policies/[slug] pages use, so content stays in sync no
// matter which portal a link was opened from.
async function fetchPolicy(slug: string): Promise<PolicyData | null> {
  try {
    const res = await fetch(`${API_URL}/api/policies/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const body = await res.json();
    const data = body?.data ?? body;
    if (!data?.title || typeof data.content !== 'string') return null;
    return { title: data.title, content: data.content, updatedAt: data.updatedAt };
  } catch {
    return null;
  }
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const policy = await fetchPolicy(slug);
  const title = policy?.title ?? titleCase(slug);
  return { title: `${title} — ZyroHealth Admin` };
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const policy = await fetchPolicy(slug);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#0f172a' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 96px' }}>
        <Link
          href="/login"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', marginBottom: 32 }}
        >
          ← Back
        </Link>

        {policy ? (
          <>
            <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 4 }}>{policy.title}</h1>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 32 }}>
              Last updated: {formatDate(policy.updatedAt)}
            </p>
            <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#334155' }}>
              {policy.content}
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 12 }}>{titleCase(slug)}</h1>
            <p style={{ color: '#64748b', fontSize: 15 }}>This document hasn&rsquo;t been published yet.</p>
          </>
        )}
      </div>
    </div>
  );
}
