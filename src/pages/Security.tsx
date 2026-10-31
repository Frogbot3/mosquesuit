import { useCallback, useId, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { desktop, unwrap, ApiError } from "../lib/api";
import { useWorkspace } from "../components/WorkspaceProvider";
import { useSecurity } from "../components/SecurityProvider";
import { useRegistrationData } from "../lib/useRegistrationData";
import { useUnsavedRegistration } from "../lib/useUnsavedRegistration";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { securityText } from "../../shared/security-labels";
import {
  permissions,
  roleIds,
  type RoleId,
  type StaffUser,
  type StaffRole,
  type BackupPreview,
  type Permission,
} from "../../shared/security";
const useText = () => {
  const { snapshot } = useWorkspace();
  return useCallback(
    (key: string) => securityText(snapshot.settings.locale, key),
    [snapshot.settings.locale],
  );
};
function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  required = true,
  options,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
  required?: boolean;
  options?: { value: string; label: string }[];
}) {
  const id = useId();
  const t = useText();
  return (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      {options ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          min={min}
          max={max}
          minLength={
            type === "password" &&
            label !== "currentPassword" &&
            label !== "optionalPassword"
              ? 12
              : undefined
          }
          maxLength={type === "password" ? 128 : 200}
          autoComplete={
            type === "password"
              ? label === "currentPassword"
                ? "current-password"
                : "new-password"
              : undefined
          }
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
function Check({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const t = useText();
  return (
    <label className="finance-check">
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
      />
      {t(label)}
    </label>
  );
}
function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  const t = useText();
  return error ? (
    <div role="alert">
      <p>{t(error === "error" ? "STORAGE" : error)}</p>
      <button className="button secondary" onClick={retry}>
        {t("retry")}
      </button>
    </div>
  ) : loading ? (
    <p role="status">{t("loading")}</p>
  ) : null;
}
function useForm() {
  const t = useText();
  const { refresh } = useSecurity();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false);
  const guard = useUnsavedRegistration(dirty);
  async function run(work: () => Promise<unknown>, done?: () => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await work();
      if (result !== false) {
        setDirty(false);
        setMessage("saved");
        done?.();
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.code
          : e instanceof Error && e.message === "mismatch"
            ? "mismatch"
            : "STORAGE",
      );
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  return {
    busy,
    dirty,
    setDirty,
    run,
    allowNavigation: guard.allowNavigation,
    feedback: (
      <>
        {error && (
          <p role="alert" className="form-error">
            {t(error)}
          </p>
        )}
        {message && <p role="status">{t(message)}</p>}
        <ConfirmDialog
          open={guard.blocker.state === "blocked"}
          title={t("discardTitle")}
          confirm={t("discard")}
          cancel={t("keep")}
          onCancel={() => {
            if (guard.blocker.state === "blocked") guard.blocker.reset();
          }}
          onConfirm={() => {
            if (guard.blocker.state === "blocked") guard.blocker.proceed();
          }}
        >
          {t("discardHelp")}
        </ConfirmDialog>
      </>
    ),
  };
}
function Frame({ title, children }: { title: string; children: ReactNode }) {
  const t = useText(),
    { can } = useSecurity();
  return (
    <section>
      <header className="page-heading">
        <h1>{t(title)}</h1>
      </header>
      <nav className="finance-tabs" aria-label={t("security")}>
        {can("staff.manage") && <Link to="/staff">{t("staff")}</Link>}
        {can("audit.view") && <Link to="/audit">{t("audit")}</Link>}
        {can("backup.create") && <Link to="/backup">{t("backup")}</Link>}
        <Link to="/security">{t("security")}</Link>
      </nav>
      <div className="security-section">{children}</div>
    </section>
  );
}
export function StaffDirectory() {
  const t = useText();
  const load = useCallback(() => unwrap(desktop().getStaffDirectory()), []),
    data = useRegistrationData(load);
  return (
    <Frame title="staff">
      <div className="security-toolbar">
        <Link className="button primary" to="/staff/new">
          {t("addStaff")}
        </Link>
        <Link className="button secondary" to="/staff/roles">
          {t("roles")}
        </Link>
      </div>
      <LoadState {...data} />
      {data.data && (
        <div className="panel table-scroll security-table">
          <table>
            <caption className="sr-only">{t("staff")}</caption>
            <thead>
              <tr>
                {[
                  "name",
                  "username",
                  "role",
                  "wards",
                  "status",
                  "lastLogin",
                  "edit",
                ].map((k) => (
                  <th key={k} scope="col">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.username}</td>
                  <td>{t(u.roleId)}</td>
                  <td>{u.allWards ? t("allWards") : u.wardIds.join(", ")}</td>
                  <td>{t(u.active ? "active" : "disabled")}</td>
                  <td>
                    {u.lastLogin
                      ? new Date(u.lastLogin).toLocaleString()
                      : t("never")}
                  </td>
                  <td>
                    <Link className="text-link" to={`/staff/${u.id}`}>
                      {t("edit")} <span className="sr-only">{u.name}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Frame>
  );
}
export function StaffProfile() {
  const { id } = useParams();
  const load = useCallback(() => unwrap(desktop().getStaffDirectory()), []),
    data = useRegistrationData(load);
  return (
    <Frame title={id ? "staff" : "addStaff"}>
      <LoadState {...data} />
      {data.data && (
        <StaffEditor
          key={`${id ?? "new"}-${data.data.users.find((u) => u.id === id)?.revision ?? 0}`}
          user={data.data.users.find((u) => u.id === id)}
          roles={data.data.roles}
          exists={Boolean(id)}
          reload={data.retry}
        />
      )}
    </Frame>
  );
}
function StaffEditor({
  user,
  roles,
  exists,
  reload,
}: {
  user?: StaffUser;
  roles: StaffRole[];
  exists: boolean;
  reload: () => void;
}) {
  const t = useText(),
    { snapshot } = useWorkspace(),
    navigate = useNavigate(),
    { state } = useSecurity(),
    form = useForm();
  const [name, setName] = useState(user?.name ?? ""),
    [username, setUsername] = useState(user?.username ?? ""),
    [roleId, setRole] = useState<RoleId>(user?.roleId ?? "ward_operator"),
    [allWards, setAll] = useState(user?.allWards ?? false),
    [wardIds, setWards] = useState<string[]>(user?.wardIds ?? []),
    [active, setActive] = useState(user?.active ?? true),
    [password, setPassword] = useState(""),
    [current, setCurrent] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reset, setReset] = useState(false);
  if (exists && !user) return <p role="alert">{t("AUTH_STALE")}</p>;
  async function save() {
    await form.run(
      async () => {
        try {
          if (reset && user)
            return await unwrap(
              desktop().resetStaffPassword({
                id: user.id,
                password,
                currentPassword: current,
                confirmed: confirmed as true,
              }),
            );
          return await unwrap(
            desktop().saveStaffAccount({
              id: user?.id ?? "",
              revision: user?.revision ?? 0,
              name,
              username,
              roleId,
              allWards,
              wardIds: allWards ? [] : wardIds,
              active,
              password: user ? "" : password,
              currentPassword: current,
              confirmed: confirmed as true,
            }),
          );
        } finally {
          setPassword("");
          setCurrent("");
          setConfirmed(false);
        }
      },
      () => {
        form.allowNavigation();
        if (user) reload();
        else navigate("/staff");
      },
    );
  }
  return (
    <div className="panel">
      {form.feedback}
      <form
        className="security-form"
        onChange={() => form.setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={form.busy}>
          <div className="security-grid">
            <Field label="name" value={name} onChange={setName} />
            <Field label="username" value={username} onChange={setUsername} />
            <Field
              label="role"
              value={roleId}
              onChange={(v) => {
                setRole(v as RoleId);
                if (v === "super_admin") {
                  setAll(true);
                  setWards([]);
                }
              }}
              options={roles.map((r) => ({ value: r.id, label: t(r.id) }))}
            />
          </div>
          <Check label="active" value={active} onChange={setActive} />
          <Check
            label="allWards"
            value={allWards}
            disabled={roleId === "super_admin"}
            onChange={(v) => {
              setAll(v);
              setWards([]);
            }}
          />
          {!allWards && (
            <fieldset>
              <legend>{t("wards")}</legend>
              <div className="security-checks">
                {snapshot.wards.map((w) => (
                  <Check
                    key={w.id}
                    label={`${w.name} ${w.nameMl}`}
                    value={wardIds.includes(w.id)}
                    onChange={(v) =>
                      setWards((ids) =>
                        v ? [...ids, w.id] : ids.filter((id) => id !== w.id),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}
          <p>{t("roles")}</p>
          <div className="security-grants">
            {roles
              .find((r) => r.id === roleId)
              ?.permissions.map((p) => (
                <span key={p}>{t(p)}</span>
              ))}
          </div>
          {user && user.id !== state.user?.id && (
            <Check label="reset" value={reset} onChange={setReset} />
          )}
          {(!user || reset) && (
            <Field
              label="temporary"
              type="password"
              value={password}
              onChange={setPassword}
            />
          )}
          <Field
            label="currentPassword"
            type="password"
            value={current}
            onChange={setCurrent}
          />
          <Check
            label="confirmed"
            required
            value={confirmed}
            onChange={setConfirmed}
          />
          <button className="button primary" type="submit">
            {t(reset ? "reset" : "save")}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
export function RoleEditor() {
  const t = useText(),
    load = useCallback(() => unwrap(desktop().getStaffDirectory()), []),
    data = useRegistrationData(load);
  const [id, setId] = useState<RoleId>("ward_operator");
  return (
    <Frame title="roles">
      <p>{t("roleHelp")}</p>
      <LoadState {...data} />
      {data.data && (
        <RoleForm
          key={`${id}-${data.data.roles.find((r) => r.id === id)?.revision}`}
          role={data.data.roles.find((r) => r.id === id)!}
          onSelect={setId}
          reload={data.retry}
        />
      )}
    </Frame>
  );
}
function RoleForm({
  role,
  onSelect,
  reload,
}: {
  role: StaffRole;
  onSelect: (id: RoleId) => void;
  reload: () => void;
}) {
  const t = useText(),
    { state } = useSecurity(),
    form = useForm();
  const [grants, setGrants] = useState<Permission[]>(role.permissions),
    [current, setCurrent] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const readonly =
    role.id === "super_admin" || state.user?.roleId !== "super_admin";
  return (
    <div className="panel">
      {form.feedback}
      <Field
        label="role"
        value={role.id}
        onChange={(v) => onSelect(v as RoleId)}
        options={roleIds.map((id) => ({ value: id, label: t(id) }))}
      />
      <form
        className="security-form"
        onChange={() => form.setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void form.run(async () => {
            try {
              return await unwrap(
                desktop().saveStaffRole({
                  id: role.id,
                  revision: role.revision,
                  permissions: grants,
                  currentPassword: current,
                  confirmed: confirmed as true,
                }),
              );
            } finally {
              setCurrent("");
              setConfirmed(false);
            }
          }, reload);
        }}
      >
        <fieldset disabled={form.busy || readonly}>
          <div className="security-checks">
            {permissions.map((p) => (
              <Check
                key={p}
                label={p}
                value={grants.includes(p)}
                onChange={(v) =>
                  setGrants((old) =>
                    v ? [...old, p] : old.filter((g) => g !== p),
                  )
                }
              />
            ))}
          </div>
          {!readonly && (
            <>
              <Field
                label="currentPassword"
                type="password"
                value={current}
                onChange={setCurrent}
              />
              <Check
                label="confirmed"
                required
                value={confirmed}
                onChange={setConfirmed}
              />
              <button className="button primary">{t("save")}</button>
            </>
          )}
        </fieldset>
      </form>
    </div>
  );
}
export function SecuritySettings() {
  const t = useText(),
    { state, can } = useSecurity(),
    form = useForm();
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [idle, setIdle] = useState(state.idleMinutes),
    [locale, setLocale] = useState(state.locale),
    [confirmed, setConfirmed] = useState(false);
  const action = (work: () => Promise<unknown>) =>
    void form.run(async () => {
      try {
        return await work();
      } finally {
        setCurrent("");
        setPassword("");
        setRepeat("");
        setConfirmed(false);
      }
    });
  return (
    <Frame title="security">
      <div className="panel">
        {form.feedback}
        <form
          className="security-form"
          onChange={() => form.setDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            action(async () => {
              if (password !== repeat) throw new Error("mismatch");
              return unwrap(
                desktop().changeStaffPassword({
                  currentPassword: current,
                  newPassword: password,
                }),
              );
            });
          }}
        >
          <fieldset disabled={form.busy}>
            <h2>{t("changePassword")}</h2>
            <Field
              label="currentPassword"
              type="password"
              value={current}
              onChange={setCurrent}
            />
            <Field
              label="newPassword"
              type="password"
              value={password}
              onChange={setPassword}
            />
            <Field
              label="repeat"
              type="password"
              value={repeat}
              onChange={setRepeat}
            />
            <button className="button primary">{t("changePassword")}</button>
          </fieldset>
        </form>
        <hr />
        <h2>{t("renew")}</h2>
        <p>{t("renewHelp")}</p>
        <button
          className="button secondary"
          disabled={form.busy || !current}
          onClick={() =>
            action(() =>
              unwrap(desktop().renewRecoveryFile({ currentPassword: current })),
            )
          }
        >
          {t("renew")}
        </button>
        {can("security.configure") && (
          <form
            className="security-form"
            onChange={() => form.setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              action(() =>
                unwrap(
                  desktop().saveSecuritySettings({
                    idleMinutes: idle,
                    locale,
                    currentPassword: current,
                    confirmed: confirmed as true,
                  }),
                ),
              );
            }}
          >
            <h2>{t("security")}</h2>
            <Field
              label="idle"
              type="number"
              min={1}
              max={60}
              value={idle}
              onChange={(v) => setIdle(Number(v))}
            />
            <Field
              label="language"
              value={locale}
              onChange={(v) => setLocale(v as "en" | "ml")}
              options={[
                { value: "en", label: "English" },
                { value: "ml", label: "മലയാളം" },
              ]}
            />
            <Check
              label="confirmed"
              required
              value={confirmed}
              onChange={setConfirmed}
            />
            <button className="button primary" disabled={form.busy || !current}>
              {t("save")}
            </button>
          </form>
        )}
      </div>
    </Frame>
  );
}
export function AuditHistory() {
  const t = useText();
  const [query, setQuery] = useState({
    action: "",
    outcome: "" as "" | "success" | "failure" | "denied",
    from: "",
    until: "",
    page: 1,
  });
  const load = useCallback(
      () => unwrap(desktop().getSecurityAudit(query)),
      [query],
    ),
    data = useRegistrationData(load);
  return (
    <Frame title="audit">
      <div className="panel security-grid">
        <Field
          label="action"
          value={query.action}
          required={false}
          onChange={(v) => setQuery((q) => ({ ...q, action: v, page: 1 }))}
        />
        <Field
          label="outcome"
          value={query.outcome}
          onChange={(v) =>
            setQuery((q) => ({ ...q, outcome: v as typeof q.outcome, page: 1 }))
          }
          options={["", "success", "failure", "denied"].map((v) => ({
            value: v,
            label: t(v || "all"),
          }))}
        />
        {(["from", "until"] as const).map((k) => (
          <Field
            key={k}
            label={k}
            type="date"
            value={query[k]}
            required={false}
            onChange={(v) => setQuery((q) => ({ ...q, [k]: v, page: 1 }))}
          />
        ))}
      </div>
      <LoadState {...data} />
      {data.data && (
        <>
          <p role={data.data.valid ? "status" : "alert"}>
            {t(data.data.valid ? "integrity" : "integrityFailed")}
          </p>
          <div className="panel table-scroll security-table">
            <table>
              <caption className="sr-only">{t("audit")}</caption>
              <thead>
                <tr>
                  {["date", "name", "action", "outcome", "summary"].map((k) => (
                    <th key={k} scope="col">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.at).toLocaleString()}</td>
                    <td>{r.staffName}</td>
                    <td>
                      {r.action}
                      <br />
                      <small>
                        {r.entityType} {r.entityId}
                      </small>
                    </td>
                    <td>{t(r.outcome)}</td>
                    <td>
                      {r.summary}
                      <br />
                      <small>{r.correlationId}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="security-toolbar">
            <button
              className="button secondary"
              disabled={query.page === 1}
              onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
            >
              {t("previous")}
            </button>
            <span>{query.page}</span>
            <button
              className="button secondary"
              disabled={query.page * 50 >= data.data.total}
              onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
            >
              {t("next")}
            </button>
          </div>
        </>
      )}
    </Frame>
  );
}
export function BackupDashboard() {
  const t = useText(),
    { can } = useSecurity(),
    load = useCallback(() => unwrap(desktop().getBackupState()), []),
    data = useRegistrationData(load);
  return (
    <Frame title="backup">
      <LoadState {...data} />
      {data.data && (
        <BackupForms
          key={`${data.data.destination}-${data.data.scheduled}-${data.data.intervalHours}-${data.data.retain}`}
          initial={data.data}
          reload={data.retry}
        />
      )}{" "}
      {can("backup.restore") && (
        <Link className="button secondary" to="/backup/restore">
          {t("restore")}
        </Link>
      )}
      {data.data && (
        <div className="panel table-scroll security-table">
          <h2>{t("history")}</h2>
          <table>
            <caption className="sr-only">{t("history")}</caption>
            <thead>
              <tr>
                {["date", "filename", "status", "summary"].map((k) => (
                  <th key={k} scope="col">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.history.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.at).toLocaleString()}</td>
                  <td>{r.filename}</td>
                  <td>
                    {r.kind} · {r.status}
                  </td>
                  <td>
                    {r.message}
                    <br />
                    <small>{r.digest}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Frame>
  );
}
function BackupForms({
  initial,
  reload,
}: {
  initial: import("../../shared/security").BackupState;
  reload: () => void;
}) {
  const t = useText(),
    form = useForm();
  const [password, setPassword] = useState(""),
    [current, setCurrent] = useState(""),
    [scheduled, setScheduled] = useState(initial.scheduled),
    [interval, setInterval] = useState(initial.intervalHours),
    [retain, setRetain] = useState(initial.retain),
    [confirmed, setConfirmed] = useState(false),
    [manual, setManual] = useState("");
  return (
    <div className="panel">
      {form.feedback}
      <p>
        {t("destination")}: {initial.destination || "—"}
      </p>
      <p>{t("backupHelp")}</p>
      <form
        className="security-form"
        onChange={() => form.setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void form.run(async () => {
            try {
              return await unwrap(
                desktop().configureBackups({
                  password,
                  currentPassword: current,
                  scheduled,
                  intervalHours: interval,
                  retain,
                  confirmed: confirmed as true,
                }),
              );
            } finally {
              setPassword("");
              setCurrent("");
              setConfirmed(false);
            }
          }, reload);
        }}
      >
        <fieldset disabled={form.busy}>
          <div className="security-grid">
            <Field
              label="backupPassword"
              type="password"
              value={password}
              onChange={setPassword}
            />
            <Field
              label="currentPassword"
              type="password"
              value={current}
              onChange={setCurrent}
            />
            <Field
              label="interval"
              type="number"
              min={1}
              max={168}
              value={interval}
              onChange={(v) => setInterval(Number(v))}
            />
            <Field
              label="retain"
              type="number"
              min={1}
              max={100}
              value={retain}
              onChange={(v) => setRetain(Number(v))}
            />
          </div>
          <Check label="scheduled" value={scheduled} onChange={setScheduled} />
          <Check
            label="confirmed"
            required
            value={confirmed}
            onChange={setConfirmed}
          />
          <button className="button primary">{t("configure")}</button>
        </fieldset>
      </form>
      <hr />
      <form
        className="security-form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.run(async () => {
            try {
              return await unwrap(
                desktop().createEncryptedBackup({ password: manual }),
              );
            } finally {
              setManual("");
            }
          }, reload);
        }}
      >
        <Field
          label="optionalPassword"
          type="password"
          required={false}
          value={manual}
          onChange={setManual}
        />
        <button
          className="button primary"
          disabled={form.busy || !initial.destination}
        >
          {t("createBackup")}
        </button>
      </form>
    </div>
  );
}
export function RestoreWizard() {
  const t = useText(),
    form = useForm();
  const [password, setPassword] = useState(""),
    [current, setCurrent] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [preview, setPreview] = useState<BackupPreview | null>(null);
  return (
    <Frame title="restore">
      <p className="security-warning">{t("restoreHelp")}</p>
      <div className="panel">
        {form.feedback}
        {!preview ? (
          <form
            className="security-form"
            onSubmit={(e) => {
              e.preventDefault();
              void form.run(async () => {
                try {
                  const result = await unwrap(
                    desktop().previewEncryptedBackup({ password }),
                  );
                  setPreview(result);
                  return Boolean(result);
                } finally {
                  setPassword("");
                }
              });
            }}
          >
            <Field
              label="backupPassword"
              type="password"
              value={password}
              onChange={setPassword}
            />
            <button className="button primary" disabled={form.busy}>
              {t("verify")}
            </button>
          </form>
        ) : (
          <>
            <dl className="security-summary">
              {[
                ["mosque", preview.mosque],
                ["date", new Date(preview.createdAt).toLocaleString()],
                ["schema", preview.schemaVersion],
                ["families", preview.families],
                ["members", preview.members],
                ["payments", preview.payments],
                ["staff", preview.staff],
                ["attachments", preview.attachments],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{t(String(k))}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <form
              className="security-form"
              onChange={() => form.setDirty(true)}
              onSubmit={(e) => {
                e.preventDefault();
                void form.run(async () => {
                  try {
                    return await unwrap(
                      desktop().restoreEncryptedBackup({
                        previewId: preview.id,
                        currentPassword: current,
                        confirmation: confirmation as "RESTORE VERIFIED BACKUP",
                      }),
                    );
                  } finally {
                    setCurrent("");
                    setConfirmation("");
                  }
                });
              }}
            >
              <Field
                label="currentPassword"
                type="password"
                value={current}
                onChange={setCurrent}
              />
              <Field
                label="confirmation"
                value={confirmation}
                onChange={setConfirmation}
              />
              <button
                className="button primary"
                disabled={
                  form.busy || confirmation !== "RESTORE VERIFIED BACKUP"
                }
              >
                {t("restore")}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={form.busy}
                onClick={() => {
                  setPreview(null);
                  setCurrent("");
                  setConfirmation("");
                  form.setDirty(false);
                }}
              >
                {t("cancel")}
              </button>
            </form>
          </>
        )}
      </div>
    </Frame>
  );
}
