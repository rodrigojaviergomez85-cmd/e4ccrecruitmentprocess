/** Client-safe copy for the follow-up emails sent after an interview result. */

export const CALENDLY_SCHEDULE_URL = "https://calendly.com/teachingjobs4callcenters/schedule";

export type FollowUpKind = "retake" | "not_approved" | "approved" | "final_filter";
import type { FinalFilterDetails } from "./evaluations";

export function buildPreparationEmail(input: {
  fullName: string;
  interviewDate: string;
  interviewTime: string;
  timezone: string;
  modality: "online" | "onsite";
}) {
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim();
  const sampleClassUrl =
    input.modality === "online" ? RETAKE_LINKS.sampleClassOnline : RETAKE_LINKS.sampleClassOnsite;
  const subject = "Your E4CC Interview Is Confirmed — Preparation Steps";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p>Dear ${escapeHtml(firstName)},</p>
      <p>Your LIVE ZOOM INTERVIEW with the E4CC Recruitment Team has been successfully scheduled.</p>
      ${section("Interview Details", `<ul>
        <li><strong>Date:</strong> ${escapeHtml(input.interviewDate)}</li>
        <li><strong>Time:</strong> ${escapeHtml(input.interviewTime)}</li>
        <li><strong>Timezone:</strong> ${escapeHtml(input.timezone)}</li>
        <li><strong>Zoom Link:</strong> <a href="${RETAKE_LINKS.zoom}">${RETAKE_LINKS.zoom}</a></li>
      </ul><p>Please connect five to ten minutes before your scheduled time.</p>`)}
      ${section("Steps to Complete Before Your Interview", `
        <p><strong>1. Device Requirement</strong><br/>You must attend using a laptop or desktop computer with a working camera and microphone. Mobile phones are not allowed.</p>
        <p><strong>2. Complete the Grammar Test</strong><br/>Please complete the mandatory 12-minute Grammar Test before your interview:<br/><a href="${RETAKE_LINKS.grammarTest}">${RETAKE_LINKS.grammarTest}</a><br/>If you receive a TestGorilla email, please also check your Spam or Junk folder.</p>
        <p><strong>3. Review Grammar Tenses</strong><br/>Review the E4CC grammar material before your interview:<br/><a href="${RETAKE_LINKS.grammarTopicsGettingStarted}">${RETAKE_LINKS.grammarTopicsGettingStarted}</a><br/>During your interview, you may be asked to explain grammar tenses and verbs as if you were teaching a class.</p>
        <p><strong>4. Prepare a Sample Class</strong><br/><a href="${sampleClassUrl}">${input.modality === "online" ? "Online" : "Onsite"} Candidate Preparation Video</a><br/>Please be ready to teach a short sample class during your interview.</p>
        <p><strong>5. Resume and References</strong><br/>Please make sure your uploaded resume is updated and have valid work references available for your recent positions.</p>
      `)}
      <p>We look forward to meeting you!</p>
      <p>Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
  return { subject, html };
}

export const FOLLOW_UP_LABELS: Record<FollowUpKind, string> = {
  retake: "Retake invitation",
  not_approved: "Process closed",
  approved: "Approved — final filter",
  final_filter: "Final interview details",
};

/**
 * Fixed resource links for the official retake template.
 * Edit here when the recruitment team updates a link.
 */
