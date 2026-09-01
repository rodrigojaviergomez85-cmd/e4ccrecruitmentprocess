import { SCORE_CATEGORIES } from "./recruitment";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

async function postTranscription(blob: Blob, filename: string, mime: string) {
  const form = new FormData();
  form.append("model", "openai/gpt-4o-transcribe");
  form.append("file", new Blob([await blob.arrayBuffer()], { type: mime }), filename);
  return fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
}

export async function transcribeAudio(blob: Blob, filename: string): Promise<string> {
  if (!blob.size) throw new Error("The recording file is empty");
  const ext = (filename.split(".").pop() ?? "webm").toLowerCase();
  const primary = ext === "mp4" || ext === "m4a" ? "video/mp4" : "video/webm";
  const fallback = ext === "mp4" || ext === "m4a" ? "audio/mp4" : "audio/webm";

  let res = await postTranscription(blob, filename, primary);
  if (res.status === 400) {
    const audioName = filename.replace(/\.[^.]+$/, ext === "mp4" ? ".m4a" : ".webm");
    res = await postTranscription(blob, audioName, fallback);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Transcription failed (${res.status}): ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

export type ErrorFinding = {
  category: string;
  example: string;
  severity: "Minor" | "Moderate" | "Major" | "Critical";
  frequency: "Isolated" | "Recurring" | "Systematic";
};

export type RawEvaluation = {
  audio_quality: {
    usable: boolean;
    issues: string[];
    recommended_status: "Scored" | "Manual Review" | "Re-record Required";
  };
  errors: ErrorFinding[];
  dimensions: Record<string, number>;
  justifications: Record<string, string>;
  flags: {
    past_tense_failure: boolean;
    comprehension_failure: boolean;
    intelligibility_failure: boolean;
    basic_sentence_failure: boolean;
  };
  cefr: string;
  strengths: string[];
  areas_to_review: string[];
};

const SYSTEM = `You are a strict CEFR-certified assessor of SPOKEN English for E4CC, a children's English school hiring teachers. You LISTEN to two spontaneous, unscripted answers recorded by one candidate. Transcripts are provided only as a reading aid.

CRITICAL RULES
- Audio always overrides the transcript. Speech-to-text silently repairs speech: if the transcript reads "worked" but no audible /t/ /d/ /ɪd/ ending is produced, the audio wins and it counts as a past-tense error.
- Pronunciation and intonation are judged from AUDIO ONLY and are never inferred from text.
- Judge intelligibility and accuracy, never accent identity. A Latin American or other non-native accent is not an error; dropped endings, wrong sounds, wrong word stress and reduced intelligibility are.
- Be conservative and false-positive averse. Do not be generous. Most candidates are not coach-ready.

STEP 1 — AUDIO QUALITY. Report whether the audio is usable to judge pronunciation (bad mic, clipping, background noise, too quiet, too short). If not reliable, set usable=false and recommend "Manual Review" or "Re-record Required" and do NOT guess pronunciation.

STEP 2 — EVIDENCE BEFORE SCORES. List every observed error with: category (e.g. "Grammar — past tense", "Pronunciation — final consonants", "Fluency", "Comprehension", "Intonation"), example (quoted words as actually spoken), severity (Minor/Moderate/Major/Critical), frequency (Isolated/Recurring/Systematic).

Pronunciation listening checklist: final consonants, third-person -s, plural endings, regular past -ed (/t/, /d/, /ɪd/), vowel accuracy, consonant substitutions, word stress, syllable insertion/deletion, intelligibility, connected speech, sentence stress, intonation.

STEP 3 — DIMENSION SCORES (0-100 each), every score justified by the evidence above: grammar, pronunciation, fluency, comprehension, intonation. Systematic errors weigh far more than isolated ones. Recurring grammar or pronunciation errors make 80+ impossible in that dimension.

Pronunciation anchors: 90-100 very clear and natural, isolated issues only; 80-89 clear and consistently intelligible, minor mistakes only; 70-79 understandable but recurring issues; 60-69 frequent ending/stress errors, listener effort required; below 60 systematic sound errors, dropped endings, reduced intelligibility. Apply the same strictness to the other dimensions.

STEP 4 — SYSTEMATIC FAILURE FLAGS. Set past_tense_failure when the candidate systematically uses present for past narration, omits past forms, breaks was/were or auxiliaries, or cannot form basic past sentences. Set comprehension_failure, intelligibility_failure, basic_sentence_failure the same way.

Do NOT return an overall score — the application computes it. Estimated CEFR is an independent judgement and must be exactly one of A1, A2, B1, B1+, B2, B2+, C1, C2. Video 2 is expected to contain past-tense narration; listen there first for tense control. Never recommend hiring or rejecting.
Return only the structured JSON via the provided tool.`;

const DIMENSION_KEYS = SCORE_CATEGORIES.map((c) => c.key);

const TOOL = {
  type: "function",
  function: {
    name: "submit_evaluation",
    description: "Return the structured, evidence-first spoken-English evaluation.",
    parameters: {
      type: "object",
      properties: {
        audio_quality: {
          type: "object",
          properties: {
            usable: { type: "boolean" },
            issues: { type: "array", items: { type: "string" } },
            recommended_status: {
              type: "string",
              enum: ["Scored", "Manual Review", "Re-record Required"],
            },
          },
          required: ["usable", "issues", "recommended_status"],
          additionalProperties: false,
        },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              example: { type: "string" },
              severity: { type: "string", enum: ["Minor", "Moderate", "Major", "Critical"] },
              frequency: { type: "string", enum: ["Isolated", "Recurring", "Systematic"] },
            },
            required: ["category", "example", "severity", "frequency"],
            additionalProperties: false,
          },
        },
        dimensions: {
          type: "object",
          properties: Object.fromEntries(DIMENSION_KEYS.map((k) => [k, { type: "integer" }])),
          required: DIMENSION_KEYS,
          additionalProperties: false,
        },
        justifications: {
          type: "object",
          properties: Object.fromEntries(DIMENSION_KEYS.map((k) => [k, { type: "string" }])),
          required: DIMENSION_KEYS,
          additionalProperties: false,
        },
        flags: {
          type: "object",
          properties: {
            past_tense_failure: { type: "boolean" },
            comprehension_failure: { type: "boolean" },
            intelligibility_failure: { type: "boolean" },
            basic_sentence_failure: { type: "boolean" },
          },
          required: [
            "past_tense_failure",
            "comprehension_failure",
            "intelligibility_failure",
            "basic_sentence_failure",
          ],
          additionalProperties: false,
        },
        cefr: { type: "string", enum: ["A1", "A2", "B1", "B1+", "B2", "B2+", "C1", "C2"] },
        strengths: { type: "array", items: { type: "string" }, maxItems: 5 },
        areas_to_review: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: [
        "audio_quality",
        "errors",
        "dimensions",
        "justifications",
        "flags",
        "cefr",
        "strengths",
        "areas_to_review",
      ],
      additionalProperties: false,
    },
  },
} as const;

