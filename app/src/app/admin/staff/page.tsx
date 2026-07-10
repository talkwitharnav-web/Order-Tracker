"use client";

import { useEffect, useState, useCallback, FC, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { StrengthMeter } from "@/components/ui/StrengthMeter";
import { fetchJson } from "@/lib/api-client";
import { scorePinStrength } from "@/lib/credential-strength";

/**
 * Admin-side staff management: search a kitchen, then manage its full
 * roster (Managers/Employees) and role labels from one profile view. This
 * is also the bootstrap path for a kitchen's FIRST manager -- the kitchen
 * dashboard's own Staff tab requires unlocking with an existing manager's
 * PIN, which would otherwise be a chicken-and-egg lock-out for a kitchen
 * with no employees yet. Admin is already gated by requireAdmin() on every
 * mutation route this page calls, so no PIN-unlock step is needed here --
 * unlike the kitchen-side panel, which has no session to check a role
 * against. See SYSTEM_MEMORY.md "Employee Attribution".
 */

interface RestaurantRow {
  id: number;
  name: string;
}

type EmployeeRow = {
  id: number;
  name: string;
  account_type: "manager" | "employee";
  role_id: number | null;
  role_name: string | null;
  pin_length: number;
  created_at: string;
};

type RoleRow = { id: number; name: string; created_at: string };

function AdminStaffContent() {
  const router = useRouter();
  const showToast = useToast();
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [kitchenSearch, setKitchenSearch] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ authenticated: boolean; type?: string }>("/api/session")
      .then((session) => {
        if (!session.authenticated || session.type !== "admin") {
          router.push("/");
          return;
        }
        fetchJson<{ restaurants: RestaurantRow[] }>("/api/dev/db")
          .then((data) => setRestaurants(data.restaurants))
          .catch(() => showToast("Failed to load kitchens", "error"));
      })
      .catch(() => router.push("/"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const matchingRestaurants = restaurants.filter((r) =>
    r.name.toLowerCase().includes(kitchenSearch.trim().toLowerCase()),
  );

  return (
    <div className="h-dvh flex flex-col overflow-hidden p-4 sm:p-8">
      <SettingsToggles health={<HealthPin />} />
      <div className="shrink-0">
        <PageHeader title="Staff Management" backHref="/admin/db" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto relative z-0">
        {!selectedRestaurant ? (
          <>
            <div className="relative w-full max-w-md mb-4">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <Input
                type="text"
                value={kitchenSearch}
                onChange={(e) => setKitchenSearch(e.target.value)}
                placeholder="Search a kitchen by name..."
                aria-label="Search kitchen"
                className="pl-9"
              />
            </div>
            <Card className="!p-0 overflow-y-auto max-h-[70vh]">
              {matchingRestaurants.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] p-4">
                  {kitchenSearch.trim() === "" ? "Start typing to search kitchens." : `No kitchen matches "${kitchenSearch}".`}
                </p>
              ) : (
                <ul>
                  {matchingRestaurants.map((r) => (
                    <li key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                      <button
                        type="button"
                        onClick={() => setSelectedRestaurant(r.name)}
                        className="w-full text-left px-4 py-3 hover:bg-[var(--color-surface-2)] text-[var(--color-text-primary)] transition-colors"
                      >
                        {r.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        ) : (
          <KitchenProfile restaurantName={selectedRestaurant} onBack={() => setSelectedRestaurant(null)} />
        )}
      </div>
    </div>
  );
}

const KitchenProfile: FC<{ restaurantName: string; onBack: () => void }> = ({ restaurantName, onBack }) => {
  const showToast = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [empData, roleData] = await Promise.all([
        fetchJson<{ employees: EmployeeRow[] }>(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees`),
        fetchJson<{ roles: RoleRow[] }>(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/roles`),
      ]);
      setEmployees(empData.employees);
      setRoles(roleData.roles);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load kitchen staff", "error");
    } finally {
      setLoading(false);
    }
  }, [restaurantName, showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const managers = employees.filter((e) => e.account_type === "manager");
  const staff = employees.filter((e) => e.account_type === "employee");

  const roleOptions = [
    { value: "", label: "No role label" },
    ...roles.map((r) => ({ value: String(r.id), label: r.name })),
  ];

  const removeEmployee = async (id: number, name: string) => {
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees/${id}`, { method: "DELETE" });
      showToast(`Removed ${name}`, "success");
      void loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove employee", "error");
    }
  };

  const updateEmployee = async (id: number, patch: Record<string, unknown>) => {
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      showToast("Updated", "success");
      void loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update employee", "error");
    }
  };

  const deleteRole = async (id: number, name: string) => {
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/roles/${id}`, { method: "DELETE" });
      showToast(`Deleted role "${name}"`, "success");
      void loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete role", "error");
    }
  };

  if (loading) return <p className="text-[var(--color-text-muted)]">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text-primary)]">{restaurantName}</h2>
        <Button variant="ghost" onClick={onBack}>
          Change kitchen
        </Button>
      </div>

      <AccountSection
        title="Managers"
        description="Can unlock the Staff tab from the kitchen dashboard and manage other accounts/roles there."
        accounts={managers}
        roleOptions={roleOptions}
        restaurantName={restaurantName}
        onRemove={removeEmployee}
        onUpdate={updateEmployee}
        onCreated={loadAll}
        defaultAccountType="manager"
      />

      <RolesSection roles={roles} restaurantName={restaurantName} onDelete={deleteRole} onCreated={loadAll} />

      <AccountSection
        title="Employees"
        description="Can be attributed to order actions via PIN, but cannot manage staff/roles."
        accounts={staff}
        roleOptions={roleOptions}
        restaurantName={restaurantName}
        onRemove={removeEmployee}
        onUpdate={updateEmployee}
        onCreated={loadAll}
        defaultAccountType="employee"
      />
    </div>
  );
};

