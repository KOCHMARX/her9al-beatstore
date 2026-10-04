import Link from 'next/link';

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function Login({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Link className="brand center" href="/">
          <img src="/her9al-logo.jpg" alt="HER9AL" />
          <span>HER9AL</span>
        </Link>

        <h1>Welcome back.</h1>
        <p>Login to access purchases, downloads and your library.</p>

        {error && (
          <p style={{ color: '#ff304f', fontSize: 13 }}>
            Login failed: {error}
          </p>
        )}

        <a href="/api/auth/google" className="oauth">
          Continue with Google
        </a>

        <a href="/api/auth/discord" className="oauth">
          Continue with Discord
        </a>

        <small>
          Direct secure login. Supabase remains your database &amp; storage.
        </small>
      </div>
    </main>
  );
}
