"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Search, Home } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChefMascot } from "@/components/ui/ChefMascot";

/**
 * Not every visitor to a stray URL is on this PC — on the LAN, `/` is the
 * admin login gateway, which isn't useful to a kitchen or customer device
 * that mistyped a link. So "home" branches on hostname: `localhost` (this
 * machine) goes to `/`, anything else (a LAN IP) offers Kitchen/Customer
 * entry points instead of dropping a random device onto the admin login.
 */
export default function NotFound() {
  const router = useRouter();
  const [isLocalhost, setIsLocalhost] = useState<boolean | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    setIsLocalhost(host === "localhost" || host === "127.0.0.1");
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <main className="w-full max-w-md mx-auto">
        <Card className="p-6 sm:p-10 text-center">
          <div className="flex justify-center mb-2">
            <ChefMascot
              size={140}
              lines={[
                "This one's not on the menu.",
                "I looked everywhere. Nothing.",
                "404 — kitchen's confused too.",
                "That page wandered off somewhere.",
              ]}
            />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mt-2 mb-2">
            Page not found
          </h1>
          <p className="text-sm sm:text-base text-[var(--color-text-secondary)] mb-6">
            That page doesn&apos;t exist, or moved somewhere else.
          </p>

          {isLocalhost === null ? (
            <div className="h-11" aria-hidden="true" />
          ) : isLocalhost ? (
            <Button size="lg" className="w-full" onClick={() => router.push("/")}>
              <Home size={18} />
              Go home
            </Button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="flex-1" onClick={() => router.push("/restaurant/home")}>
                <ChefHat size={18} />
                Kitchen
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="flex-1"
                onClick={() => router.push("/customer")}
              >
                <Search size={18} />
                Track an Order
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
