# Rockie — Rock Climbing Computer Vision App

*Status: DRAFT — requirements only. Implementation planning pending via /plan.*

---

## Problem

Climbers have no reliable way to understand the quality and efficiency of their movement while climbing. Video exists but is passive — you have to watch it yourself, frame by frame, and you need to already know what to look for. Coaches are expensive and not always present. The gap between "I fell" and "I know why I fell and how to fix it" is wide, and it costs climbers months of progress.

---

## Evidence

- Assumption — needs validation via: climber interviews at gyms, Reddit/r/climbharder analysis, beta request frequency on YouTube climbing channels
- Observed behavior: climbers frequently film themselves but rarely review footage systematically
- Adjacent validation: sports CV is proven in golf (Arccos), tennis (SwingVision), and swimming — climbing is next

---

## Users

**Primary**: Intermediate gym climbers (V3–V7 / 5.10–5.12), 18–35, training 2–4x/week, own a smartphone, already film themselves occasionally. They have enough experience to understand feedback but not enough to self-diagnose efficiently.

**Secondary**: Climbing coaches who want session data to share with students between lessons.

**Not for (v1)**: Outdoor climbers (lighting/angle constraints), beginners (need technique foundations first, not analytics), competitive climbers with existing coaching infrastructure.

---

## Hypothesis

We believe **automated computer vision movement analysis** will **close the feedback loop between climbing and improvement** for **intermediate gym climbers**.

We'll know we're right when **30% of weekly active users review their session analysis within 24 hours of a climb, and users who engage with feedback report measurable grade progression within 60 days**.

---

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Weekly active users reviewing analysis | 30% WAU | Supabase events |
| Session analysis completion rate | >80% of recorded sessions | Supabase |
| D7 retention | >40% | Supabase |
| Grade progression self-report | >50% within 60 days | In-app survey |
| App Store rating | ≥4.4 | App Store Connect |

---

## Core Features

### CV Analysis Engine
- **Body position tracking**: center of gravity, hip position relative to wall, shoulder alignment
- **Foot placement detection**: precision, smearing vs edging, foot swap frequency
- **Movement efficiency score**: calculates unnecessary movement, shaking/barn-door events, rest position quality
- **Climb replay**: annotated video with skeletal overlay and flagged moments
- **Key moment extraction**: auto-clips the crux, the fall, and the best sequence

### Session Management
- Upload video from camera roll or record in-app (portrait or landscape)
- Route tagging: grade, wall angle (slab/vertical/overhang), gym, date
- Session history with trend graphs (efficiency score over time, per-grade breakdowns)
- Personal bests and progression milestones

### Feedback Layer
- Plain-English summary after each climb ("Your hips dropped on move 4 — try flagging your right foot earlier")
- Drill suggestions tied to detected weaknesses
- Before/after comparison mode (climb the same route twice, compare analyses)

### Social / Sharing
- Share annotated clips to Instagram/TikTok with one tap
- Follow friends, view their session summaries (not full video unless shared)
- Gym leaderboard (opt-in, efficiency score based — not just grade)

---

## Stretch Features (Post-MVP)

| Feature | Why deferred |
|---|---|
| Live real-time analysis (phone mounted) | Latency and mount UX are hard; async is good enough for v1 |
| Route setting assistance for gyms (B2B) | Different buyer, different sales motion |
| Wearable integration (heart rate zones) | Hardware dependency adds friction |
| AI coach chat ("why did I fall?") | Needs robust CV data foundation first |
| Outdoor climb support | Lighting variation, background complexity — 2x harder CV problem |
| Competition mode (timed analysis, head-to-head) | Niche until user base is established |
| Coach dashboard (multi-student view) | B2B/prosumer tier — build after proving consumer |

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 14+ App Router (PWA) | Mobile-first PWA ships faster than native; App Router enables server components for performance |
| Styling | Tailwind CSS + shadcn/ui | Speed + consistency; dark mode first |
| Auth | Clerk | Fastest auth setup; social logins out of the box |
| Database | Supabase (Postgres + RLS) | Auth-aware queries, realtime for session status, built-in storage for video |
| Video storage | Supabase Storage | Integrated with auth; no separate CDN setup for v1 |
| CV processing | Python FastAPI microservice (async job queue) | CV workloads need Python ecosystem (MediaPipe, OpenCV, PyTorch); decoupled from Next.js |
| Job queue | Supabase Edge Functions → trigger Python worker | Keeps infra lean; swap for Trigger.dev if volume demands |
| CV models | MediaPipe Pose (v1) → fine-tuned model (v2) | MediaPipe is free and fast; climbing-specific fine-tuning is a moat |
| Deployment | Vercel (Next.js) + Fly.io or Modal (CV worker) | Vercel for web; GPU-capable serverless for CV |
| Analytics | Supabase + PostHog | Behavioral analytics without third-party data leakage |

