import type { Decision } from "./decision";

// Model revisions and benchmark values observed at https://openjev.com on 2026-09-23.
export const MODELS = {
  "qwen3-0.6b": {
    name: "Qwen3 0.6B",
    size: "639 MB",
    tier: "Phones and small devices",
    labelBase: 32,
    url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf",
    homepage: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF",
    notice:
      "The smallest download. A useful starting point on phones and devices with less memory.",
    quality: ["44.0%", "52.8%", "40.7%"],
  },
  "minicpm5-2b": {
    name: "MiniCPM5 2B",
    size: "1.56 GB",
    tier: "Desktop default",
    labelBase: 54,
    url: "https://huggingface.co/openbmb/MiniCPM5-2B-GGUF/resolve/2079a22f3beaa4e306449978533478fe0522f4b3/MiniCPM5-2B-Q4_K_M.gguf",
    homepage: "https://huggingface.co/openbmb/MiniCPM5-2B-GGUF",
    notice:
      "A larger model for desktop use. Loading can take several minutes and may exceed a small device’s memory.",
    quality: ["68.6%", "69.3%", "63.7%"],
  },
  "qwen3.5-4b": {
    name: "Qwen3.5 4B",
    size: "3.01 GB",
    tier: "High-memory desktop",
    labelBase: 32,
    url: "https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/4168f45a16a1290d65a4ec0fa312ae917a4c15d6/Qwen_Qwen3.5-4B-Q4_K_M.gguf",
    homepage: "https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF",
    notice:
      "Allow several gigabytes of free GPU memory and browser storage for this model.",
    quality: ["81.3%", "76.6%", "84.5%"],
  },
} as const;
export type ModelId = keyof typeof MODELS;
export const MODEL_IDS = Object.keys(MODELS) as ModelId[];
export const PRESETS: Record<"account" | "email", Decision> = {
  account: {
    state:
      "A customer says a password reset succeeded, but every login attempt still returns ‘account locked’. Two unlock emails were requested and neither arrived.",
    question: "Which queue should handle this request?",
    options: ["Account access support", "Billing support", "Close as resolved"],
  },
  email: {
    state:
      "An email claims to be from the payroll team and says the recipient’s salary payment will be suspended today. It comes from payroll-review@outlook.com and links to a non-company sign-in page asking for a password and verification code.",
    question: "How should this email be classified?",
    options: ["Legitimate", "Spam", "Phishing"],
  },
};
