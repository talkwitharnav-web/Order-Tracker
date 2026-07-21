import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireString, parseJsonBody } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { errJson, plainJson } from "@/lib/error-response";
import { broadcastIssueReported } from "@/lib/ws-hub";

/**
 * Public, anonymous "Report an Issue" submission -- reachable from
 * /help/errors's report button by any kitchen staff/customer, no auth
 * required, same trust level as /api/orders/search. Reviewed at
 * /admin/issues (admin-only, see api/dev/issues/route.ts). Deliberately NOT
 * tied to any restaurant/order/session -- a reporter may not even be logged
 * in, and the report is about the app itself, not a specific row that could
 * later be deleted out from under it.
 *
 * `description` is the only required field (a real report needs SOMETHING
 * to say); `context` (what page/what they were doing) and `contact` (how to
 * reach them back) are both optional so reporting a bug never requires
 * identifying yourself. Uses requireString (not requireSafeName) since this
 * is free-text feedback, not a display name stored/rendered as one -- see
 * validate.ts's own distinction. React's JSX auto-escaping on /admin/issues'
 * render is what actually protects against a submitted `<script>` acting as
 * markup, same as every other free-text field in this app (order search,
 * passwords) that also uses requireString instead of the display-name
 * whitelist.
 */
export async function POST(req: Request) {
  logger.info("POST /api/issues - request received");

  // Deliberately low ceiling -- this is a low-frequency human action
  // (submitting a report), not autocomplete-as-you-type, so a tight cap
  // doesn't cost a real reporter anything while still stopping the form
  // from being spammed.
  if (!checkRateLimit(`issues-report:${getClientIp(req)}`, { windowMs: 60_000, maxAttempts: 10 })) {
    return errJson("RATE_LIMITED_ISSUES", 429);
  }

  try {
    await initDb();

    const body = await parseJsonBody(req);
    const description = requireString((body as { description?: unknown } | null)?.description, 2000);
    const restaurantName = requireString((body as { restaurantName?: unknown } | null)?.restaurantName, 200);
    const context = requireString((body as { context?: unknown } | null)?.context, 500);
    const contact = requireString((body as { contact?: unknown } | null)?.contact, 200);

    if (!description) {
      return plainJson("Please describe the issue before submitting", 400);
    }

    // restaurant_name is plain free text, NOT validated/looked up against a
    // live restaurants row (see db.ts's table comment) -- a report about a
    // misspelled, renamed, or already-deleted kitchen name should still be
    // captured, not rejected or silently dropped.
    await query(
      "INSERT INTO reported_issues (description, restaurant_name, context, contact) VALUES ($1, $2, $3, $4)",
      [description, restaurantName, context, contact],
    );

    // Pushes /admin/issues a live update the instant this lands -- see
    // ws-hub.ts's broadcastIssueReported() comment for why this is safe to
    // call unconditionally from a public route (admin-only delivery).
    broadcastIssueReported();

    return NextResponse.json({ message: "Thanks! Your report was submitted." });
  } catch (err) {
    logger.error("POST /api/issues - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