---

## Monetization

**Primary (MVP):** Freemium
- Free: 5 climb analyses/month, 7-day history
- Rockie Pro ($9.99/month or $79/year): unlimited analyses, full history, before/after comparison, drill library, priority processing
- Reasoning: gets users hooked on the core loop before asking for money; $10/mo is less than one coaching session

**Secondary (Post-MVP):**
- Gym partnerships: white-label Rockie for gyms ($199/mo per gym), co-marketing, leaderboard on gym TVs
- Coach tier ($24.99/mo): multi-student dashboard, session sharing, annotated video export
- One-time analysis credits ($2.99 for 3): for users who don't climb enough to justify a subscription

---

## MVP Scope

**Ships first. No exceptions.**

The MVP tests one thing: *will climbers use CV feedback to improve?* Everything else is noise until that's answered.

### In MVP
1. **Video upload + CV analysis pipeline** — the entire product lives or dies here; build it first
2. **Efficiency score + key moment extraction** — one number + three annotated clips per session
3. **Plain-English feedback** — 3–5 sentences max, tied to detected events
4. **Session history** — list of past climbs with scores, basic trend line
5. **Auth (Clerk)** — email + Google; no anonymous users (need accounts to store sessions)
6. **Pro subscription (Stripe)** — 5 free analyses/month, unlimited for Pro; validate willingness to pay early
7. **Share clip** — one-tap share to camera roll/social; this is the organic growth engine

### Explicitly NOT in MVP
- Gym leaderboards
- Friend/social graph
- Drill library
- Before/after comparison
- Route tagging beyond grade + wall angle
- Coach dashboard
- Outdoor support

### MVP Definition of Done
A climber uploads a video of a bouldering attempt, receives an efficiency score and annotated clip within 3 minutes, reads plain-English feedback, and can share the clip. Repeat for 5 climbs before hitting the paywall.

---

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | CV pipeline + analysis API | Video in → score + annotated clip out, <3 min | in-progress | `.claude/plans/rockie-milestone-1.plan.md` |
| 2 | Core app (upload, results, history) | End-to-end user flow working | pending | — |
| 3 | Auth + Supabase data layer | Accounts, session storage, RLS | pending | — |
| 4 | Stripe paywall + Pro tier | Monetization live, freemium enforced | pending | — |
| 5 | Share clip feature | Organic growth loop active | pending | — |
| 6 | Beta: 20 real climbers, 2-week test | Retention + feedback data collected | pending | — |
| 7 | Public launch | App Store (PWA install) + ProductHunt | pending | — |

---

## Open Questions

- [ ] MediaPipe Pose accuracy on climbing-specific movements (arms above head, inverted positions) — needs spike/prototype before committing to it
- [ ] Video processing latency: what's acceptable? 3 min? 5 min? — needs user research
- [ ] PWA vs native app: does the iOS camera API restriction block in-app recording for PWA? — needs technical spike
- [ ] Gym partnership interest: worth building the B2B angle into the data model now, or defer entirely?
- [ ] Privacy: users filming at gyms may capture other climbers — need clear terms and face-blur consideration

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MediaPipe accuracy insufficient for climbing poses | High | Critical | Prototype CV pipeline in week 1; have fallback plan (Roboflow custom model) |
| Video upload sizes make Supabase Storage expensive at scale | Medium | Medium | Set 3-min video cap at upload; transcode to 720p before storage |
| PWA camera limitations on iOS | Medium | High | Test iOS camera API in week 1; fallback is upload-only (no in-app recording) |
| Low willingness to pay at $9.99/mo | Medium | High | Launch paywall at beta; adjust price before public launch |
| CV processing cost too high per analysis | Medium | Medium | Profile Modal/Fly.io costs at 100 analyses/day before committing to pricing |

---

*PRD created: 2026-05-14*
*Next step: `/plan ~/.claude/prds/rockie.prd.md`*
