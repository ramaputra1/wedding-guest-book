import { useState } from 'preact/hooks';
import type { SignInCopy } from '../config/site';
import { ApiFailure, signIn } from '../lib/api';
import type { DeviceId } from '../lib/types';

interface Props {
  deviceId: DeviceId;
  copy: SignInCopy;
  onSignedIn: () => void;
}

/**
 * The passphrase prompt in front of the writer controls. Done once per iPad;
 * the session then lasts SESSION_TTL_DAYS. The server decides — this form
 * only asks.
 */
export function SignIn({ deviceId, copy, onSignedIn }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: Event) {
    event.preventDefault();
    if (busy || passphrase === '') return;
    setBusy(true);
    setProblem(null);
    try {
      await signIn(deviceId, passphrase);
      setPassphrase('');
      onSignedIn();
    } catch (failure) {
      const code = failure instanceof ApiFailure ? failure.code : 'network';
      setProblem(
        code === 'wrong_passphrase' ? copy.wrongPassphrase : code === 'server_not_configured' ? copy.notConfigured : copy.unreachable,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="sign-in" onSubmit={submit}>
      <label class="sign-in__label" for="passphrase">
        {copy.label}
      </label>
      <div class="sign-in__row">
        <input
          id="passphrase"
          class="sign-in__input"
          type="password"
          autocomplete="current-password"
          value={passphrase}
          onInput={(event) => setPassphrase((event.target as HTMLInputElement).value)}
          aria-invalid={problem !== null}
          aria-describedby={problem ? 'passphrase-problem' : undefined}
          required
        />
        <button class="sign-in__submit" type="submit" disabled={busy}>
          {busy ? copy.submitting : copy.submit}
        </button>
      </div>
      {problem && (
        <p class="sign-in__problem" id="passphrase-problem" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}
