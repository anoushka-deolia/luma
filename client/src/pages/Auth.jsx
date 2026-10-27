import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../lib/AppState.jsx';

function AuthForm({ mode }) {
  const { login, signup } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFields({});
    if (isSignup && password.length < 8) {
      setFields({ password: 'Password must be at least 8 characters.' });
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        await signup(email, password);
        navigate('/onboarding', { replace: true });
      } else {
        await login(email, password);
        navigate(location.state?.from || '/', { replace: true });
      }
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const reasonText = {
    journal: 'Log in to use your private journal.',
    progress: 'Log in to see your progress.',
  }[location.state?.reason];

  return (
    <div className="page page--narrow">
      <h1 className="page-title">{isSignup ? 'Create your profile' : 'Log in'}</h1>
      <p className="muted">
        {isSignup
          ? 'A profile lets Luma learn which technique helps you most, and keeps a private journal. You never need one to get help.'
          : reasonText || (location.state?.expired ? 'Your login expired. Log in again to keep saving.' : 'Welcome back.')}
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={Boolean(fields.email)}
            aria-describedby={fields.email ? 'email-error' : undefined}
          />
          {fields.email && <small id="email-error" className="field__error">{fields.email}</small>}
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isSignup ? 8 : undefined}
            aria-invalid={Boolean(fields.password)}
            aria-describedby={fields.password ? 'password-error' : undefined}
          />
          {isSignup && !fields.password && <small className="field__hint">At least 8 characters.</small>}
          {fields.password && <small id="password-error" className="field__error">{fields.password}</small>}
        </label>
        {error && !Object.keys(fields).length && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button--primary" disabled={busy || !email || !password}>
          {busy ? (isSignup ? 'Creating your profile…' : 'Logging in…') : isSignup ? 'Create profile' : 'Log in'}
        </button>
      </form>
      <p className="muted">
        {isSignup ? (
          <>Already have a profile? <Link to="/login">Log in</Link></>
        ) : (
          <>New here? <Link to="/signup">Create a profile</Link></>
        )}
      </p>
    </div>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Signup = () => <AuthForm mode="signup" />;
