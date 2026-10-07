import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api';
import { useLogin, useSession } from '../auth';
import { t } from '../strings';

export function LoginPage() {
  const admin = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (admin) return <Navigate to={from} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ username, password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  const error = login.error;
  const message =
    error instanceof ApiError && error.status === 401
      ? t.login.wrongCredentials
      : error instanceof ApiError && error.status === 429
        ? t.login.tooManyAttempts
        : error
          ? t.login.failed
          : null;

  return (
    <form className="panel login" onSubmit={submit}>
      <h1>{t.login.title}</h1>
      <label>
        {t.login.username}
        <input
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        {t.login.password}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <button type="submit" disabled={login.isPending}>
        {t.login.submit}
      </button>
      <button type="button" className="link" onClick={() => navigate('/')}>
        {t.login.cancel}
      </button>
    </form>
  );
}
