import * as React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

interface FeatureItem {
  title: string;
  icon: React.ReactNode;
  description: string;
}

const FeatureList: FeatureItem[] = [
  {
    title: 'EF Core & LINQ Fluent API',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    description:
      'Intuitive DbContext & DbSet patterns with fluent type-safe query chaining, typed selectors, and dynamic filters.',
  },
  {
    title: 'Multi-Database Dialect Support',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    description:
      'First-class support for PostgreSQL (Neon/CockroachDB), SQLite (LibSQL/Turso), MySQL (PlanetScale), and SQL Server.',
  },
  {
    title: 'First-Class Stored Procedures',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    description:
      'Type-safe stored procedure and user-defined function execution with input/output parameters, multiple result sets, and table types.',
  },
  {
    title: 'Enterprise Concurrency & Locking',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    description:
      'Built-in optimistic concurrency via @Version/@ConcurrencyCheck and pessimistic row-level locking (FOR UPDATE, UPDLOCK).',
  },
  {
    title: 'AI Vector Search & Embeddings',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    description:
      'Native pgvector embeddings with cosine, euclidean, and inner product distance indexing and nearest-neighbor search.',
  },
  {
    title: 'Reliability: Idempotency & Outbox',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    description:
      'Transactional outbox pattern and distributed idempotency keys for rock-solid microservices and event-driven architectures.',
  },
];

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary')}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            className="button button--primary button--lg"
            to="/docs/getting-started/quickstart"
            style={{ fontWeight: 600, padding: '0.85rem 2rem' }}
          >
            Get Started →
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/api"
            style={{ fontWeight: 600, padding: '0.85rem 2rem' }}
          >
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} — Enterprise TypeScript ORM`}
      description="Enterprise EF Core-inspired ORM, DbContext, DbSet, and Stored Procedure Execution for TypeScript & Node.js"
    >
      <HomepageHeader />
      <main style={{ padding: '4rem 0' }}>
        <div className="container">
          <div className="row" style={{ rowGap: '2rem' }}>
            {FeatureList.map((feature, idx) => (
              <div key={idx} className="col col--4">
                <div className="featureCard">
                  <div className="featureIcon">{feature.icon}</div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{feature.title}</h3>
                  <p style={{ color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Example Section */}
          <div style={{ marginTop: '5rem', textAlign: 'center' }}>
            <h2>Quick Installation</h2>
            <div style={{ maxWidth: '600px', margin: '1.5rem auto 0' }}>
              <pre style={{ textAlign: 'left', padding: '1rem 1.5rem', borderRadius: '8px' }}>
                <code>npm install entityts-orm reflect-metadata</code>
              </pre>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
