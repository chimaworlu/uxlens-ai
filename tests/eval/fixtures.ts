import type { GoldenCase } from "./types.ts";

// Twenty synthetic UX research documents, one product each, written for
// this eval set (not real research data) — matching scripts/seed-demo.ts's
// approach of running genuinely synthetic content through the real
// pipeline rather than hand-authoring insights directly. Each document is
// well above FR-22's 300-word floor. Several cases deliberately contain a
// real contradiction (two participants disagreeing about the same specific
// thing) since CONTRADICTION is the hardest of the four insight types to
// get right. Several chat cases deliberately use different wording than
// the source document (R-10's paraphrase/keyword-mismatch concern).

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "fitness-tracker",
    documents: [
      {
        filename: "PulseFit research notes.txt",
        content: `PulseFit fitness tracker app - 5 user interviews, 25 minutes each.

Participant 1 - Grace, 31, runs three times a week. Grace loves the automatic workout detection: "It just knows I'm running without me tapping anything, that's the best part." Her frustration is with the weekly summary email, which she says is too text-heavy and hard to scan: "I want a picture, not five paragraphs." She said a simple chart of the week would work better.

Participant 2 - Femi, 45, lifts weights three times a week. Femi manually logs every set and rep because the app can't auto-detect weightlifting. "Cardio gets special treatment and strength training is an afterthought," he said. Logging a full workout takes him almost ten minutes of tapping through sets, and he wants a way to save a routine template so he isn't rebuilding the same workout from scratch every session.

Participant 3 - Blessing, 26, new to exercise, started using PulseFit two months ago. She found the goal-setting screen overwhelming on day one: "It asked me for a target heart rate zone before I even knew what that meant." She said she almost gave up during onboarding and only continued because a friend walked her through it. She wants beginner-friendly defaults instead of asking for numbers she doesn't understand yet.

Participant 4 - Tobi, 38, uses PulseFit mainly for sleep tracking. He said the sleep score is accurate most nights but occasionally drops to zero with no explanation after a night he clearly slept normally. "When the number is just wrong with no reason given, I stop trusting the whole app for a few days." He wants a note explaining why a reading looks off, similar to how his bank app flags a suspicious transaction with a reason.

Participant 5 - Ngozi, 29, competitive runner. Ngozi strongly prefers the automatic detection Grace praised, but goes further: she wants PulseFit to auto-detect the TYPE of workout (easy run vs. interval training) based on pace changes, not just that a run happened at all. She said manually tagging workout type after the fact "defeats the purpose of automatic tracking."

Researcher's note: automatic detection is the most praised feature among cardio-focused users (Grace, Ngozi) but strength-training users (Femi) feel underserved by it, wanting better manual tools instead of more automation aimed at cardio. This mirrors a split similar to other fitness apps: automation preference tracks closely with workout type, not user skill level.`,
      },
    ],
    expectedInsights: [
      {
        type: "THEME",
        description: "Automatic workout detection is highly valued by cardio users but strength/weightlifting users feel underserved and rely on slow manual logging.",
      },
      {
        type: "PAIN_POINT",
        description: "Onboarding asks new users for technical fitness metrics (like target heart rate zone) before they understand what those terms mean, which is overwhelming and nearly causes early drop-off.",
      },
      {
        type: "SUGGESTION",
        description: "Users want explanations when a health metric (like a sleep score) looks anomalous, rather than an unexplained low or missing number.",
      },
    ],
    chatCases: [
      { question: "What did users say about getting started with the app for the first time?", expectation: "grounded" },
      { question: "Do users want the app to auto-detect not just that a workout happened but what kind of workout it was?", expectation: "grounded" },
      { question: "What did users say about the app's pricing or subscription cost?", expectation: "refusal" },
    ],
  },
  {
    id: "recipe-planner",
    documents: [
      {
        filename: "MealMap interview notes.txt",
        content: `MealMap meal planning app - notes from 5 interviews with home cooks.

Participant 1 - Kemi, 34, mother of two. Kemi uses MealMap to plan the week's dinners. Her top complaint is the grocery list generator, which lumps ingredients from different recipes without combining duplicates: "I end up with three separate lines for onions instead of one line saying I need three onions total." She wants the list to merge duplicate ingredients automatically.

Participant 2 - Richard, 52, cooks mostly on weekends. Richard said the recipe search is his favorite feature, especially filtering by ingredients he already has: "I type in what's in my fridge and it tells me what I can actually make tonight." He did mention that portion-size scaling sometimes produces odd fractions, like "2.33 eggs," which he finds funny but also mildly annoying since he has to round it himself.

Participant 3 - Aisha, 27, recently started cooking more to save money. Aisha said the step-by-step cooking mode, which keeps the screen on and shows one step at a time, is extremely helpful: "My hands are messy, I don't want to swipe through a wall of text." Her frustration is that saved recipes have no way to add her own notes, like substitutions she made that worked well.

Participant 4 - David, 61, cooks for a partner with a shellfish allergy. David relies heavily on the allergen filter to exclude shellfish from search results, and said it works well for search but not for the "surprise me" random recipe button, which has suggested shellfish dishes twice despite his allergy settings. He called this "the one place where the app actively works against me instead of for me."

Participant 5 - Chidinma, 30, meal preps every Sunday. Chidinma agreed with Kemi that the grocery list needs to combine duplicate ingredients, and separately requested the list be organized by grocery store aisle/section (produce, dairy, etc.) rather than by recipe, so she isn't backtracking through the store.

Researcher's note: the grocery list's lack of ingredient consolidation was raised independently by two participants (Kemi, Chidinma) without prompting, making it the most consistently mentioned pain point in this round.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "The grocery list generator doesn't merge duplicate ingredients across recipes, forcing users to manually consolidate quantities themselves.",
      },
      {
        type: "PAIN_POINT",
        description: "The allergen filter is inconsistently applied — it works for search but the random/surprise recipe feature can still suggest dishes containing a user's flagged allergen.",
      },
      {
        type: "SUGGESTION",
        description: "Users want the grocery list organized by store section/aisle rather than by recipe, to make in-store shopping faster.",
      },
    ],
    chatCases: [
      { question: "Is there a problem with how the shopping list combines ingredients from multiple recipes?", expectation: "grounded" },
      { question: "Does the allergen safety feature work consistently across every part of the app?", expectation: "grounded" },
      { question: "What did users say about the app's video tutorials?", expectation: "refusal" },
    ],
  },
  {
    id: "ride-share",
    documents: [
      {
        filename: "GoRide driver and rider notes.txt",
        content: `GoRide ride-hailing app - 6 interviews, mix of riders and drivers.

Rider 1 - Yusuf, 33, uses GoRide daily for commuting. Yusuf's main complaint is surge pricing transparency: "The price jumps but it never tells me why, is it rain, is it a football match, I have no idea if it'll go back down in ten minutes or stay up all night." He wants a short reason shown alongside a surge multiplier.

Rider 2 - Patricia, 40, occasional rider. Patricia praised the live driver tracking map as accurate and reassuring, especially at night. Her complaint was about cancellations: when a driver cancels, she's dropped back to the start of the search with no explanation, and it has happened to her three times in one week recently.

Driver 1 - Emeka, 29, drives full-time. Emeka said the in-app navigation sometimes routes him through streets that are technically shorter but have terrible traffic, and he has to override it with his own knowledge or a separate maps app, which is an extra step mid-trip. He wants the app to learn from driver overrides over time.

Driver 2 - Ifeoma, 44, drives part-time evenings. Ifeoma disagreed with Emeka about in-app navigation, saying it works fine for her because she mostly drives in neighborhoods she already knows well and rarely follows the turn-by-turn directions closely. She said her bigger issue is the earnings breakdown screen, which shows a total but not a clear split between the base fare, distance, and any bonus, making it hard to understand her pay after a shift.

Rider 3 - Tunde, 22, university student, price-sensitive. Tunde said he checks the fare estimate obsessively before booking and wants a feature to set a maximum price alert, similar to how flight search apps let you set a price ceiling and get notified when a route drops below it.

Driver 3 - Blessing, 36, drives full-time. Blessing echoed Ifeoma's complaint about the unclear earnings breakdown, calling it "a black box, I just see a number at the end of the night and have to trust it."

Researcher's note: opinions on in-app navigation quality were split between Emeka (frustrated, wants it smarter) and Ifeoma (indifferent, rarely uses it) — this appears tied to how familiar each driver already is with their area rather than a consistent app quality issue.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Surge pricing multipliers are shown without any explanation of the cause, leaving riders unsure whether a price spike is temporary or will last.",
      },
      {
        type: "PAIN_POINT",
        description: "The driver earnings breakdown shows only a final total without splitting it into base fare, distance, and bonuses, making pay hard to understand or verify.",
      },
      {
        type: "CONTRADICTION",
        description: "Drivers disagree on whether the in-app turn-by-turn navigation is a problem: one driver finds it frequently wrong and wants it smarter, while another finds it irrelevant since she already knows her driving area well.",
      },
      {
        type: "SUGGESTION",
        description: "A rider requested a maximum-price alert for fares, similar to a price-drop alert, so they're notified when a route becomes cheaper.",
      },
    ],
    chatCases: [
      { question: "Do drivers agree on whether the turn-by-turn directions in the app are good or bad?", expectation: "grounded" },
      { question: "Can riders understand why a fare suddenly got more expensive?", expectation: "grounded" },
      { question: "What did users say about the app's customer support chat response time?", expectation: "refusal" },
    ],
  },
  {
    id: "note-taking",
    documents: [
      {
        filename: "Notely research summary.txt",
        content: `Notely note-taking app - 5 interviews with knowledge workers.

Participant 1 - Sade, 28, product manager. Sade organizes notes by project using nested folders, and her top complaint is that search only matches note titles, not the body text: "I remember writing something about a deadline but I can't find which note it's buried in." She wants full-text search across all note content.

Participant 2 - Michael, 35, software engineer. Michael relies on tagging rather than folders, and said tagging works well, but the tag list has no way to merge two tags that mean the same thing, like "#todo" and "#to-do" which he created by accident and now can't reconcile without manually retagging every note.

Participant 3 - Funmilayo, 42, freelance writer. Funmilayo praised the offline mode strongly, since she often writes on flights with no signal. She agreed with Sade that search needs to cover note content, not just titles, independently raising the same complaint.

Participant 4 - James, 31, consultant. James takes handwritten notes on a tablet using the app's stylus support, and said handwriting-to-text conversion is unreliable for his handwriting specifically, misreading roughly one word in ten. He said he's stopped relying on the converted text and just keeps the handwritten version, which then isn't searchable at all.

Participant 5 - Amara, 26, graduate student. Amara wants a way to link one note to another directly, similar to a wiki-style link, so her research notes can reference related notes without copy-pasting content between them. She said right now she keeps a separate spreadsheet just to track which notes relate to which topics.

Researcher's note: content-level search (not just titles) was the single most requested fix, raised independently by two participants without prompting, and would likely also make James's unreliable handwriting problem less costly since even an imperfect conversion becomes useful if it's searchable.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Search only matches note titles, not the actual body content, making it hard to find a note based on what's written inside it.",
      },
      {
        type: "PAIN_POINT",
        description: "Handwriting-to-text conversion is unreliable enough that at least one user has given up on it, leaving their handwritten notes unsearchable.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants the ability to merge duplicate or near-duplicate tags without manually retagging every note that used the old tag.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants wiki-style linking between notes so related notes can reference each other directly instead of tracking relationships in a separate document.",
      },
    ],
    chatCases: [
      { question: "Can users find a note by searching for something written inside the note, not just its title?", expectation: "grounded" },
      { question: "Is handwriting recognition reliable for every user?", expectation: "grounded" },
      { question: "What did users say about collaborating on a note with a teammate in real time?", expectation: "refusal" },
    ],
  },
  {
    id: "job-search",
    documents: [
      {
        filename: "HireLoop candidate interviews.txt",
        content: `HireLoop job search platform - 5 interviews with active job seekers.

Participant 1 - Wale, 27, applying for software roles. Wale said the one-click apply feature is great for volume but leads to a lot of irrelevant recruiter messages afterward, since the same click also opts him into "open to offers" broadcasts he didn't realize he was agreeing to. He wants those two things to be separate, explicit choices.

Participant 2 - Ifeanyi, 34, mid-career switch into product management. Ifeanyi's biggest frustration is that the job recommendation algorithm keeps showing him roles identical to his current job title, even after he explicitly filtered for "product manager" roles and marked several software engineering recommendations as "not interested." He said the app doesn't seem to learn from that feedback.

Participant 3 - Grace, 45, senior finance professional. Grace praised the salary transparency filter, which lets her hide listings that don't disclose a pay range, calling it "the single feature that saves me the most time, I refuse to apply anywhere that hides the number now."

Participant 4 - Tobi, 24, recent graduate. Tobi said the application tracker, which shows status like "applied," "viewed," "interview," is genuinely useful for staying organized, but wishes it also showed roughly how long each stage typically takes so he knows whether silence after two weeks is normal or a bad sign.

Participant 5 - Chiamaka, 38, applying while employed, values discretion. Chiamaka is worried her current employer will see she's job hunting, and said the platform doesn't clearly explain what current-employer visibility controls exist, if any. She's stopped using her real profile photo as a workaround, which she called "not a real solution, just a hack."

Researcher's note: two related but distinct algorithm complaints came up - Ifeanyi's issue was the recommendation engine ignoring explicit "not interested" feedback, while Wale's issue was that a single click bundles together actions (applying and opting into broadcast messages) that should be separate. Both point to the platform making assumptions on the user's behalf rather than respecting explicit choices.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "The job recommendation algorithm continues suggesting roles a user has explicitly marked as not interested, seemingly ignoring that feedback.",
      },
      {
        type: "PAIN_POINT",
        description: "One-click apply silently bundles applying for a job together with opting into 'open to offers' recruiter broadcasts, without the user separately consenting to each.",
      },
      {
        type: "THEME",
        description: "Users want more explicit control and transparency over decisions the platform makes on their behalf, whether that's algorithm recommendations, bundled consent actions, or privacy/visibility settings.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants the application tracker to show typical timing for each stage so they can tell whether a lack of response after applying is normal or a bad sign.",
      },
    ],
    chatCases: [
      { question: "Does the recommendation algorithm respect it when a user says they're not interested in a type of role?", expectation: "grounded" },
      { question: "Are there any concerns about privacy from a current employer while job searching?", expectation: "grounded" },
      { question: "What did users say about the mobile app's push notification settings?", expectation: "refusal" },
    ],
  },
  {
    id: "language-learning",
    documents: [
      {
        filename: "LinguaLeap user notes.txt",
        content: `LinguaLeap language learning app - 5 interviews with active learners.

Participant 1 - Hassan, 29, learning Spanish for travel. Hassan likes the daily streak feature for motivation but said the app sometimes counts a lesson as complete even if he got most answers wrong, just for finishing it, which "feels like it's lying to me about my actual progress." He wants completion and accuracy tracked separately.

Participant 2 - Ngozi, 33, learning French for work relocation. Ngozi said the speaking exercises, which use voice recognition, frequently mark her correct pronunciation as wrong, especially for words with sounds that don't exist in English. She's started skipping speaking exercises entirely because of this, which defeats the purpose for her work use case.

Participant 3 - Daniel, 41, learning Japanese as a hobby. Daniel praised the spaced-repetition flashcard system as genuinely effective for vocabulary retention. His complaint is that grammar explanations are very brief, just one or two example sentences, and he often has to look up grammar rules on an external website to actually understand the "why" behind a pattern.

Participant 4 - Amara, 25, learning German, self-described beginner. Amara agreed with Hassan that the streak and completion system can be misleading, and separately said the app's placement test put her at a level too advanced for her actual ability, so her first two weeks of lessons felt overwhelming until she manually reset to an easier level.

Participant 5 - Kwame, 37, learning Portuguese, intermediate level. Kwame's main request is offline lesson downloads for commuting on the subway with no signal, saying he currently just can't practice at all during that time, which is otherwise his most consistent daily practice window.

Researcher's note: the disconnect between "lesson marked complete" and "content actually understood" was raised by two participants (Hassan, Amara) independently, both describing it as demotivating once they noticed it, since the streak stops feeling like a meaningful signal of real progress.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Lessons are marked complete based on finishing them, not on answering correctly, which misleads users about their actual progress and undermines trust in the streak/progress system.",
      },
      {
        type: "PAIN_POINT",
        description: "Voice recognition in speaking exercises frequently marks correct pronunciation as wrong for sounds not present in English, causing at least one user to abandon speaking practice entirely.",
      },
      {
        type: "PAIN_POINT",
        description: "The placement test can assign a level too advanced for a user's real ability, making early lessons overwhelming until manually corrected.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants offline lesson downloads to practice during commutes with no signal.",
      },
    ],
    chatCases: [
      { question: "Is there a gap between a lesson being marked done and the user actually learning the material?", expectation: "grounded" },
      { question: "Does the speech recognition feature work well for pronunciation practice?", expectation: "grounded" },
      { question: "What did users say about the app's referral or invite-a-friend program?", expectation: "refusal" },
    ],
  },
  {
    id: "home-rental",
    documents: [
      {
        filename: "NestFind property search notes.txt",
        content: `NestFind home rental search app - 5 interviews with renters.

Participant 1 - Chinwe, 30, apartment hunting alone. Chinwe said the map-based search is excellent for narrowing by neighborhood, but the listing photos are frequently outdated, showing a renovation or furniture that isn't there anymore. She's been shown up to three listings that looked nothing like the photos and called it "a trust problem, not just an annoyance."

Participant 2 - Segun, 26, first-time renter, budget-conscious. Segun said the price filter doesn't account for extra fees like a mandatory parking fee or utility surcharge, so listings that look within budget turn out to be over budget once he contacts the landlord. He wants an all-in estimated monthly cost shown upfront, not just base rent.

Participant 3 - Adaeze, 44, relocating for work with two children. Adaeze relies heavily on the school district filter, and said it's usually accurate but was wrong once in a way that mattered - a listing labeled as being in a specific school district turned out to be a few streets outside it. She said for a decision this important, one error is one too many.

Participant 4 - Emeka, 35, renting with two roommates. Emeka said the messaging system with landlords works well, but there's no way to loop in his roommates on the same conversation, so he ends up screenshotting messages and forwarding them manually. He wants a shared conversation thread for co-applicants.

Participant 5 - Funke, 52, downsizing after kids moved out. Funke agreed with Chinwe that outdated listing photos are a serious trust issue, saying she's now suspicious of every listing and manually cross-checks addresses on a separate maps app before contacting anyone, which she called "extra work the app should be doing for me."

Researcher's note: outdated photos undermining trust in listings was raised independently by two participants (Chinwe, Funke), both describing a broader loss of confidence in the platform's accuracy as a result, not just annoyance at any single listing.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Outdated listing photos that don't match the property's real current condition are undermining users' overall trust in the platform's listing accuracy.",
      },
      {
        type: "PAIN_POINT",
        description: "The price filter doesn't account for mandatory extra fees like parking or utilities, so listings appear within budget but turn out to cost more once contacted.",
      },
      {
        type: "SUGGESTION",
        description: "A user renting with roommates wants a shared messaging thread with the landlord that all co-applicants can see, instead of manually forwarding screenshots.",
      },
    ],
    chatCases: [
      { question: "Do users trust that listing photos accurately reflect the current state of the property?", expectation: "grounded" },
      { question: "Does the displayed rent price reflect the true total monthly cost including fees?", expectation: "grounded" },
      { question: "What did users say about the mortgage calculator feature?", expectation: "refusal" },
    ],
  },
  {
    id: "pet-care",
    documents: [
      {
        filename: "PawPlan interview notes.txt",
        content: `PawPlan pet care app - 5 interviews with dog and cat owners.

Participant 1 - Bisi, 29, first-time dog owner. Bisi relies on the vaccination reminder feature and said it works well, but wants the ability to add her own custom reminders too, like a grooming appointment, rather than only vet-related ones the app predefines.

Participant 2 - Tunde, 47, owns two cats. Tunde said the food tracking feature, meant to log how much his cats eat daily, is too tedious to keep up with - it requires manually entering grams every feeding, and he's stopped using it after the first week. He said a simpler "fed, yes or no" toggle would actually get used, even if less precise.

Participant 3 - Amaka, 34, owns a senior dog with a chronic condition. Amaka relies on the medication schedule feature multiple times a day and said it's mostly reliable, but the notification sound is identical to a generic system notification, so she sometimes misses a dose reminder buried among other phone notifications. She wants a distinct, louder alert specifically for medication.

Participant 4 - David, 40, owns a puppy, first pet ever. David said the training tips section is helpful but generic, not accounting for his dog's specific breed, and he's had to research breed-specific advice elsewhere. He also independently mentioned wanting simpler daily logging, echoing Tunde's food-tracking complaint, but about walk/exercise tracking instead - he wants a quick tap rather than filling in distance and duration.

Participant 5 - Ifeoma, 55, owns three dogs. Ifeoma said switching between her three dogs' profiles takes too many taps, and she wants a combined view showing all three dogs' upcoming reminders (vaccines, meds, grooming) on one screen instead of checking each profile separately.

Researcher's note: a consistent theme was that detailed manual logging (food grams, walk distance/duration) is too high-effort for daily habits and gets abandoned, while simpler one-tap logging would likely see better long-term adoption, based on both Tunde's and David's independent complaints about different tracking features.`,
      },
    ],
    expectedInsights: [
      {
        type: "THEME",
        description: "Detailed manual daily logging (like exact food grams or walk distance/duration) is too high-effort and gets abandoned by users, who would prefer simpler one-tap logging even if less precise.",
      },
      {
        type: "PAIN_POINT",
        description: "Medication reminder notifications sound identical to generic system notifications, causing a user managing a pet's chronic condition to sometimes miss a dose reminder.",
      },
      {
        type: "SUGGESTION",
        description: "A multi-pet owner wants a combined view of all pets' upcoming reminders on one screen instead of switching between individual pet profiles.",
      },
    ],
    chatCases: [
      { question: "Do users find detailed daily tracking (like exact food amounts) sustainable to keep up with?", expectation: "grounded" },
      { question: "Are medication reminders easy to notice among other phone notifications?", expectation: "grounded" },
      { question: "What did users say about the app's social sharing or community feed?", expectation: "refusal" },
    ],
  },
  {
    id: "online-courses",
    documents: [
      {
        filename: "SkillForge learner interviews.txt",
        content: `SkillForge online course platform - 5 interviews with learners.

Participant 1 - Zainab, 26, learning web development. Zainab said the video playback speed control is essential for her and works well, but there's no way to save her preferred speed as a default - she has to reset it to 1.5x at the start of every single video, which she called "a small thing that adds up to real annoyance over a 40-video course."

Participant 2 - Chidi, 33, learning data analysis for a career change. Chidi praised the hands-on coding exercises embedded directly in lessons, saying they're far more useful than pure video for retention. His complaint is that when his code has an error, the feedback just says "incorrect," with no hint about what's wrong, so he often has to search external forums to debug his own exercise answer.

Participant 3 - Funmi, 41, learning project management, studies during commute. Funmi said downloaded videos for offline viewing work well, but downloaded content doesn't sync her progress - if she watches offline then goes online, the app doesn't always know she finished that lesson, and she's had to re-watch sections to get credit.

Participant 4 - Tayo, 29, learning graphic design. Tayo agreed with Zainab about playback speed not persisting, independently raising the identical complaint. He also said the course discussion forum is helpful when active, but many older courses have dead forums with unanswered questions from over a year ago, and there's no way to tell before enrolling whether a course's forum is actually active.

Participant 5 - Ngozi, 37, learning digital marketing, working professional. Ngozi's main request is a certificate that includes the actual hours spent (not just a completion date), since she wants to list continuing education hours on a professional certification renewal, and the current certificate doesn't provide that.

Researcher's note: the playback speed not persisting between videos was independently raised by two participants (Zainab, Tayo) as a specific, identical complaint, suggesting it's a genuine widespread annoyance rather than an isolated preference.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Video playback speed preference doesn't persist between videos, forcing users to manually reset it at the start of every video in a course.",
      },
      {
        type: "PAIN_POINT",
        description: "Coding exercise error feedback just says the answer is incorrect without any hint about what's wrong, forcing learners to seek help outside the platform.",
      },
      {
        type: "PAIN_POINT",
        description: "Progress from offline-downloaded videos doesn't always sync correctly once the user goes back online, sometimes requiring re-watching to get credit.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants course completion certificates to include actual hours spent, not just a completion date, for professional certification renewal purposes.",
      },
    ],
    chatCases: [
      { question: "Does the video player remember a user's preferred watch speed from one video to the next?", expectation: "grounded" },
      { question: "When a learner gets a coding exercise wrong, does the platform explain what specifically was wrong?", expectation: "grounded" },
      { question: "What did users say about group or cohort-based live classes?", expectation: "refusal" },
    ],
  },
  {
    id: "grocery-delivery",
    documents: [
      {
        filename: "QuickCart delivery research.txt",
        content: `QuickCart grocery delivery app - 5 interviews with regular users.

Participant 1 - Halima, 32, orders weekly. Halima said substitutions are her biggest frustration - when an item is out of stock, the app auto-substitutes without asking first, and she's received a substitution she's allergic to once. She wants to approve or reject each substitution before it's added to her order, not after delivery.

Participant 2 - Emmanuel, 45, orders for a family of five. Emmanuel praised the reorder-previous-cart feature as a major time-saver for weekly staples. His complaint is that delivery time slots fill up fast in the evening, and there's no waitlist option - if his preferred slot is full, he just has to keep manually refreshing to check if one opens up.

Participant 3 - Grace, 27, budget-conscious student. Grace relies on the running total shown while shopping to stay within budget, and said it's usually accurate but doesn't include the delivery fee or service fee until the very last checkout screen, which has caused her to go over budget more than once without realizing until the end.

Participant 4 - Ibrahim, 50, has specific dietary restrictions. Ibrahim agreed with Halima that unapproved substitutions are a real problem, especially for dietary restrictions rather than just preference, calling an unapproved substitution "not a minor inconvenience when it's about what I can safely eat." He wants the allergy/restriction profile to hard-block certain substitutions entirely, never substituting a flagged category no matter what.

Participant 5 - Chiamaka, 38, orders for elderly parents remotely. Chiamaka said the "gift order" or "order for someone else" flow doesn't clearly show the recipient's delivery address during checkout, and she's had a moment of doubt each time wondering if she selected the right saved address, wanting a clear confirmation step showing exactly where the order is headed.

Researcher's note: substitution approval was raised by two participants independently (Halima, Ibrahim), with Ibrahim's version being more severe since it involves a safety concern (allergies/dietary restrictions) rather than just preference, suggesting this needs a hard block, not just an opt-in preference toggle.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Out-of-stock items are auto-substituted without asking the customer first, which is a safety concern for users with allergies or dietary restrictions, not just a preference issue.",
      },
      {
        type: "PAIN_POINT",
        description: "Delivery and service fees aren't shown in the running total while shopping, only appearing at the final checkout screen, causing some users to exceed their budget without realizing.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants a waitlist option for fully booked delivery time slots instead of manually refreshing to check for openings.",
      },
    ],
    chatCases: [
      { question: "When an item is unavailable, does the app ask the customer before substituting something else?", expectation: "grounded" },
      { question: "Is the total cost shown while shopping accurate to what the customer will actually be charged?", expectation: "grounded" },
      { question: "What did users say about the app's loyalty points or rewards program?", expectation: "refusal" },
    ],
  },
  {
    id: "password-manager",
    documents: [
      {
        filename: "VaultKey user research.txt",
        content: `VaultKey password manager - 5 interviews with users.

Participant 1 - Simisola, 31, uses it for personal accounts. Simisola said autofill works reliably on most websites but fails silently on a few, with no indication of why - the field just doesn't populate and she has to manually copy-paste, unsure if it's a VaultKey problem or the website's. She wants an error indicator when autofill can't detect a login field.

Participant 2 - Ahmed, 38, IT professional, uses it for work and personal accounts separately. Ahmed said switching between his personal and work vaults requires fully logging out and back in, which is disruptive during his workday. He wants to view both vaults in one interface with a simple toggle, not a full re-authentication each time.

Participant 3 - Ronke, 44, less technical user, recommended the app by a colleague. Ronke said the initial setup, importing passwords from her browser, was confusing - she wasn't sure if it worked because there was no clear confirmation screen showing how many passwords were imported. She had to manually check a few accounts to verify it worked at all.

Participant 4 - Tunde, 29, security-conscious. Tunde praised the breach monitoring feature, which alerts him if a saved password appeared in a known data breach, calling it "the reason I pay for this over a free alternative." He did note the alert doesn't say which specific breach, just that one occurred, and he'd like that detail to judge how serious it is.

Participant 5 - Blessing, 50, shares some accounts with a spouse. Blessing wants a way to securely share specific passwords with her husband without sharing her entire vault, since currently her only options are sharing everything or nothing. She currently reads passwords aloud over the phone as a workaround, which she knows isn't secure.

Researcher's note: two distinct but related requests emerged around import/export clarity - Ronke wanted confirmation that an import succeeded, while nothing in this round mentioned export, suggesting import feedback specifically (not general vault visibility) is the gap.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Autofill sometimes fails silently on certain websites with no error or explanation, leaving the user unsure whether it's an app problem or a site problem.",
      },
      {
        type: "PAIN_POINT",
        description: "Importing passwords during setup gives no clear confirmation of how many passwords were successfully imported, leaving less technical users unsure if it worked.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants to selectively share individual passwords with a family member rather than only being able to share an entire vault or nothing at all.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants breach alerts to specify which breach exposed their password, not just that a breach occurred, to help judge severity.",
      },
    ],
    chatCases: [
      { question: "When autofill doesn't work on a website, does the app explain why?", expectation: "grounded" },
      { question: "Can a user share just one password with a family member without giving access to everything?", expectation: "grounded" },
      { question: "What did users say about setting up two-factor authentication on their VaultKey account itself?", expectation: "refusal" },
    ],
  },
  {
    id: "music-streaming",
    documents: [
      {
        filename: "SoundWave listener interviews.txt",
        content: `SoundWave music streaming app - 5 interviews with listeners.

Participant 1 - Kelechi, 24, heavy playlist user. Kelechi said the auto-generated "Discover Weekly"-style playlist is usually good but occasionally repeats songs from the previous week's playlist, which defeats the purpose of a weekly discovery feature. He wants it to exclude anything from the last month of recommendations.

Participant 2 - Aisha, 30, uses it mainly offline while traveling. Aisha said downloaded songs for offline listening work well, but downloaded playlists don't automatically update if she edits the playlist while online - she has to manually re-download the whole playlist to catch new additions, which wastes data and time.

Participant 3 - Tobi, 35, family plan user. Tobi manages a family plan with his spouse and two kids, and said there's no way to set content restrictions per child profile - all family members see the same explicit content settings, and he wants per-profile parental controls instead of one setting for the whole plan.

Participant 4 - Ngozi, 28, uses lyrics feature frequently. Ngozi said synced lyrics (highlighting the current line as it plays) are highly accurate for popular English songs but often missing entirely for songs in other languages she listens to, including ones with a large catalog presence otherwise. She called it "an afterthought for anything outside the mainstream."

Participant 5 - David, 42, casual listener. David agreed with Aisha's offline sync complaint, independently describing the same frustration about downloaded playlists not reflecting edits made online, from his own experience preparing playlists before flights.

Researcher's note: the offline playlist sync issue was raised independently by two participants (Aisha, David) with nearly identical framing (specifically around preparing for travel/flights), suggesting this is a common workflow that the current sync behavior actively breaks.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Downloaded offline playlists don't automatically reflect edits made while online, requiring a full manual re-download to get new additions, which particularly affects users preparing playlists before travel.",
      },
      {
        type: "PAIN_POINT",
        description: "Synced lyrics are accurate for mainstream English songs but often missing for songs in other languages, even when those songs are otherwise available in the catalog.",
      },
      {
        type: "SUGGESTION",
        description: "A family plan user wants per-profile parental/content controls instead of one explicit-content setting shared by the entire family plan.",
      },
    ],
    chatCases: [
      { question: "If a user edits a playlist while online, does an already-downloaded offline copy of that playlist reflect the change?", expectation: "grounded" },
      { question: "Are content restrictions on a family plan the same for every profile, or can they differ per person?", expectation: "grounded" },
      { question: "What did users say about the app's equalizer or sound quality settings?", expectation: "refusal" },
    ],
  },
  {
    id: "freelance-invoicing",
    documents: [
      {
        filename: "InvoiceEase freelancer notes.txt",
        content: `InvoiceEase freelance invoicing tool - 5 interviews with freelancers.

Participant 1 - Chioma, 33, graphic designer. Chioma said recurring invoices for retainer clients work well once set up, but editing a recurring invoice template requires deleting and recreating the whole series rather than just editing future occurrences, which is tedious when a client's rate changes.

Participant 2 - Segun, 41, independent consultant. Segun's biggest frustration is that the app doesn't track partial payments well - if a client pays half an invoice now and half later, the invoice just shows "unpaid" until the full amount is received, with no way to log the partial payment against it in the meantime.

Participant 3 - Amaka, 28, freelance writer, works with international clients. Amaka said currency conversion on invoices for clients paying in a different currency isn't handled automatically - she has to manually calculate and enter the converted amount herself, and has made rounding errors that caused confusion with a client before.

Participant 4 - Tunde, 45, photographer. Tunde agreed with Segun that partial payment tracking is a real gap, independently describing needing to track a deposit paid upfront against a larger invoice for a wedding shoot, and currently keeps a separate spreadsheet just for that.

Participant 5 - Ifeoma, 37, freelance developer. Ifeoma said the expense tracking feature, meant to log business expenses for tax purposes, requires manually entering each expense with no way to import a bank statement or receipt photo, making her not bother using it and relying on a separate app instead just for expenses.

Researcher's note: partial payment tracking was independently raised by two participants (Segun, Tunde) as a real workflow gap they currently work around with a separate spreadsheet, making it the most concretely validated pain point in this round.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "The app doesn't support tracking partial payments against an invoice — an invoice shows as fully unpaid until the entire amount is received, forcing users to track deposits or partial payments in a separate spreadsheet.",
      },
      {
        type: "PAIN_POINT",
        description: "Editing a recurring invoice template requires deleting and recreating the entire series rather than editing just future occurrences.",
      },
      {
        type: "PAIN_POINT",
        description: "Currency conversion for international clients isn't automated, requiring manual calculation that has led to rounding errors and client confusion.",
      },
    ],
    chatCases: [
      { question: "If a client pays only part of an invoice, can that partial payment be recorded against it?", expectation: "grounded" },
      { question: "Is currency conversion handled automatically for clients who pay in a different currency?", expectation: "grounded" },
      { question: "What did users say about the mobile app's fingerprint or face unlock login?", expectation: "refusal" },
    ],
  },
  {
    id: "meditation-app",
    documents: [
      {
        filename: "CalmSpace user research.txt",
        content: `CalmSpace meditation and mental wellness app - 5 interviews with users.

Participant 1 - Bisola, 29, uses it for anxiety management. Bisola said the guided meditation library is extensive and well-organized by topic, but the search doesn't let her filter by session length, so finding a specifically short (5-minute) session for a quick break during a busy day means scrolling through many longer options.

Participant 2 - Emeka, 44, uses it before sleep. Emeka praised the sleep sounds feature strongly, but said the timer that stops playback after a set duration sometimes doesn't fire correctly, and sounds have continued playing all night twice, draining his phone battery and, ironically, affecting his sleep when he woke to check it.

Participant 3 - Ngozi, 35, tracks mood daily. Ngozi said the mood tracking feature is simple to use, but there's no way to see mood trends over time beyond a basic calendar view with colored dots - she wants an actual trend line or chart correlating her mood with which meditation sessions she completed that day.

Participant 4 - Tayo, 26, new user, first two weeks. Tayo said the onboarding assessment, which asks about current stress and anxiety levels, felt somewhat clinical and long for what's meant to be a calming first experience: "The first thing the app made me do was fill out what felt like a mental health questionnaire before I'd even seen what the app looks like."

Participant 5 - Funke, 50, uses it for a specific anxiety condition, sees a therapist. Funke agreed with Emeka that the sleep timer bug is real, having also experienced audio continuing past the set timer at least once. She additionally said she'd value being able to export her mood tracking data to share with her therapist, which currently isn't possible.

Researcher's note: the sleep timer failing to stop playback was independently confirmed by two participants (Emeka, Funke), making it a reproducible bug rather than an isolated device issue, and one with a real consequence (battery drain, disrupted sleep) rather than a minor annoyance.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "The sleep timer sometimes fails to stop audio playback at the set duration, letting sounds continue all night and draining battery, confirmed by two separate users.",
      },
      {
        type: "PAIN_POINT",
        description: "The onboarding assessment feels long and clinical for a wellness app's first impression, asking detailed mental health questions before the user has even seen the app.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants mood tracking data to be exportable so it can be shared with a therapist.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants to filter guided meditation sessions by length to quickly find a short session during a busy day.",
      },
    ],
    chatCases: [
      { question: "Is the sleep sound timer reliable at stopping playback when it's supposed to?", expectation: "grounded" },
      { question: "Can a user export their mood tracking history to share with a mental health professional?", expectation: "grounded" },
      { question: "What did users say about group meditation sessions with other app users?", expectation: "refusal" },
    ],
  },
  {
    id: "car-maintenance",
    documents: [
      {
        filename: "GarageLog owner interviews.txt",
        content: `GarageLog car maintenance tracker - 5 interviews with car owners.

Participant 1 - Emmanuel, 38, owns one car, drives daily. Emmanuel said the mileage-based service reminders (like oil change every 5,000 miles) work well when he manually updates his mileage, but he often forgets to update it for weeks, so reminders drift out of sync with his actual mileage. He wants an option to estimate mileage automatically based on typical driving patterns between manual updates.

Participant 2 - Fatima, 45, owns two cars for the family. Fatima said switching between her two vehicles' maintenance logs requires several taps each time, and she's accidentally logged an oil change against the wrong car twice, requiring a manual fix afterward. She wants a clearer visual indicator of which car's log she's currently viewing.

Participant 3 - Chukwuemeka, 52, owns an older car, does some maintenance himself. Chukwuemeka said the parts and cost tracking feature is useful for tax purposes, but there's no way to attach a photo of a receipt to an expense entry, so he keeps physical receipts separately as backup, which defeats some of the point of digital tracking.

Participant 4 - Blessing, 30, new car owner, relies on the app heavily since she's new to car ownership. Blessing said the maintenance recommendations are sometimes generic manufacturer defaults that don't match her specific driving conditions (mostly short city trips), and she'd value recommendations that adjust based on her actual logged driving pattern rather than a one-size-fits-all schedule.

Participant 5 - Tunde, 41, owns one car. Tunde agreed with Emmanuel about mileage drift being a real problem, saying he's been reminded for an oil change he'd already done because he forgot to log the actual mileage update in time, leading him to sometimes ignore reminders as "probably wrong anyway."

Researcher's note: mileage tracking drift (from Emmanuel and Tunde) has a compounding effect - once a user ignores one incorrect reminder, they may start distrusting and ignoring future reminders even when accurate, which undermines the core value of the reminder system.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Service reminders rely on the user manually updating mileage, and drift out of sync when they forget, leading users to distrust and ignore even accurate future reminders.",
      },
      {
        type: "PAIN_POINT",
        description: "Users managing multiple vehicles have accidentally logged maintenance against the wrong car due to unclear indication of which vehicle's log is currently open.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants to attach a photo of a receipt to a maintenance expense entry instead of keeping physical receipts separately.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants maintenance recommendations to adjust based on actual logged driving patterns rather than generic manufacturer default schedules.",
      },
    ],
    chatCases: [
      { question: "Does relying on manually updated mileage cause maintenance reminders to become inaccurate over time?", expectation: "grounded" },
      { question: "For an owner with more than one vehicle, is it easy to tell which car's maintenance log is currently being viewed?", expectation: "grounded" },
      { question: "What did users say about the app's fuel price comparison feature?", expectation: "refusal" },
    ],
  },
  {
    id: "plant-care",
    documents: [
      {
        filename: "LeafWise plant owner notes.txt",
        content: `LeafWise plant care app - 5 interviews with plant owners.

Participant 1 - Adaeze, 27, owns around fifteen houseplants. Adaeze said the watering reminder schedule is helpful, but it's based on a fixed interval per plant type rather than actual soil or light conditions in her specific home, so she's both overwatered and underwatered plants by following the generic schedule too strictly at first.

Participant 2 - Chidi, 34, new plant owner, three plants. Chidi said the plant identification feature (photograph a plant to identify its species) works well for common houseplants but failed to identify a slightly unusual variety he owns, instead suggesting an incorrect similar-looking species, which led him to follow the wrong care instructions for weeks before noticing his plant wasn't thriving.

Participant 3 - Ngozi, 41, plant enthusiast, owns over thirty plants. Ngozi said organizing plants by room works well for her, but she wants to also filter or group by care difficulty level so she can quickly see which plants need the most attention when she's short on time.

Participant 4 - Tobi, 29, forgetful about watering, relies heavily on reminders. Tobi agreed with Adaeze that fixed-interval watering reminders don't account for his home's specific conditions (a notably dry apartment due to heating), and he's had to manually adjust every single reminder shorter than the app's default, which he called "a lot of setup for something that should adapt on its own."

Participant 5 - Funmi, 36, travels frequently for work. Funmi wants a "vacation mode" that adjusts all watering reminders while she's away and a trusted person is caring for her plants temporarily, since right now she has to manually pause or edit each plant's reminder individually before every trip.

Researcher's note: two participants (Adaeze, Tobi) independently described the same underlying issue - fixed watering intervals not adapting to real home conditions - though they framed it differently (overwatering vs. a dry apartment), suggesting the schedule's rigidity is the shared root cause rather than either specific symptom.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Watering reminders use a fixed interval per plant type regardless of actual home conditions like light or humidity, leading to over- or under-watering when users follow the schedule too strictly.",
      },
      {
        type: "PAIN_POINT",
        description: "Plant identification by photo can misidentify uncommon varieties as a similar-looking but incorrect species, leading users to follow wrong care instructions.",
      },
      {
        type: "SUGGESTION",
        description: "A frequent traveler wants a vacation mode that adjusts all watering reminders at once instead of manually pausing or editing each plant's reminder individually before a trip.",
      },
    ],
    chatCases: [
      { question: "Do watering reminders adapt to the specific conditions of a user's home, or are they the same for everyone with the same plant type?", expectation: "grounded" },
      { question: "Is the photo-based plant identification feature always accurate?", expectation: "grounded" },
      { question: "What did users say about buying plants directly through the app's marketplace?", expectation: "refusal" },
    ],
  },
  {
    id: "expense-splitting",
    documents: [
      {
        filename: "SplitEasy roommate research.txt",
        content: `SplitEasy expense-splitting app - 5 interviews with roommates and groups who use it.

Participant 1 - Zainab, 24, splits rent and utilities with two roommates. Zainab said unequal splits (like one roommate having a bigger room and paying more rent) are supported but awkward to set up each month - the app defaults to an equal split and she has to manually adjust it every single time rather than saving a custom split ratio as the new default.

Participant 2 - Kunle, 30, splits a group vacation's expenses with friends. Kunle said the settle-up feature, which calculates who owes whom, works correctly but the suggested "simplify debts" option that minimizes the number of payments sometimes changes who is paying whom to someone they didn't personally spend money with, which confused a couple of his friends who expected to pay back only the person they specifically owed.

Participant 3 - Amara, 27, splits household expenses with a partner. Amara said receipt photo attachment works well for logging an expense, but there's no way to itemize a single receipt into multiple categories - a grocery run that included both shared and personal items has to be entered as one lump expense or manually split into two separate entries herself.

Participant 4 - Tobi, 33, manages a group house of four. Tobi agreed with Zainab that recurring unequal splits are tedious to redo monthly, independently describing the same workaround of just remembering the ratios and re-entering them by hand every time bills come in.

Participant 5 - Chidinma, 29, uses it casually with friends for shared subscriptions. Chidinma said reminders for recurring shared subscriptions (like a streaming service split three ways) work well, but there's no way to see a combined view of all her active splits across different groups - she has to check each group separately to see her total owed across everything.

Researcher's note: the inability to save a custom, non-equal split ratio as a recurring default was independently raised by two participants (Zainab, Tobi) in the context of monthly household bills, both describing manually re-entering the same ratio each time as unnecessary repeated effort.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Custom unequal expense splits can't be saved as a recurring default, forcing users to manually re-enter the same split ratio every month for recurring bills.",
      },
      {
        type: "PAIN_POINT",
        description: "The debt-simplifying settle-up feature can reassign who pays whom to someone they didn't personally spend money with, confusing users who expected to repay only the specific person they owed.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants the ability to itemize a single receipt into multiple expense categories instead of entering it as one lump sum or creating separate manual entries.",
      },
      {
        type: "SUGGESTION",
        description: "A user active in multiple expense-splitting groups wants a combined view of their total amount owed across all groups instead of checking each group separately.",
      },
    ],
    chatCases: [
      { question: "If roommates split rent unevenly, does the app remember that split for future months automatically?", expectation: "grounded" },
      { question: "Can the debt simplification feature end up assigning a payment to someone other than who the money was originally spent with?", expectation: "grounded" },
      { question: "What did users say about splitting expenses in a currency other than their home currency?", expectation: "refusal" },
    ],
  },
  {
    id: "video-conferencing",
    documents: [
      {
        filename: "MeetHub call quality research.txt",
        content: `MeetHub video conferencing tool - 5 interviews with regular users.

Participant 1 - Ifeoma, 36, manages a remote team. Ifeoma said the meeting recording feature works well, but transcripts generated from recordings frequently misattribute who said what when two people speak in quick succession, making the transcript confusing to review afterward for anyone who missed the live meeting.

Participant 2 - Segun, 42, sales role, many external client calls. Segun said virtual backgrounds work well on his laptop but cause noticeable lag and dropped frames on his older work phone, and there's no in-app warning that his device might struggle with that feature before he turns it on mid-call.

Participant 3 - Aisha, 29, uses breakout rooms for workshops. Aisha said breakout rooms work well for splitting a group, but the host has no way to broadcast a message to all breakout rooms at once - she has to manually visit each room to give a time update, disrupting each group's discussion individually.

Participant 4 - David, 50, less technical, joins calls via a link without an account. David said joining a meeting as a guest (no account) sometimes fails to properly connect his microphone, and the error message is generic ("something went wrong"), giving him no idea whether to retry, check settings, or restart the app.

Participant 5 - Chioma, 33, hosts frequent one-on-one calls. Chioma agreed with Ifeoma that transcript speaker attribution is a real problem, independently describing the same issue during a two-person interview call where the transcript repeatedly attributed both speakers' lines to a single name.

Researcher's note: transcript speaker misattribution was independently confirmed by two participants in different call contexts (a team meeting and a two-person interview), suggesting the issue isn't specific to group size but a broader limitation of the transcription feature itself.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Meeting transcripts frequently misattribute who said what when speakers talk in quick succession, confirmed across both group meetings and two-person calls, making transcripts confusing to review.",
      },
      {
        type: "PAIN_POINT",
        description: "Virtual backgrounds cause lag and dropped frames on older devices with no warning before the user enables the feature.",
      },
      {
        type: "PAIN_POINT",
        description: "Guests joining without an account sometimes have microphone connection failures with only a generic error message, leaving them unsure how to resolve it.",
      },
      {
        type: "SUGGESTION",
        description: "A host running breakout rooms wants to broadcast a single message to all breakout rooms at once instead of visiting each room individually.",
      },
    ],
    chatCases: [
      { question: "Is meeting transcript speaker attribution reliable when people talk close together?", expectation: "grounded" },
      { question: "Does the app warn a user if their device might not handle virtual backgrounds well?", expectation: "grounded" },
      { question: "What did users say about scheduling meetings directly through a calendar integration?", expectation: "refusal" },
    ],
  },
  {
    id: "habit-tracker",
    documents: [
      {
        filename: "DailyWin habit tracker notes.txt",
        content: `DailyWin habit tracking app - 5 interviews with users.

Participant 1 - Tobi, 28, tracks five daily habits. Tobi said the streak counter is motivating, but missing a single day resets the streak to zero with no distinction between missing once versus missing many days in a row, which feels disproportionately punishing: "One bad day shouldn't erase three months the same way giving up entirely would."

Participant 2 - Amaka, 35, tracks habits tied to a specific health goal. Amaka said habit reminders are configurable by time of day, but not by day of week, so a gym habit she only does on weekdays still reminds her on weekends, and she's had to just ignore or ninety dismiss the weekend reminders instead of the app respecting her actual schedule.

Participant 3 - Chidi, 41, tracks many small habits, values data. Chidi said the statistics view shows completion percentage over time, but there's no way to see which specific days of the week he's most likely to skip a habit, information he wants to identify a real pattern rather than just an overall number.

Participant 4 - Ngozi, 26, new user, first month. Ngozi agreed with Tobi that the all-or-nothing streak reset feels harsh, independently suggesting a "streak freeze" or forgiveness mechanic similar to what she's seen in language learning apps, where a limited number of missed days per month don't break the streak.

Participant 5 - Femi, 45, tracks habits with a partner for accountability. Femi wants a shared habit view where he and his partner can see each other's progress on a shared goal, like both trying to drink more water daily, but currently each person's tracking is completely private with no sharing option at all.

Researcher's note: the harshness of the all-or-nothing streak reset was independently raised by two participants (Tobi, Ngozi), with Ngozi specifically referencing a "streak freeze" mechanic from another app category as a model for how this could be improved without abandoning streaks entirely.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "Missing a single day resets a habit streak to zero with no distinction between a rare miss and giving up entirely, which feels disproportionately punishing to users.",
      },
      {
        type: "PAIN_POINT",
        description: "Habit reminders can be scheduled by time of day but not by day of week, so reminders fire on days a habit isn't actually scheduled, like a weekday-only gym habit reminding on weekends.",
      },
      {
        type: "SUGGESTION",
        description: "A user suggested a streak-freeze or forgiveness mechanic, similar to language learning apps, that allows a limited number of missed days per month without fully resetting the streak.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants a shared habit view so they and an accountability partner can see each other's progress on a shared goal.",
      },
    ],
    chatCases: [
      { question: "If someone misses just one day, does the app treat that the same as giving up on the habit entirely?", expectation: "grounded" },
      { question: "Can habit reminders be limited to specific days of the week rather than every day?", expectation: "grounded" },
      { question: "What did users say about earning badges or achievements for long streaks?", expectation: "refusal" },
    ],
  },
  {
    id: "event-discovery",
    documents: [
      {
        filename: "LocalScene event app research.txt",
        content: `LocalScene local event discovery app - 5 interviews with users.

Participant 1 - Grace, 25, attends events frequently. Grace said the event recommendation feed is generally relevant to her interests, but doesn't account for events she's already marked as "not interested," continuing to show similar events from the same organizer repeatedly, similar to feedback ignored elsewhere in other recommendation systems she's used.

Participant 2 - Emeka, 33, discovers events mainly through friends. Emeka said the "friends going" feature, showing which of his connections plan to attend an event, is his favorite feature and directly influences his decisions, but it only shows friends who set their profile to public, and he suspects several friends are actually going but just have private profiles, understating the real social signal.

Participant 3 - Aisha, 29, buys tickets through the app. Aisha said ticket purchasing flow is smooth, but there's no way to see a seating chart or venue layout before buying for events with assigned seating, so she's bought seats that turned out to have an obstructed view without knowing beforehand.

Participant 4 - Tunde, 40, occasional attendee, price-sensitive. Tunde wants a price-drop alert for events, similar to flight price tracking, so he can be notified if a ticket price decreases closer to the event date, which he's noticed happens sometimes for under-sold events.

Participant 5 - Ngozi, 31, event organizer, uses the app both to attend and promote her own events. Ngozi said as an organizer, the analytics for her posted events are very basic, just a view count, with no breakdown of how many viewers converted to ticket buyers, which she needs to judge whether her event description or pricing is working.

Researcher's note: the "friends going" feature's usefulness being limited by profile privacy settings is a structural gap rather than a bug - the feature works as designed but understates true attendance due to how many users keep profiles private, which Emeka suspects but can't verify from his side.`,
      },
    ],
    expectedInsights: [
      {
        type: "PAIN_POINT",
        description: "The event recommendation feed continues showing similar events from an organizer even after a user marks a specific event as not interested.",
      },
      {
        type: "PAIN_POINT",
        description: "The 'friends going' social signal only reflects friends with public profiles, likely understating true attendance among a user's connections since many profiles are private.",
      },
      {
        type: "SUGGESTION",
        description: "A user wants to see a seating chart or venue layout before purchasing assigned-seating tickets to avoid an unexpected obstructed view.",
      },
      {
        type: "SUGGESTION",
        description: "An event organizer wants view-to-purchase conversion analytics for their posted events, not just a raw view count.",
      },
    ],
    chatCases: [
      { question: "Does the 'friends going' feature show every friend attending, or only some of them?", expectation: "grounded" },
      { question: "Can a ticket buyer see the venue's seating layout before purchasing seats for an assigned-seating event?", expectation: "grounded" },
      { question: "What did users say about refund policies for canceled events?", expectation: "refusal" },
    ],
  },
];