const AccountSection: FC<{
  title: string;
  description: string;
  accounts: EmployeeRow[];
  roleOptions: { value: string; label: string }[];
  restaurantName: string;
  onRemove: (id: number, name: string) => void;
  onUpdate: (id: number, patch: Record<string, unknown>) => void;
  onCreated: () => void;
  defaultAccountType: "manager" | "employee";
}> = ({ title, description, accounts, roleOptions, restaurantName, onRemove, onUpdate, onCreated, defaultAccountType }) => {
  const showToast = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  // Derived from which section this form belongs to (Managers vs Employees),
  // not independently choosable -- managers require a 6-digit PIN (see
  // lib/employee-auth.ts requiredPinLength).
  const newPinLength = defaultAccountType === "manager" ? 6 : 4;
  const [newRoleId, setNewRoleId] = useState("");
  const [saving, setSaving] = useState(false);

  const addAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !new RegExp(`^\\d{${newPinLength}}$`).test(newPin)) {
      showToast(`Enter a name and a ${newPinLength}-digit PIN`, "error");
      return;
    }
    setSaving(true);
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          pin: newPin,
          pinLength: newPinLength,
          accountType: defaultAccountType,
          roleId: newRoleId ? Number(newRoleId) : undefined,
        }),
      });
      setNewName("");
      setNewPin("");
      setNewRoleId("");
      showToast(`Added ${newName.trim()}`, "success");
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add account", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">{description}</p>

      <ul className="space-y-2 mb-4">
        {accounts.map((account) => (
          <li key={account.id} className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)]">
            {editingId === account.id ? (
              <AdminEmployeeEditRow
                account={account}
                roleOptions={roleOptions}
                onCancel={() => setEditingId(null)}
                onSave={(patch) => {
                  onUpdate(account.id, patch);
                  setEditingId(null);
                }}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {account.name}
                  {account.role_name && (
                    <span className="text-[var(--color-text-muted)] font-normal"> &middot; {account.role_name}</span>
                  )}
                  <span className="text-[var(--color-text-muted)] font-normal"> &middot; {account.pin_length}-digit PIN</span>
                </span>
                <div className="flex gap-2 shrink-0">
                  <Button type="button" variant="ghost" size="md" onClick={() => setEditingId(account.id)}>
                    <KeyRound size={16} />
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="md" onClick={() => onRemove(account.id, account.name)}>
                    <Trash2 size={16} />
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
        {accounts.length === 0 && <li className="text-sm text-[var(--color-text-muted)]">None yet.</li>}
      </ul>

      <form onSubmit={addAccount} className="flex flex-wrap items-end gap-2">
        <Input
          aria-label={`New ${defaultAccountType} name`}
          placeholder="Full name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 min-w-[10rem]"
        />
        <div className="w-36">
          <Input
            aria-label={`New ${defaultAccountType} PIN`}
            placeholder={`${newPinLength}-digit PIN`}
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, newPinLength))}
          />
          <StrengthMeter {...scorePinStrength(newPin, newPinLength)} empty={newPin.length === 0} />
        </div>
        <Select ariaLabel="Role label" value={newRoleId} options={roleOptions} onChange={setNewRoleId} />
        <Button type="submit" disabled={saving}>
          Add {defaultAccountType === "manager" ? "Manager" : "Employee"}
        </Button>
      </form>
    </Card>
  );
};