export const RETAKE_LINKS = {
  interviewPrepTips: "https://youtu.be/9bPKeiEZhgo",
  grammarTopicsGettingStarted:
    "https://drive.google.com/file/d/1dTPBjAG9v4WZ-BRjr73AWgrKPb5dUoKW/view?usp=drive_link",
  grammarReinforcement: [
    ["Simple Present", "https://youtu.be/TTVZngDp7Vc"],
    ["Simple Future (Will)", "https://youtu.be/FWVka9ko6Fs"],
    ["Simple Future (Going To)", "https://youtu.be/nFIWTH9TDWA"],
    ["Simple Past", "https://youtu.be/_58ToSgbVkA"],
    ["ED Endings", "https://youtu.be/hZNBvBOSfss"],
    ["ED Endings (extra)", "https://youtu.be/AZEV1szwY7g"],
    ["Present Perfect", "https://youtu.be/-g8Xv6lKVxU"],
    ["Present Perfect Continuous", "https://youtu.be/NLXjbPNxpMA"],
    ["Modal Verbs", "https://youtu.be/OSqzmHaU3zQ"],
    ["Comparatives", "https://youtu.be/WPZ_js5cr9g"],
    ["Superlatives", "https://youtu.be/PDMLXbNHjYY"],
    ["Zero & First Conditional", "https://youtu.be/UPYrH1PF7gk"],
    ["Second Conditional", "https://youtu.be/1Q7Lupv4rjQ"],
    ["Past Perfect", "https://youtu.be/R97P1tmaYFs"],
    ["Past Progressive", "https://youtu.be/DzF-tVijWNk"],
    ["Simple Present (3rd Person)", "https://youtu.be/mFUB7q3MCTk"],
    ["Simple Present Questions", "https://youtu.be/9RkzLAA-SkE"],
    ["Simple Present vs Present Progressive", "https://youtu.be/ACto_VHJ4s0"],
    ["Verb To Be", "https://youtu.be/lq9DKEetZko"],
    ["Common Mistakes", "https://youtu.be/S7aYLtirRyg"],
    ["Prepositions of Time (In, At, On)", "https://youtu.be/3K5jlHw3o0c"],
    ["Contractions", "https://youtu.be/hyS-khex73A"],
    ["Gerunds vs Infinitives", "https://youtu.be/-s1gu725tA4"],
  ] as Array<[string, string]>,
  pronunciation: [
    ["R Sound", "https://youtu.be/9zS7dmNY7N0"],
    ["Th Sound", "https://youtu.be/KcGvj2tbvBo"],
    ["M, N & G Sounds", "https://youtu.be/QImKduLK_kk"],
    ["M, N & G Sounds (extra 1)", "https://youtu.be/20aCUvD9HkM"],
    ["M, N & G Sounds (extra 2)", "https://youtu.be/m5UkmmtFVnw"],
    ["Final Sounds", "https://youtu.be/nEUcZPdNfOk"],
    ["Intonation", "https://youtu.be/wbE1ae27AUA"],
    ["A Sound", "https://youtu.be/PAoGCAJhO8I"],
    ["E Sound", "https://youtu.be/8FpUUdgD3tg"],
    ["I Sound", "https://youtu.be/9RuMwRtfXqU"],
    ["O Sound", "https://youtu.be/KKlNtKDzxVU"],
    ["U Sound", "https://youtu.be/S8McPhkDT0c"],
    ["Simple Past Rules", "https://youtu.be/Ps-Vx1OXEQY"],
    ["Ch Sound", "https://youtu.be/zpGWfnyobws"],
    ["H Sound", "https://youtu.be/lzxT-OP9EPg"],
    ["J Sound", "https://youtu.be/TdEQrh-DwnQ"],
    ["L Sound", "https://youtu.be/U1C5cPG-MPw"],
    ["S & Z Sounds", "https://youtu.be/Dy2CoQ3N4Tc"],
    ["Sh Sound", "https://youtu.be/zNKjAC-7CYE"],
    ["V & F Sounds", "https://youtu.be/SxmyxifDXNw"],
    ["W Sound", "https://youtu.be/AzD_CN1gzTI"],
    ["Y Sound", "https://youtu.be/fBbK7qQga7k"],
    ["Final Tips", "https://youtu.be/s5R_X_Kbc1o"],
  ] as Array<[string, string]>,
  grammarTopicsReview:
    "https://drive.google.com/file/d/1307-D5PsWy6crpyXyUCBXQM59w4aBs9P/view?usp=sharing",
  sampleClassOnline: "https://youtu.be/9-YaNY1K_qs?si=TiE0yAib_c3UrhiM",
  sampleClassOnsite: "https://youtu.be/TrrbSmQAOuU?si=5meUTy_NHhbhaoas",
  personalInfoForm:
    "https://docs.google.com/forms/d/e/1FAIpQLSfc4RtAq7qeNMUXyS4jrlOmjE-H4GZ3cDGk6ZQOeORIDMaZBA/viewform",
  grammarTest: "https://app.testgorilla.com/s/bnm9wczd",
  zoom: "https://zoom.us/j/97824770369",
  nextInterviewTiming: "2 MONTHS FROM NOW",
};

function formatRetakeDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

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

function linkList(items: Array<[string, string]>) {
  return items
    .map(
      ([label, url]) =>
        `<li style="margin:0 0 4px"><a href="${url}" style="color:#0f766e">${escapeHtml(label)}</a></li>`,
    )
    .join("");
}

function section(title: string, inner: string) {
  return `
    <h3 style="margin:20px 0 8px;font-size:14px;color:#0f766e">${title}</h3>
    ${inner}`;
}

/**
 * Official E4CC retake template. Fixed wording and resources; only the
 * candidate's first name, the feedback area and the scheduling link change.
 */
function buildRetakeEmail(input: { fullName: string; areas: string; scheduleUrl: string; retakeDate?: string | null }) {
  const name = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim();
  const areas = input.areas.trim() || "General interview performance";
  const L = RETAKE_LINKS;
  const link = input.scheduleUrl;

  const subject = "E4CC — Your interview results and next steps";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px">
        I trust this message finds you well. Thank you for your recent interview with
        English4CallCenters (E4CC). We appreciate the opportunity to learn more about your
        qualifications and your potential fit for our team.
      </p>
      <p style="margin:0 0 12px">
        Following your interview, we would like to provide you with some constructive
        feedback to help enhance your application. Please note that this feedback is intended
        to support your continued growth and development.
      </p>
      <p style="margin:0 0 6px"><strong>Area of opportunity:</strong></p>
      ${paragraphs(areas)}
      ${section(
        "Grammar &amp; Pronunciation Resources",
        `<p style="margin:0 0 8px">To assist you in addressing these areas, please take some time to review the following materials:</p>`,
      )}
      ${section(
        "Getting Started",
        `<ul style="margin:0 0 8px;padding-left:20px">
          <li style="margin:0 0 4px"><a href="${L.interviewPrepTips}" style="color:#0f766e">Interview Prep Tips</a></li>
          <li style="margin:0 0 4px"><a href="${L.grammarTopicsGettingStarted}" style="color:#0f766e">Grammar Topics Document</a></li>
        </ul>`,
      )}
      ${section("Grammar Reinforcement", `<ul style="margin:0 0 8px;padding-left:20px">${linkList(L.grammarReinforcement)}</ul>`)}
      ${section("Pronunciation Lessons", `<ul style="margin:0 0 8px;padding-left:20px">${linkList(L.pronunciation)}</ul>`)}
      ${section(
        "Before Your Next Interview",
        `<p style="margin:0 0 8px">Please complete the following before your next session:</p>
        <ul style="margin:0 0 8px;padding-left:20px">
          <li style="margin:0 0 4px"><a href="${L.grammarTopicsReview}" style="color:#0f766e">Review Grammar Topics</a></li>
          <li style="margin:0 0 4px">Prepare to Teach a Sample Class —
            <a href="${L.sampleClassOnline}" style="color:#0f766e">Online Candidates</a> ·
            <a href="${L.sampleClassOnsite}" style="color:#0f766e">Onsite Candidates</a>
          </li>
          <li style="margin:0 0 4px"><a href="${L.personalInfoForm}" style="color:#0f766e">Send us your personal information and resume adding job references (1 per job performed)</a></li>
          <li style="margin:0 0 4px">If you have not completed the GRAMMAR TEST, complete it here:
            <a href="${L.grammarTest}" style="color:#0f766e">Test Link</a>
            (You will receive an email from TestGorilla. Check your Spam folder if needed. The test takes ~12 minutes.)
          </li>
        </ul>`,
      )}
      ${section(
        "Next Interview Details",
        `<p style="margin:0 0 8px"><strong>${escapeHtml(input.retakeDate ? `Available starting ${formatRetakeDate(input.retakeDate)}` : L.nextInterviewTiming)}</strong></p>
        <p style="margin:0 0 8px">Zoom Link: <a href="${L.zoom}" style="color:#0f766e">${L.zoom}</a></p>
        <p style="margin:0 0 16px">
          <a href="${link}" style="background:#0f766e;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none">
            Schedule my retake interview
          </a>
        </p>
        <p style="margin:0 0 12px">If the button does not work, copy this link: ${escapeHtml(link)}</p>`,
      )}
      <p style="margin:0 0 12px">
        We appreciate your interest in the Coach position and look forward to seeing how you
        integrate this feedback into your next interview.
      </p>
      <p style="margin:0">Best regards,<br/>Recruitment Team<br/>E4CC</p>
    </div>`;
  return { subject, html, scheduleUrl: link };
}

/**
 * The wording of both templates is fixed; only the candidate name and the area
 * of opportunity change from one interview to the next.
 */
function ffPlace(ff: FinalFilterDetails) {
  if (ff.link)
    return `<li><strong>Join Interview:</strong> <a href="${escapeHtml(ff.link)}">${escapeHtml(ff.link)}</a></li>`;
  if (ff.location) return `<li><strong>Location:</strong> ${escapeHtml(ff.location)}</li>`;
  return "";
}

export function buildFollowUpEmail(input: {
  kind: FollowUpKind;
  fullName: string;
  areas: string;
  reasons?: string[];
  scheduleUrl?: string | null;
  eligibleAgainDate?: string | null;
  finalFilter?: FinalFilterDetails | null;
}) {
  const name = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim();


  if (input.kind === "retake") {
    const link = input.scheduleUrl || CALENDLY_SCHEDULE_URL;
    return buildRetakeEmail({ fullName: input.fullName, areas: input.areas, scheduleUrl: link, retakeDate: input.eligibleAgainDate ?? null });
  }

  if (input.kind === "final_filter" && input.finalFilter) {
    const ff = input.finalFilter;
    const subject = "Your E4CC final interview details";
    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px">Your final interview with our <strong>Country Manager</strong> has been scheduled.</p>
      <p style="margin:0 0 8px"><strong>Your final interview details:</strong></p>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li><strong>Date:</strong> ${escapeHtml(ff.date)}</li>
        <li><strong>Time:</strong> ${escapeHtml(ff.time)}</li>
        <li><strong>Interviewer:</strong> ${escapeHtml(ff.interviewer)}</li>
        ${ffPlace(ff)}
      </ul>
      <p style="margin:0 0 12px">Please join the interview on time and keep your phone nearby, as we may contact you via WhatsApp. If you experience any difficulties connecting, please let us know as soon as possible.</p>
      <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
    return { subject, html, scheduleUrl: null };
  }

  if (input.kind === "approved") {
    const ff = input.finalFilter;
    const subject = "Congratulations — You moved forward in the E4CC process";
    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px">
        Congratulations! We are glad to inform you that you successfully passed your interview
        with the E4CC Recruitment Team.
      </p>
      <p style="margin:0 0 12px">
        You have advanced to the <strong>last filter of our selection process</strong>, a final
        interview with our <strong>Country Manager</strong>.
      </p>
      ${ff ? `
      <p style="margin:0 0 8px"><strong>Your final interview details:</strong></p>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li><strong>Date:</strong> ${escapeHtml(ff.date)}</li>
        <li><strong>Time:</strong> ${escapeHtml(ff.time)}</li>
        <li><strong>Interviewer:</strong> ${escapeHtml(ff.interviewer)}</li>
        ${ffPlace(ff)}
      </ul>
      <p style="margin:0 0 12px">Please join the interview on time and keep your phone nearby, as we may contact you via WhatsApp. If you experience any difficulties connecting, please let us know as soon as possible.</p>` : `
      <p style="margin:0 0 12px">
        Please keep your phone nearby, as we may contact you via WhatsApp to coordinate this final
        step. If you experience any difficulties connecting, please let us know as soon as possible.
      </p>`}
      <p style="margin:0 0 12px">Thank you for your time and effort throughout the process.</p>
      <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
    return { subject, html, scheduleUrl: null };
  }

  // Privacy rule: only these reasons may be shared with the candidate. Any other
  // reason (Overage, Other, red flags, critical motives) gets the general letter
  // with no hint of the internal motive. Evaluator comments are never included.
  const shareable: Record<string, string> = {
    "No English level":
      "We encourage you to keep strengthening your English level before applying again.",
    "No grammar knowledge":
      "We encourage you to keep strengthening your grammar knowledge before applying again.",
    "No equipment or technical requirements":
      "Please make sure you meet the equipment and technical requirements before applying again.",
  };
  const improvement = (input.reasons ?? [])
    .map((r) => shareable[r.trim()])
    .filter((v): v is string => Boolean(v));

  const subject = "Thank you for interviewing with E4CC";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px">
        Thank you for taking the time to interview with English4CallCenters (E4CC). We truly
        appreciate your interest in joining our team and the opportunity to learn more about
        your experience.
      </p>
      <p style="margin:0 0 12px">
        After careful consideration, we have decided not to move forward with your application
        at this time.
      </p>
      ${
        improvement.length
          ? `<p style="margin:0 0 6px"><strong>Area of improvement:</strong></p>
      <ul style="margin:0 0 12px;padding-left:20px">${improvement
        .map((t) => `<li style="margin:0 0 4px">${escapeHtml(t)}</li>`)
        .join("")}</ul>`
          : ""
      }
      ${
        input.eligibleAgainDate
          ? `<p style="margin:0 0 12px">You are welcome to apply with us again starting <strong>${escapeHtml(input.eligibleAgainDate)}</strong>.</p>`
          : ""
      }
      <p style="margin:0 0 12px">
        Thank you again for considering E4CC. We appreciate the time you invested in our
        recruitment process and wish you success in your professional journey.
      </p>
      <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
  return { subject, html, scheduleUrl: null };

}

/** Sent when a candidate missed the final interview with the Country Manager. */
export function buildNoShowEmail(input: { fullName: string; responseUrl: string }) {
  const name = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim();
  const subject = "We missed you at your E4CC final interview";
  const url = escapeHtml(input.responseUrl);
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 18px;border-radius:6px;background:${bg};color:#ffffff;text-decoration:none;font-weight:bold">${label}</a>`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px">We were expecting you at your final interview with our Country Manager, but we were not able to connect with you.</p>
      <p style="margin:0 0 16px">Please choose one of the options below:</p>
      <p>${btn(`${url}?action=reschedule`, "Reschedule My Interview", "#ea580c")}${btn(`${url}?action=withdraw`, "I Don’t Want to Continue", "#1e3a5f")}</p>
      <p style="margin:16px 0 12px;font-size:12px;color:#6b7280">This link is personal and expires in 14 days.</p>
      <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
  return { subject, html };
}