export type MediaInput = {
  base64: string;
  ext: string;
  mime: string;
};

type ContentBlock = Record<string, unknown>;

function audioBlock(media: MediaInput): ContentBlock {
  const format = media.ext === "mp4" || media.ext === "m4a" ? "m4a" : "webm";
  return { type: "input_audio", input_audio: { data: media.base64, format } };
}

function videoBlock(media: MediaInput): ContentBlock {
  return {
    type: "video_url",
    video_url: { url: `data:${media.mime};base64,${media.base64}` },
  };
}

async function callEvaluation(content: ContentBlock[]) {
  return fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-pro-preview",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "submit_evaluation" } },
    }),
  });
}

export async function evaluateSpeech(input: {
  question1: string;
  transcript1: string;
  media1?: MediaInput | null;
  question2: string;
  transcript2: string;
  media2?: MediaInput | null;
}): Promise<{ evaluation: RawEvaluation; audioUsed: boolean }> {
  const intro = (note: string) => `${note}

VIDEO 1 QUESTION: ${input.question1}
VIDEO 1 TRANSCRIPT (reading aid only): """${input.transcript1 || "(no speech detected)"}"""

VIDEO 2 QUESTION: ${input.question2}
VIDEO 2 TRANSCRIPT (reading aid only): """${input.transcript2 || "(no speech detected)"}"""`;

  const build = (mode: "audio" | "video"): ContentBlock[] => {
    const blocks: ContentBlock[] = [
      {
        type: "text",
        text: intro(
          "Listen to both recordings below and assess the candidate's spoken English. The audio overrides the transcripts.",
        ),
      },
    ];
    const push = (label: string, media: MediaInput | null | undefined) => {
      if (!media) return;
      blocks.push({ type: "text", text: label });
      blocks.push(mode === "audio" ? audioBlock(media) : videoBlock(media));
    };
    push("RECORDING 1:", input.media1);
    push("RECORDING 2:", input.media2);
    return blocks;
  };

  const hasMedia = Boolean(input.media1 || input.media2);
  const attempts: Array<{ content: ContentBlock[]; audio: boolean }> = hasMedia
    ? [
        { content: build("audio"), audio: true },
        { content: build("video"), audio: true },
      ]
    : [];
  attempts.push({
    content: [
      {
        type: "text",
        text: intro(
          "AUDIO IS UNAVAILABLE. Only transcripts are provided, so pronunciation and intonation cannot be verified: set audio_quality.usable to false and recommend Manual Review.",
        ),
      },
    ],
    audio: false,
  });

  let lastError = "";
  for (const attempt of attempts) {
    const res = await callEvaluation(attempt.content);
    if (!res.ok) {
      lastError = `AI evaluation failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`;
      if (res.status === 400 || res.status === 413) continue;
      throw new Error(lastError);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      lastError = "AI evaluation returned no structured result";
      continue;
    }
    return { evaluation: JSON.parse(args) as RawEvaluation, audioUsed: attempt.audio };
  }
  throw new Error(lastError || "AI evaluation failed");
}