const AdminEmployeeEditRow: FC<{
  account: EmployeeRow;
  roleOptions: { value: string; label: string }[];
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}> = ({ account, roleOptions, onCancel, onSave }) => {
  const [name, setName] = useState(account.name);
  const [accountType, setAccountType] = useState<"manager" | "employee">(account.account_type);
  const [roleId, setRoleId] = useState(account.role_id ? String(account.role_id) : "");
  const [resetPin, setResetPin] = useState("");

  // PIN length is DERIVED from the currently-selected account type, not
  // independently choosable -- managers require a 6-digit PIN (see
  // lib/employee-auth.ts requiredPinLength). Promoting employee->manager
  // forces a PIN reset in the same save, matching the server's rejection of
  // a promotion that doesn't also fix the PIN length.
  const requiredLength = accountType === "manager" ? 6 : 4;
  const isPromotingToManager = accountType === "manager" && account.account_type !== "manager";
  const mustResetPin = isPromotingToManager || account.pin_length !== requiredLength;

  const save = () => {
    if (mustResetPin && !new RegExp(`^\\d{${requiredLength}}$`).test(resetPin)) return;
    const patch: Record<string, unknown> = { name, accountType, roleId: roleId ? Number(roleId) : null };
    if (resetPin) {
      patch.pin = resetPin;
      patch.pinLength = requiredLength;
    }
    onSave(patch);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input aria-label="Edit name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[8rem]" />
      <Select
        ariaLabel="Edit account type"
        value={accountType}
        options={[
          { value: "employee", label: "Employee (4-digit PIN)" },
          { value: "manager", label: "Manager (6-digit PIN)" },
        ]}
        onChange={(v) => {
          setAccountType(v);
          setResetPin("");
        }}
      />
      <Select ariaLabel="Edit role label" value={roleId} options={roleOptions} onChange={setRoleId} />
      <div className="w-48">
        <Input
          aria-label={mustResetPin ? `New ${requiredLength}-digit PIN (required)` : "Reset PIN (optional)"}
          placeholder={mustResetPin ? `New ${requiredLength}-digit PIN (required)` : "New PIN (optional)"}
          inputMode="numeric"
          value={resetPin}
          onChange={(e) => setResetPin(e.target.value.replace(/\D/g, "").slice(0, requiredLength))}
        />
        <StrengthMeter {...scorePinStrength(resetPin, requiredLength)} empty={resetPin.length === 0} />
      </div>
      <Button type="button" onClick={save} disabled={mustResetPin && resetPin.length !== requiredLength}>
        Save
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {isPromotingToManager && (
        <p className="text-xs text-[var(--color-text-muted)] w-full">
          Promoting to Manager requires setting a new 6-digit PIN.
        </p>
      )}
    </div>
  );
};

const RolesSection: FC<{
  roles: RoleRow[];
  restaurantName: string;
  onDelete: (id: number, name: string) => void;
  onCreated: () => void;
}> = ({ roles, restaurantName, onDelete, onCreated }) => {
  const showToast = useToast();
  const [newRoleName, setNewRoleName] = useState("");
  const [saving, setSaving] = useState(false);

  const addRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setSaving(true);
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoleName.trim() }),
      });
      setNewRoleName("");
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add role", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">Roles</h3>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">
        Custom display labels this kitchen can assign to Managers/Employees above. Cosmetic only -- no permission
        effect.
      </p>
      <ul className="space-y-2 mb-4">
        {roles.map((role) => (
          <li key={role.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)]">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{role.name}</span>
            <Button type="button" variant="ghost" size="md" onClick={() => onDelete(role.id, role.name)}>
              <Trash2 size={16} />
              Delete
            </Button>
          </li>
        ))}
        {roles.length === 0 && <li className="text-sm text-[var(--color-text-muted)]">No custom roles yet.</li>}
      </ul>
      <form onSubmit={addRole} className="flex flex-wrap items-end gap-2">
        <Input
          aria-label="New role name"
          placeholder="Role name (e.g. Chef)"
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          className="flex-1 min-w-[10rem]"
        />
        <Button type="submit" disabled={saving}>
          Add Role
        </Button>
      </form>
    </Card>
  );
};

export default function AdminStaffPage() {
  return (
    <ToastProvider>
      <AdminStaffContent />
    </ToastProvider>
  );
}