/**
 * Retake decided at the Manager final filter. Shares only the areas to improve
 * and the eligible date; the link returns the candidate to the Manager stage.
 */
export function buildManagerRetakeEmail(input: {
  fullName: string;
  areas: string;
  eligibleAgainDate: string | null;
  responseUrl: string;
}) {
  const name = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim();
  const subject = "Your E4CC final interview — next steps";
  const url = escapeHtml(`${input.responseUrl}?action=reschedule`);
  const date = input.eligibleAgainDate
    ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(
        new Date(`${input.eligibleAgainDate}T00:00:00Z`),
      )
    : null;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
      <p style="margin:0 0 12px">Thank you for attending your final interview with our Country Manager.</p>
      <p style="margin:0 0 12px">We would like to give you another opportunity to complete this final step once you have worked on the following:</p>
      ${input.areas.trim() ? `<p style="margin:0 0 12px"><strong>${escapeHtml(input.areas.trim())}</strong></p>` : ""}
      <p style="margin:0 0 6px"><strong>Preparation materials:</strong></p>
      <ul style="margin:0 0 12px;padding-left:20px">
        <li><a href="${RETAKE_LINKS.grammarTopicsGettingStarted}" style="color:#0f766e">Grammar Topics Document</a></li>
        <li><a href="${RETAKE_LINKS.interviewPrepTips}" style="color:#0f766e">Interview preparation tips</a></li>
      </ul>
      ${date ? `<p style="margin:0 0 12px">You can schedule your new final interview starting <strong>${escapeHtml(date)}</strong>.</p>` : ""}
      <p style="margin:0 0 16px"><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:bold">Schedule my final interview</a></p>
      <p style="margin:0 0 12px">If the button does not work, copy this link: ${url}</p>
      <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
  return { subject, html };
}


