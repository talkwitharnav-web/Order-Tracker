/**
 * Live strength scoring for passwords and PINs -- deliberately two separate
 * scorers, not one generic function, because the two have entirely
 * different threat models. A password's strength is about entropy (length,
 * character variety, avoiding common patterns); a PIN's is almost entirely
 * about avoiding the small set of PINs a real attacker tries first
 * (sequences, repeats, dates) since its length is fixed and short (4 or 6
 * digits) by design (see SYSTEM_MEMORY.md "Employee Attribution" -- PIN
 * length is derived from account_type, never a strength trade-off the user
 * makes themselves).
 */

export type StrengthTier = "weak" | "okay" | "good" | "strong" | "amazing" | "s-tier";

export const STRENGTH_TIERS: { tier: StrengthTier; label: string; bars: number }[] = [
  { tier: "weak", label: "Weak", bars: 1 },
  { tier: "okay", label: "Okay", bars: 2 },
  { tier: "good", label: "Good", bars: 3 },
  { tier: "strong", label: "Strong", bars: 4 },
  { tier: "amazing", label: "Amazing", bars: 5 },
  { tier: "s-tier", label: "S-Tier", bars: 6 },
];

function tierFromScore(score: number, maxScore: number): StrengthTier {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 1) return "s-tier";
  if (ratio >= 0.83) return "amazing";
  if (ratio >= 0.66) return "strong";
  if (ratio >= 0.45) return "good";
  if (ratio >= 0.22) return "okay";
  return "weak";
}

const COMMON_PASSWORDS = new Set([
  "password", "12345678", "123456789", "qwerty123", "letmein", "welcome",
  "password1", "admin123", "iloveyou", "restaurant", "kitchen123",
]);

/**
 * Scores a password 0-1 tier ratio, then buckets into a StrengthTier.
 * Rewards length most heavily (the single strongest real-world predictor),
 * then character variety, and penalizes very common/guessable passwords and
 * simple repeated characters. This is intentionally simple, offline,
 * client-side heuristic scoring -- not a full dictionary/zxcvbn-style
 * analysis -- since it only needs to give a directionally honest live
 * signal, not gate submission (the actual minimum-length requirement is
 * still enforced server-side in restaurants/register).
 */
export function scorePasswordStrength(password: string): { tier: StrengthTier; label: string; bars: number } {
  if (password.length === 0) {
    return { tier: "weak", label: "Weak", bars: 0 };
  }

  let score = 0;

  // Length is the dominant signal -- up to 5 points for 8-20+ chars.
  score += Math.min(password.length / 4, 5);

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const varietyCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  score += varietyCount * 1.2;

  // Penalize a password that's just one repeated/sequential run (aaaaaaaa,
  // 12345678) even if it's technically long -- length alone shouldn't score
  // well if there's no real entropy behind it.
  const uniqueChars = new Set(password.toLowerCase()).size;
  if (uniqueChars <= 3 && password.length >= 6) score -= 3;

  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = 0;

  const maxScore = 5 + 4 * 1.2; // length cap + full variety
  const tier = tierFromScore(Math.max(score, 0), maxScore);
  const meta = STRENGTH_TIERS.find((t) => t.tier === tier)!;
  return { tier, label: meta.label, bars: meta.bars };
}

/**
 * Scores a PIN 0-1 tier ratio. Length isn't a factor the user controls (see
 * module doc) -- this instead penalizes the specific patterns a real
 * attacker actually tries first against a stolen/guessed PIN: straight
 * sequences (1234, 4321), all-same-digit (1111), simple repeats (1212),
 * and common dates/years (1990, 2024). What's left after those penalties is
 * "how many distinct digits, how evenly distributed" as the positive signal.
 */
export function scorePinStrength(pin: string, requiredLength: number): { tier: StrengthTier; label: string; bars: number } {
  if (pin.length < requiredLength) {
    return { tier: "weak", label: "Weak", bars: 0 };
  }

  let score = 3; // baseline once the PIN is actually complete

  const digits = pin.split("").map(Number);
  const uniqueDigits = new Set(digits).size;
  score += (uniqueDigits / requiredLength) * 3;

  const isSequentialUp = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const isSequentialDown = digits.every((d, i) => i === 0 || d === (digits[i - 1] - 1 + 10) % 10);
  const isAllSame = uniqueDigits === 1;
  const isSimpleRepeat = requiredLength % 2 === 0 && pin === pin.slice(0, requiredLength / 2).repeat(2);
  const looksLikeYear = requiredLength === 4 && Number(pin) >= 1930 && Number(pin) <= 2035;

  if (isSequentialUp || isSequentialDown) score = 0;
  else if (isAllSame) score = 0;
  else if (isSimpleRepeat) score = 1;
  else if (looksLikeYear) score = Math.min(score, 2);

  const maxScore = 3 + 3;
  const tier = tierFromScore(Math.max(score, 0), maxScore);
  const meta = STRENGTH_TIERS.find((t) => t.tier === tier)!;
  return { tier, label: meta.label, bars: meta.bars };
}
