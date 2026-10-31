import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ShieldCheck, LockKeyhole } from "lucide-react";
import { desktop, unwrap, ApiError } from "../lib/api";
import { securityText } from "../../shared/security-labels";
import type { SecurityState, Permission } from "../../shared/security";
import type { Locale } from "../../shared/contracts";
import "../security.css";
const SecurityContext = createContext<{
  state: SecurityState;
  refresh: () => Promise<void>;
  can: (p: Permission) => boolean;
} | null>(null);
export function useSecurity() {
  const value = useContext(SecurityContext);
  if (!value) throw new Error("Security context required");
  return value;
}
export function SecurityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SecurityState | null>(null),
    [error, setError] = useState(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = await unwrap(desktop().getSecurityState());
      if (mounted.current) {
        setState((old) =>
          JSON.stringify(old) === JSON.stringify(next) ? old : next,
        );
        setError(false);
      }
    } catch {
      if (mounted.current) setError(true);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), 1000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);
  useEffect(() => {
    if (!state?.authenticated) return;
    let last = 0;
    const touch = (event: Event) => {
      if (!event.isTrusted || Date.now() - last < 15000) return;
      last = Date.now();
      void desktop().touchSession();
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [state?.authenticated]);
  if (error)
    return (
      <main className="startup">
        <h1>Unable to verify staff access</h1>
        <button className="button primary" onClick={() => void refresh()}>
          Retry
        </button>
      </main>
    );
  if (!state)
    return (
      <main className="startup" role="status">
        Loading staff access…
      </main>
    );
  return (
    <SecurityContext.Provider
      value={{ state, refresh, can: (p) => state.permissions.includes(p) }}
    >
      {state.authenticated && !state.mustChangePassword ? (
        <Fragment key={state.user!.id}>{children}</Fragment>
      ) : (
        <AccessScreen
          key={`${state.setupRequired}-${state.locked}-${state.mustChangePassword}`}
          state={state}
          refresh={refresh}
        />
      )}
    </SecurityContext.Provider>
  );
}
function AccessScreen({
  state,
  refresh,
}: {
  state: SecurityState;
  refresh: () => Promise<void>;
}) {
  const [locale, setLocale] = useState<Locale>(state.locale),
    [recover, setRecover] = useState(false),
    [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [newPassword, setNew] = useState(""),
    [repeat, setRepeat] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const t = (key: string) => securityText(locale, key);
  const changing = state.mustChangePassword;
  const needsNew = state.setupRequired || changing || recover;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (needsNew && newPassword !== repeat) throw new Error("mismatch");
      if (recover) await unwrap(desktop().recoverStaffAccount({ newPassword }));
      else if (changing)
        await unwrap(
          desktop().changeStaffPassword({
            currentPassword: password,
            newPassword,
          }),
        );
      else if (state.setupRequired)
        await unwrap(
          desktop().bootstrapAdministrator({
            username,
            name,
            password: newPassword,
            confirmed: confirmed as true,
          }),
        );
      else await unwrap(desktop().loginStaff({ username, password }));
      setRecover(false);
      setMessage("saved");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.code
          : e instanceof Error && e.message === "mismatch"
            ? "mismatch"
            : "STORAGE",
      );
    } finally {
      setPassword("");
      setNew("");
      setRepeat("");
      setBusy(false);
      await refresh();
    }
  }
  return (
    <main className="access-screen">
      <section className="access-card">
        <header>
          <ShieldCheck size={36} />
          <strong>MOSQUE SUITE</strong>
          <label className="language-control">
            <span className="sr-only">Language / ഭാഷ</span>
            <select
              aria-label="Language / ഭാഷ"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="en">English</option>
              <option value="ml">മലയാളം</option>
            </select>
          </label>
        </header>
        <h1>
          {t(
            recover
              ? "recover"
              : changing
                ? "changePassword"
                : state.setupRequired
                  ? "setup"
                  : state.locked
                    ? "locked"
                    : "login",
          )}
        </h1>
        <p>
          {t(
            recover
              ? "recoveryHelp"
              : changing
                ? "mustChange"
                : state.setupRequired
                  ? "setupHelp"
                  : state.locked
                    ? "lockHelp"
                    : "title",
          )}
        </p>
        {error && (
          <p role="alert" className="form-error">
            {t(error)}
          </p>
        )}
        {message && <p role="status">{t(message)}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy}>
            {!recover && !changing && (
              <label className="field">
                {t("username")}
                <input
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={40}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
            )}
            {state.setupRequired && (
              <label className="field">
                {t("name")}
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            {!state.setupRequired && !recover && (
              <label className="field">
                {t(changing ? "currentPassword" : "password")}
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {needsNew && (
              <>
                <label className="field">
                  {t("newPassword")}
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={newPassword}
                    onChange={(e) => setNew(e.target.value)}
                  />
                </label>
                <label className="field">
                  {t("repeat")}
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
              </>
            )}
            {state.setupRequired && (
              <label className="finance-check">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t("confirmed")}
              </label>
            )}
            <button className="button primary" type="submit">
              <LockKeyhole size={18} />
              {busy
                ? t("loading")
                : t(
                    recover
                      ? "recover"
                      : changing
                        ? "changePassword"
                        : state.setupRequired
                          ? "createAdmin"
                          : "login",
                  )}
            </button>
          </fieldset>
        </form>
        {!state.setupRequired && !changing && (
          <button
            className="text-link"
            disabled={busy}
            onClick={() => {
              setRecover((v) => !v);
              setPassword("");
              setNew("");
              setRepeat("");
              setError("");
            }}
          >
            {t(recover ? "back" : "recover")}
          </button>
        )}
      </section>
    </main>
  );
}