/**
 * Official E4CC documentation required for Training, per country code.
 * A country without an entry blocks the welcome email until a Manager reviews it.
 */
export type TrainingDocs = { items: string[]; links: { label: string; url: string }[]; note?: string };
export const TRAINING_DOCUMENTS_BY_COUNTRY: Record<string, TrainingDocs> = {
  SV: {
    items: ["DUI, both sides", "High school diploma (Título de Bachillerato)", "Criminal record (Antecedentes Penales)", "Police clearance (Solvencia Policial)"],
    links: [{ label: "simple.sv", url: "https://simple.sv/" }],
  },
  GT: {
    items: [
      "DPI, both sides",
      "Secondary education diploma (Título de nivel medio)",
      "RTU",
      "Police record (Antecedentes Policíacos)",
      "Judicial record (Antecedentes Judiciales)",
      "RENAS",
      "Agreement: read it, sign it through DocuSign and upload it once it is provided to you",
    ],
    links: [
      { label: "RENAS", url: "https://consultasmp.mp.gob.gt/constanciaIndividual/index.html?q=" },
      { label: "Antecedentes Policíacos", url: "https://policiales.pnc.gob.gt/" },
      { label: "Antecedentes Judiciales", url: "https://portal.oj.gob.gt/oauth/3/login" },
    ],
    note: "The agreement will be shared with you separately.",
  },
  NI: {
    items: ["Cédula, both sides", "High school diploma (Título de Bachillerato)", "Health certificate (Certificado de Salud)", "Conduct certificate (Certificado de Conducta)"],
    links: [{ label: "Policía Nacional — trámites en línea", url: "https://tramitesenlinea.policia.gob.ni/" }],
  },
  HN: {
    items: ["Identity card (Tarjeta de Identidad), both sides", "High school diploma (Título de Bachillerato)", "PayPal link", "Criminal record (Antecedentes Penales)", "Police clearance (Solvencia Policial)", "Curriculum Vitae"],
    links: [],
  },
  CO: {
    items: ["Cédula, both sides", "High school diploma (Título de Bachillerato)", "Police record (Antecedentes Policiales)", "Judicial record (Antecedentes Judiciales)", "PayPal link"],
    links: [],
  },
  MX: {
    items: ["Voter ID (Credencial para Votar — INE)", "High school diploma (Título de Bachillerato)", "Certificate of no criminal record (Constancia de No Antecedentes Penales)", "PayPal link"],
    links: [{ label: "Mexico City (CDMX) only — Constancia de No Antecedentes Penales", url: "https://www.cdmx.gob.mx/public/InformacionTramite.xhtml?idTramite=872" }],
  },
  CR: {
    items: ["ID / Cédula, both sides", "High school diploma (Título de Bachillerato)", "Wise or PayPal link", "Criminal record (Antecedentes Penales)", "Curriculum Vitae"],
    links: [],
  },
};
export function trainingDocsFor(countryCode: string | null | undefined): TrainingDocs | null {
  const d = TRAINING_DOCUMENTS_BY_COUNTRY[(countryCode ?? "").toUpperCase()];
  return d && d.items.length ? d : null;
}
export const TRAINING_DOCUMENTS_UPLOAD_URL = "https://forms.gle/WCSE7TwHBTfTffFa6";

