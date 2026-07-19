# AI pipeline (Spec §14, §15)

```
 media/free-text
      │
      ▼
 TranscriptionProvider.transcribe()   ← Deepgram | fake   (skipped for free-text)
      │  diarized segments + speakers
      ▼
 transcriptToText()                    ← speaker-tagged, timestamped
      │
      ▼
 AnalysisProvider.analyze()            ← OpenAI | fake
      │  raw JSON (untrusted)
      ▼
 parseOrRepairSummary()               ← strict Zod parse, else bounded repair
      │  validated Summary
      ▼
 persist Summary(review_required) + ActionItems + Goals
```

## Provider abstraction (§14.6, §19.4)
Concrete providers implement `TranscriptionProvider` / `AnalysisProvider`
(`src/domain/ai/providers/types.ts`). Callers only ever see the interface; the
factory (`providers/index.ts`) picks the implementation from config. A
deterministic **fake** provider runs the whole pipeline with no keys — the
default in dev and tests. Real adapters (`deepgram.ts`, `openai.ts`) isolate the
network call so it can be mocked and wired once keys are provisioned.

## Schema & repair (§14.3, §14.4)
The analysis output must satisfy `SummarySchema` (versioned,
`SUMMARY_SCHEMA_VERSION`). If strict parsing fails, `repairSummary` performs a
bounded, deterministic repair — dropping malformed array items, coercing
fixable scalars, filling defaults — before giving up. This is why a slightly
misbehaving model does not fail the session.

## Prompt rules (§14.4)
`prompts.ts` encodes the guardrails: don't invent; separate facts / inferences /
uncertainties; cite timestamps; warm non-clinical tone; no diagnosis; express
emotions with confidence, never as certainty; output in the coach's chosen
language regardless of the spoken language. Prompts are versioned
(`SUMMARY_PROMPT_VERSION`) and stored on each summary for auditability.

## Human review (§14.5)
Every summary lands in `review_required`. The coach edits (each edit is a new
version, never an overwrite), approves, and only then may share. Nothing is sent
to a client automatically.
