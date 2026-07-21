"use client";

import { FC, FormEvent, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { Button } from "./Button";
import { Modal, ModalActions } from "./Modal";
import { Input, Label, Textarea } from "./Input";
import { useToast } from "./Toast";
import { fetchJson } from "@/lib/api-client";

/**
 * Self-contained "Report an Issue" entry point -- a button that opens a
 * Modal with a plain feedback form, POSTs to the public /api/issues route
 * (see that file's own comment: no auth required, same trust level as the
 * customer order-search endpoint), and shows a toast on success/failure.
 * Reviewed at /admin/issues (admin-only, see that page + api/dev/issues).
 *
 * Deliberately its own reusable component rather than inlined into
 * /help/errors -- reporting a bug is a useful affordance anywhere in the
 * app, not just the error-code reference page, so any future page can drop
 * this in without re-building the form/modal wiring.
 *
 * Requires a ToastProvider ancestor (useToast throws otherwise, same
 * requirement as every other toast-showing component in this app) -- the
 * caller is responsible for wrapping their page in one, same as
 * /admin/audit and /admin/issues already do for their own content.
 */
export const ReportIssueButton: FC<{ className?: string }> = ({ className }) => {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [context, setContext] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setOpen(false);
    setDescription("");
    setRestaurantName("");
    setContext("");
    setContact("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetchJson("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          restaurantName: restaurantName || undefined,
          context: context || undefined,
          contact: contact || undefined,
        }),
      });
      showToast("Thanks! Your report was submitted.", "success");
      close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to submit report", "error", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" className={className} onClick={() => setOpen(true)}>
        <MessageSquareWarning size={16} />
        Report an Issue
      </Button>

      <Modal isOpen={open} title="Report an Issue" onClose={close}>
        <form onSubmit={handleSubmit}>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Found a bug, or something feel off? Let us know below -- no need to sign in, and you don&rsquo;t have to
            share how to reach you unless you want us to follow up.
          </p>
          <div className="mb-4">
            <Label htmlFor="issue-restaurant">Kitchen name (optional)</Label>
            <Input
              id="issue-restaurant"
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Which kitchen is this about, if any?"
              maxLength={200}
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="issue-context">Where were you, or who was involved? (optional)</Label>
            <Input
              id="issue-context"
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. the kitchen dashboard, an employee's name, checking out an order..."
              maxLength={500}
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="issue-description">What happened?</Label>
            <Textarea
              id="issue-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue or what you'd like to see..."
              required
              maxLength={2000}
            />
          </div>
          <div className="mb-2">
            <Label htmlFor="issue-contact">How can we reach you? (optional)</Label>
            <Input
              id="issue-contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Email, phone, or however you'd like"
              maxLength={200}
            />
          </div>
          <ModalActions
            onCancel={close}
            onConfirm={() => void handleSubmit}
            confirmLabel={submitting ? "Submitting..." : "Submit Report"}
            confirmDisabled={submitting || !description.trim()}
            submit
          />
        </form>
      </Modal>
    </>
  );
};