/** Welcome to Training — sent once when the Manager approves the candidate. */
export function buildTrainingWelcomeEmail(input: {
  fullName: string;
  countryCode: string | null;
  isOnline: boolean;
  startDate: string;
  schedule: string;
  timezone?: string;
  trainer: string;
  trainerContact: string;
  branch?: string;
  address?: string;
  zoom?: string;
}) {
  const e = escapeHtml;
  const name = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate)
    ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${input.startDate}T00:00:00Z`))
    : input.startDate;
  const docSet = trainingDocsFor(input.countryCode);
  const docs = docSet?.items ?? [];
  const link = (label: string) => {
    const hit = RETAKE_LINKS.grammarReinforcement.find(([l]) => l.toLowerCase().startsWith(label.toLowerCase()));
    return hit ? `<a href="${hit[1]}" style="color:#0f766e">${e(label)}</a>` : e(label);
  };
  const subject = "Welcome to E4CC Training";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">
      <p style="margin:0 0 12px">Dear ${e(name)},</p>
      <p style="margin:0 0 12px">Congratulations! You have been approved to join the E4CC Training. We are happy to welcome you.</p>
      <p style="margin:0 0 6px"><strong>Training details</strong></p>
      <ul style="margin:0 0 12px;padding-left:20px">
        <li><strong>Start date:</strong> ${e(date)}</li>
        <li><strong>Schedule:</strong> ${e(input.schedule)}${input.timezone ? ` (${e(input.timezone)})` : ""}</li>
        <li><strong>Trainer:</strong> ${e(input.trainer)} — ${e(input.trainerContact)}</li>
        ${input.isOnline
          ? `<li><strong>Zoom:</strong> <a href="${e(input.zoom ?? "")}">${e(input.zoom ?? "")}</a></li>`
          : `<li><strong>Branch:</strong> ${e(input.branch ?? "")}</li>`}
      </ul>
      <p style="margin:0 0 6px"><strong>Please bring / prepare</strong></p>
      <ul style="margin:0 0 12px;padding-left:20px">
        <li>Be on time.</li>
        <li>A pen and a notebook.</li>
        ${input.isOnline ? "<li>A computer, good lighting and a quiet environment with little noise.</li>" : ""}
      </ul>
      <p style="margin:0 0 6px"><strong>Preparation materials already provided</strong></p>
      <ul style="margin:0 0 12px;padding-left:20px">
        <li>WH Questions</li>
        <li>${link("Prepositions")}</li>
        <li>${link("Present Perfect")}</li>
        <li>${link("ED Endings").replace("ED Endings", "ED Sounds")}</li>
      </ul>
      <p style="margin:0 0 12px">This material will be evaluated on your first day of Training.</p>
      <p style="margin:0 0 6px"><strong>Documentation</strong></p>
      ${docs.length ? `<ul style="margin:0 0 12px;padding-left:20px">${docs.map((d) => `<li>${e(d)}</li>`).join("")}</ul>` : ""}
      ${docSet?.links.length ? `<p style="margin:0 0 6px">Useful links:</p><ul style="margin:0 0 12px;padding-left:20px">${docSet.links.map((l) => `<li><a href="${e(l.url)}" style="color:#0f766e">${e(l.label)}</a></li>`).join("")}</ul>` : ""}
      ${docSet?.note ? `<p style="margin:0 0 12px">${e(docSet.note)}</p>` : ""}
      <p style="margin:0 0 12px">Please upload your documents before training begins or on Day 1. If any documents are still pending, contact your Trainer to establish an action plan. All required documents must be submitted no later than Day 5 of training.</p>
      <p style="margin:0 0 16px"><a href="${TRAINING_DOCUMENTS_UPLOAD_URL}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Upload My Documents</a></p>
      <p style="margin:0">Best regards,<br/>E4CC Recruitment Team</p>
    </div>`;
  return { subject, html, requestedDocuments: docs };
}
