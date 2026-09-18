/** Client-safe copy for the follow-up emails sent after an interview result. */

export const CALENDLY_SCHEDULE_URL = "https://calendly.com/teachingjobs4callcenters/schedule";

export type FollowUpKind = "retake" | "not_approved";

export const FOLLOW_UP_LABELS: Record<FollowUpKind, string> = {
  retake: "Retake invitation",
  not_approved: "Process closed",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join("");
}

/**
 * The wording of both templates is fixed; only the candidate name and the area
 * of opportunity change from one interview to the next.
 */
export function buildFollowUpEmail(input: {
  kind: FollowUpKind;
  fullName: string;
  areas: string;
  scheduleUrl?: string | null;
}) {
  const name = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim();
  const areas = input.areas.trim() || "General interview performance";

  if (input.kind === "retake") {
    const link = input.scheduleUrl || CALENDLY_SCHEDULE_URL;
    const subject = "E4CC — Your interview results and next steps";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
        <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 12px">
          Thank you for taking the time to interview with English4Call Centers. We enjoyed
          getting to know you and we would like to give you a second opportunity to show us
          your potential.
        </p>
        <p style="margin:0 0 6px"><strong>Area of opportunity to work on:</strong></p>
        ${paragraphs(areas)}
        <p style="margin:0 0 12px">
          Please practice this area and book your retake interview using the link below:
        </p>
        <p style="margin:0 0 16px">
          <a href="${link}" style="background:#0f766e;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none">
            Schedule my retake interview
          </a>
        </p>
        <p style="margin:0 0 12px">If the button does not work, copy this link: ${escapeHtml(link)}</p>
        <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
      </div>`;
    return { subject, html, scheduleUrl: link };
  }

  const subject = "E4CC — Update on your application";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px">
        Thank you for your interest in English4Call Centers and for the time you shared with
        us during your interview. After reviewing your evaluation, we will not be moving
        forward with your application at this time.
      </p>
      <p style="margin:0 0 6px"><strong>Area of opportunity:</strong></p>
      ${paragraphs(areas)}
      <p style="margin:0 0 12px">
        We encourage you to keep strengthening this area. We truly appreciate your effort and
        wish you the best in your professional journey.
      </p>
      <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
  return { subject, html, scheduleUrl: null };
}
