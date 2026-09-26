const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const crypto = require("crypto");

// The SHA-256 hash of the real password lives ONLY in Firebase Secret
// Manager (set in step 4 of SETUP.md) — it is never present in this
// source file, never sent to the browser, and never checked into git.
const PARTY_PASSWORD_HASH = defineSecret("PARTY_PASSWORD_HASH");

// TODO: replace with your real site origin(s) before going live.
// Using "*" (any origin) is fine for quick testing but means any
// website could call this endpoint from a visitor's browser.
const ALLOWED_ORIGINS = ["*"];

exports.verifyPartyPassword = onRequest(
  {secrets: [PARTY_PASSWORD_HASH], cors: ALLOWED_ORIGINS},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ok: false, error: "method_not_allowed"});
      return;
    }

    const guess = ((req.body && req.body.password) || "").trim().toLowerCase();
    if (!guess) {
      res.status(400).json({ok: false, error: "missing_password"});
      return;
    }

    const guessHash = crypto.createHash("sha256").update(guess).digest("hex");
    const expectedHash = PARTY_PASSWORD_HASH.value();

    // Constant-time comparison so response timing can't leak info
    // about how many characters matched.
    const ok =
      guessHash.length === expectedHash.length &&
      crypto.timingSafeEqual(Buffer.from(guessHash), Buffer.from(expectedHash));

    res.status(200).json({ok});
  },
);
