"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/ui/AuthCard";
import { PinPad, type VerifiedPinIdentity } from "@/components/ui/PinPad";
import { fetchJson } from "@/lib/api-client";
import { EMPLOYEE_SESSION_KEY, type EmployeeSession } from "@/lib/employee-session";

type EmployeeApiRow = { id: number };

async function getSession() {
  try {
    return await fetchJson<{ restaurant: { name: string } | null }>("/api/session");
  } catch {
    return { restaurant: null };
  }
}

async function getEmployeeCount(restaurantName: string) {
  try {
    const data = await fetchJson<{ employees: EmployeeApiRow[] }>(
      `/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees`,
    );
    return data.employees.length;
  } catch {
    // Fail-safe: if the roster can't be checked, don't strand the kitchen on
    // a sign-in screen it may not even need -- let restauranthome's own
    // (re-checked) gate handle it instead of guessing here.
    return 0;
  }
}

async function verifyPin(restaurantName: string, pin: string, pinLength: 4 | 6) {
  try {
    const data = await fetchJson<{ employee: VerifiedPinIdentity }>(
      `/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees/verify-pin`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, pinLength }),
      },
      { retries: 0 },
    );
    return data.employee;
  } catch {
    return null;
  }
}

/**
 * One-time employee/manager sign-in, shown once per kitchen dashboard
 * session (not remembered across "Remember Me" -- that only covers the
 * kitchen's own login, see restauranthome/page.tsx). Every order action for
 * the rest of the session is attributed to whoever signs in here, with no
 * further per-action PIN prompt -- see lib/employee-session.ts for the
 * sessionStorage contract this writes into.
 */
export default function StaffLoginPage() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getSession().then(async (session) => {
      if (!session.restaurant) {
        router.replace("/restaurant/home");
        return;
      }
      const name = session.restaurant.name;
      const employeeCount = await getEmployeeCount(name);
      if (employeeCount === 0) {
        // Nothing to sign into -- a kitchen with no roster configured keeps
        // operating fully unattributed, exactly as before this feature.
        router.replace("/restaurant/restauranthome");
        return;
      }
      setRestaurantName(name);
      setChecking(false);
    });
  }, [router]);

  if (checking || !restaurantName) return (
    <div className="min-h-dvh flex items-center justify-center">
      <p className="text-[var(--color-text-muted)] text-sm">Loading...</p>
    </div>
  );

  return (
    <div className="content-fade-in">
      <AuthCard title="Staff Sign-In" onSubmit={(e) => e.preventDefault()}>
        <p className="text-center text-sm text-[var(--color-text-secondary)]">
          Enter your PIN to sign in for this shift. You&apos;ll stay signed in until you tap Logout Staff or close
          the browser.
        </p>
      </AuthCard>
      <PinPad
        isOpen
        onClose={() => router.push("/restaurant/home")}
        onVerify={(pin, pinLength) => verifyPin(restaurantName, pin, pinLength)}
        onVerified={(employee, pin) => {
          const session: EmployeeSession = {
            employeeId: employee.id,
            name: employee.name,
            accountType: employee.accountType,
            pinLength: (pin.length === 6 ? 6 : 4) as 4 | 6,
            restaurantName,
          };
          try {
            sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
          } catch {
            // sessionStorage can throw in private/sandboxed contexts -- the
            // sign-in still succeeded server-side, just won't persist across
            // navigation; proceeding is better than blocking the shift.
          }
          router.replace("/restaurant/restauranthome");
        }}
      />
    </div>
  );
}
