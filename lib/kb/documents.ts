// Curated knowledge base seed content for this hackathon prototype.
//
// Every document below is an ORIGINAL paraphrase — written in our own words, never copied
// sentences or mirrored the structure of the source — of a real, named public patient-education
// page (MedlinePlus, the U.S. National Library of Medicine's consumer health site, preferred;
// Singapore public-health sources as the alternative for region-specific topics like dengue).
// The exact source title, publisher, and URL are recorded in each document's `source` field so
// the citation is auditable. This is a small, explicit, hand-curated set (16 documents covering
// common discharge scenarios) — not a scrape — which is the whole point of the "curated KB
// first" strategy in lib/rag.ts.
//
// This same array backs two things: (1) the keyword-overlap fallback search used when
// Supabase/embeddings aren't configured, and (2) the source data for lib/kb/seed.ts, which
// embeds and upserts these documents into Supabase pgvector when you do have it configured.
// Keep this file the single source of truth for KB content — don't hand-edit rows in Supabase.

import type { KbDocument } from "../types";

export const KB_DOCUMENTS: KbDocument[] = [
  {
    id: "surgical-wound-care",
    title: "Caring for a surgical incision at home",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Surgical wound care - closed" (medlineplus.gov/ency/patientinstructions/000738.htm) and "Surgical wound care - open" (medlineplus.gov/ency/patientinstructions/000040.htm)',
    condition: ["surgical wound care", "post-op", "appendectomy", "incision", "dressing change"],
    content: `Wash your hands before and after touching the incision, and keep the area clean and
dry — most people can shower after about 24 hours, but soaking in a bath, hot tub, or pool
should wait until your surgeon clears it, since prolonged soaking can reopen or infect a healing
wound. If the wound was left open rather than stitched closed, expect it to heal gradually from
the inside out; use only the cleaning solution and dressing type your care team specified, since
ordinary antiseptics, alcohol, or peroxide can slow healing of an open wound. Avoid lotions,
powders, or antibiotic creams unless your surgeon told you to use them. Mild redness and some
pulling right at the incision line is normal in the first few days. What isn't normal: redness
or swelling that keeps increasing rather than settling down, drainage that turns thick, yellow,
green, or foul-smelling, the wound edges separating, or a temperature above 100°F (37.8°C) that
persists for more than a few hours — any of these are reasons to call your surgeon. Always
follow your own discharge sheet's specific instructions over this general guidance.`,
  },
  {
    id: "wound-signs-to-watch",
    title: "Signs a wound may need medical attention",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "How wounds heal" (medlineplus.gov/ency/patientinstructions/000741.htm)',
    condition: ["wound care", "infection signs", "post-op", "healing"],
    content: `A healing wound moves through recognizable stages: bleeding stops and a scab forms
within minutes to hours, then over the next few days the area may look red, mildly swollen, and
ooze some clear fluid as the body clears debris and fights off germs — this is a normal, expected
phase, not necessarily infection. Over the following weeks, new tissue fills in and the wound
gradually closes and fades to a thinner scar. Signs that a wound has moved from normal healing
into a problem include: redness that keeps spreading rather than staying at the wound edge, pus
or thick yellow/green drainage, a foul smell, black or darkened tissue at the wound edges,
bleeding that won't stop after ten minutes of firm pressure, pain that isn't controlled by the
medication you were given, or a fever of 100°F (37.8°C) or higher that lasts more than a few
hours. Any of these warrant a call to your provider rather than waiting to see if it resolves on
its own.`,
  },
  {
    id: "rice-protocol",
    title: "RICE protocol for sprains and minor fractures",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): RICE — rest, ice, compression, elevation (medlineplus.gov/ency/imagepages/19396.htm)',
    condition: ["fracture", "sprain", "orthopedic", "RICE", "soft tissue injury"],
    content: `For a sprain, strain, or minor injury where a fracture hasn't been diagnosed, the
standard first-aid approach is rest, ice, compression, and elevation. Rest the injured area and
avoid putting weight on it. Apply an ice pack wrapped in a thin cloth — never directly on skin —
to help control swelling. A snug, not tight, elastic wrap can add compression if your provider
recommended one. Keeping the area raised above heart level when possible also helps limit
swelling. Pain and swelling typically ease within about 48 hours, though it's common to need one
to several weeks before full weight-bearing or normal movement is comfortable again — don't push
through pain to test it early. This approach is only for injuries where a break has been ruled
out; if a fracture is suspected, or the area becomes numb, unusually pale, or cold, or the pain
suddenly worsens, seek medical evaluation instead of relying on RICE alone.`,
  },
  {
    id: "dengue-home-care",
    title: "Home care and warning signs during dengue/viral fever recovery",
    source:
      'Paraphrased from Singapore\'s Communicable Diseases Agency: "Dengue fever and dengue haemorrhagic fever" (cda.gov.sg/public/diseases/dengue-fever-and-dengue-haemorrhagic-fever) and HealthXchange.sg (SingHealth): "Dengue Fever: How to Recover Fast" (healthxchange.sg/how-to-manage/dengue-fever/dengue-fever-how-to-recover-fast)',
    condition: ["dengue", "viral fever", "observation discharge", "hydration"],
    content: `There's no specific antiviral treatment for dengue or similar viral fevers — care at
home is mainly supportive: rest, stay well hydrated with water or oral rehydration fluids, and
check your temperature regularly. For fever or aches, paracetamol (acetaminophen) is generally
preferred over NSAIDs such as ibuprofen, aspirin, or other anti-inflammatory painkillers, because
those can raise the risk of bleeding in dengue specifically. Staying in bed and moving carefully
also reduces the risk of a fall or bruise turning into a bleeding problem. Most people recover
within one to two weeks. Warning signs that call for prompt medical review include: severe or
persistent abdominal pain, repeated vomiting, bleeding from the gums or nose, blood in vomit or
stool, unusual drowsiness, restlessness or irritability, or cold, pale, or clammy skin. These
warning signs classically appear one to two days after the fever itself starts to come down — a
fever that drops while the patient starts feeling worse, not better, is a recognized red flag in
dengue recovery and shouldn't be mistaken for improvement.`,
  },
  {
    id: "post-op-activity-restrictions",
    title: "Following activity restrictions after a procedure",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Leaving the hospital - your discharge plan" (medlineplus.gov/ency/patientinstructions/000867.htm)',
    condition: ["activity restriction", "post-op", "lifting", "discharge plan"],
    content: `Every discharge plan sets specific limits on lifting, driving, stair use, and other
activity, and these limits are tailored to your particular procedure and how internal healing is
expected to progress — something that isn't visible from how the incision looks on the outside.
An incision can appear closed and comfortable while deeper tissue, a joint repair, or an internal
suture line is still fragile. Resuming a restricted activity earlier than advised is a
well-recognized cause of avoidable complications and readmission, from wound reopening to
internal strain. If a restriction feels unclear, or you're unsure whether a specific activity —
driving, a work task, lifting a particular weight — falls within what's allowed, it's reasonable
to check with your care team rather than assume it's fine. This applies just as much to a
caregiver helping someone else follow their plan as it does to the patient themselves.`,
  },
  {
    id: "medication-adherence",
    title: "Taking discharge medications as prescribed",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Taking multiple medicines safely" (medlineplus.gov/ency/patientinstructions/000883.htm)',
    condition: ["medication", "adherence", "antibiotics", "polypharmacy"],
    content: `Take each medication at the dose, frequency, and duration your provider prescribed —
for antibiotics in particular, finish the entire course even once symptoms improve, since
stopping early is a common reason an infection returns or becomes harder to treat. If you miss a
dose, follow the instructions on the label or discharge sheet for what to do next rather than
doubling up on your own judgment. Managing several medications at once raises the risk of mix-ups
and interactions, so keeping an up-to-date list of everything you take — including
over-the-counter medicines and supplements — and sharing it with every provider you see helps
catch problems before they happen. If a side effect appears, tell your provider about it; don't
stop or change a medication on your own without checking first, even if you suspect it's the
cause.`,
  },
  {
    id: "when-to-seek-urgent-care",
    title: "When to seek urgent or emergency care during recovery",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Recognizing medical emergencies" (medlineplus.gov/ency/article/001927.htm)',
    condition: ["emergency", "urgent care", "universal warning signs", "911"],
    content: `Certain signs call for urgent evaluation regardless of what procedure or condition
you're recovering from: bleeding that won't stop, difficulty breathing or shortness of breath,
chest pain or pressure lasting more than a couple of minutes, sudden severe pain anywhere,
coughing up blood, fainting or loss of consciousness, sudden confusion or trouble speaking,
sudden weakness or vision changes, or swelling of the face, lips, or tongue. In general, if a
situation seems life-threatening, could become life-threatening on the way to care, or moving the
person could make an injury worse, calling emergency services rather than driving yourself is the
safer choice. These are broad, procedure-independent warning signs meant as a baseline — they sit
alongside, and don't replace, the specific warning signs your own doctor gave you for your
particular situation, which should be treated as more specific and authoritative.`,
  },
  {
    id: "follow-up-importance",
    title: "Why follow-up appointments matter",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Leaving the hospital - your discharge plan" (medlineplus.gov/ency/patientinstructions/000867.htm)',
    condition: ["follow-up", "readmission prevention", "discharge plan"],
    content: `A follow-up appointment lets a clinician check on things that can't really be
assessed from home — how an incision is healing beneath the surface, whether a lab value or vital
sign has normalized, whether a repaired joint or organ is recovering as expected — and catch a
developing problem while it's still easy to treat. Your discharge plan should include the date,
time, and contact details for each follow-up, along with who to call with questions in the
meantime. Missing a follow-up is a recognized contributor to complications and hospital
readmission that would otherwise have been caught early. If a follow-up date is unclear, was
never scheduled, or you're unable to make it, call the clinic to reschedule rather than let it
lapse — this is worth treating as seriously as taking a medication or watching for warning signs.`,
  },
  {
    id: "csection-recovery",
    title: "Recovering from a cesarean section (C-section)",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Going home after a C-section" (medlineplus.gov/ency/patientinstructions/000624.htm)',
    condition: ["c-section", "cesarean", "postpartum", "incision", "childbirth"],
    content: `Expect the incision to look slightly raised and darker than surrounding skin at
first, with tenderness that can last three weeks or more even as day-to-day pain eases after the
first two to three days. Change the dressing daily or whenever it gets wet or soiled, and wash
the area gently with mild soap and water during a shower rather than soaking in a bath, hot tub,
or pool until your provider clears it — usually around three weeks. Avoid lifting anything
heavier than your baby, strenuous housework, or exercise that leaves you breathless for about six
to eight weeks, and don't drive for at least two weeks or while taking prescription pain
medication. Vaginal bleeding (lochia) is expected for up to six weeks, gradually lightening from
red to pink to a yellow-white color. Contact your provider for heavy bleeding, a fever, increasing
incision pain, redness, or drainage, foul-smelling discharge, calf swelling or pain, severe
headaches or vision changes, or intense mood changes — some of these can point to complications
like infection, a blood clot, or postpartum preeclampsia.`,
  },
  {
    id: "diabetic-foot-wound-care",
    title: "Caring for a diabetic wound or foot injury",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Diabetes - foot ulcers" (medlineplus.gov/ency/patientinstructions/000077.htm)',
    condition: ["diabetic foot", "diabetes", "wound care", "foot ulcer"],
    content: `A diabetic foot wound needs daily attention: keep it clean, covered with the dressing
your provider recommended, and check it — or have someone check it — every day for changes, since
reduced sensation from diabetes can mean an infection isn't first noticed through pain. Keeping
blood sugar well controlled directly affects how well the wound heals and how well your body can
fight infection, so tighter glucose control matters as much as the dressing itself during this
period. Staying off the healing area is important — even a few minutes of pressure on an ulcer
can undo the progress made over the rest of the day, so follow any instructions about special
footwear, offloading boots, or reduced walking. Wear well-fitted, protective shoes, not sandals,
flip-flops, or anything tight, and avoid going barefoot. Contact your provider promptly for
increasing redness, warmth, swelling, drainage, odor, new pain, fever, or if any part of the wound
looks very pale, blue, or black.`,
  },
  {
    id: "cardiac-procedure-recovery",
    title: "Recovery after a cardiac procedure (e.g. angioplasty, bypass)",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Angioplasty and stent - heart - discharge" (medlineplus.gov/ency/patientinstructions/000091.htm) and "Heart bypass surgery - discharge" (medlineplus.gov/ency/patientinstructions/000102.htm)',
    condition: ["angioplasty", "stent", "bypass", "cardiac", "heart procedure"],
    content: `After a stent/angioplasty or bypass procedure, medications that keep blood from
clotting around the repaired artery or stent — commonly aspirin plus a second antiplatelet
medicine — are critical to take exactly as prescribed; stopping them on your own, even briefly,
raises the risk of the artery or stent blocking again. Keep the catheter or incision site clean
and dry for the first day or two, and hold firm pressure on it if it starts bleeding or swelling.
Activity is usually built back up gradually: short walks are encouraged early on, while heavy
lifting, driving, and strenuous exercise wait several weeks depending on the specific procedure,
and any activity that brings on chest pain, dizziness, or shortness of breath should be stopped
immediately. Watch for and report: chest pain or breathlessness that doesn't go away with rest, an
irregular or unusually fast or slow pulse, fainting, swelling or discoloration in the limb near
the procedure site, a fever, or any sign the incision is worsening rather than settling.`,
  },
  {
    id: "concussion-head-injury-care",
    title: "Home care after a concussion or minor head injury",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Concussion in adults - discharge" (medlineplus.gov/ency/patientinstructions/000126.htm)',
    condition: ["concussion", "head injury", "traumatic brain injury", "rest"],
    content: `The main treatment after a concussion is rest — both physical and mental — with a
gradual, symptom-guided return to normal activity rather than jumping back in all at once.
Someone should stay with the patient and check on them periodically for the first day, since
certain new symptoms can signal a more serious injury. Light activity around the house is fine,
but avoid exercise, heavy lifting, contact sports, driving, or operating machinery until a
provider clears it, and hold off on screen-heavy activities like studying or gaming if they bring
symptoms back. For pain, use only acetaminophen — avoid aspirin, ibuprofen, and other NSAIDs,
which can increase bleeding risk after a head injury. It's common to feel irritable, foggy, or
have headaches and dizziness for days to weeks. Seek urgent care for a worsening or unrelenting
headache, repeated vomiting, fluid draining from the nose or ears, a seizure, slurred speech,
unusual behavior, or new double vision.`,
  },
  {
    id: "elderly-fall-care",
    title: "Caring for an elderly patient after a fall",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "After a fall in the hospital" (medlineplus.gov/ency/patientinstructions/000441.htm) and "Preventing falls" (medlineplus.gov/ency/patientinstructions/000052.htm)',
    condition: ["fall", "elderly", "older adult", "fall prevention", "head injury"],
    content: `After an older adult has a fall, the immediate priority is checking they're breathing
and responsive, looking for obvious injury, and — if there's any chance of a neck, back, or head
injury — avoiding moving or sitting them up until it's medically assessed. In the hours
afterward, keep an eye on alertness, and watch for confusion, new weakness, dizziness, or
trembling, any of which can point to an injury that wasn't obvious right away. Once the immediate
risk has been checked out, reducing the chance of another fall matters just as much: clear loose
rugs and cords, add grab bars and non-slip mats in the bathroom, keep walkways well lit, and use a
cane, walker, or other prescribed mobility aid consistently rather than only some of the time.
It's also worth having a provider review medications that can cause dizziness or drowsiness.
Contact a provider after any fall — even one that seems minor — and especially if there's new
pain, swelling, or a change in how steady or alert the person seems.`,
  },
  {
    id: "pneumonia-chest-infection-recovery",
    title: "Managing a chest infection or pneumonia recovery at home",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Pneumonia in adults - discharge" (medlineplus.gov/ency/patientinstructions/000017.htm)',
    condition: ["pneumonia", "chest infection", "respiratory", "cough"],
    content: `Recovering from pneumonia or a chest infection takes time even after leaving the
hospital: a cough can linger for one to two weeks, and normal energy levels may take two weeks or
longer to fully return, so pacing activity and getting adequate rest matters more than pushing
through tiredness. If you were prescribed antibiotics, take the complete course even once you
start feeling better — stopping early is a common reason the infection doesn't fully clear. Deep
breathing exercises a few times an hour, staying well hydrated, and using a humidifier can help
loosen mucus, and coughing itself is a helpful, not harmful, way to clear the lungs, so don't
suppress it with cough suppressants unless your provider says it's fine. Contact your provider or
seek emergency care for breathing that's getting harder, faster, or more shallow, chest pain with
breathing, new confusion or excessive sleepiness, a return of fever, coughing up blood or dark
mucus, or bluish coloring around the lips or fingertips.`,
  },
  {
    id: "joint-replacement-recovery",
    title: "Recovery after a hip or knee replacement",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Hip replacement - discharge" (medlineplus.gov/ency/patientinstructions/000169.htm) and "Knee joint replacement - discharge" (medlineplus.gov/ency/patientinstructions/000170.htm)',
    condition: ["hip replacement", "knee replacement", "joint replacement", "orthopedic surgery"],
    content: `Recovery after a hip or knee replacement is built around two things at once:
protecting the new joint while it heals, and following through on the exercises that rebuild
strength and motion around it. Early on, use the walker or crutches provided, avoid sitting in low
or soft chairs, and don't twist, kneel, pivot, or squat against resistance, since these movements
are the main way a new hip in particular can be dislocated in the first few months. Keep to short
bursts of activity and avoid sitting still for more than about 45 minutes at a stretch to prevent
stiffness. Wound care follows a familiar pattern — clean, dry dressings changed as instructed,
gentle one-direction cleaning rather than scrubbing, and no soaking in a bath or pool until your
surgeon clears it, usually after stitches or staples come out around 10-14 days. Contact your
surgeon promptly for a sudden increase in pain, redness or drainage at the incision, calf swelling
or pain (a possible blood clot sign), a fever, or any sensation that the joint has shifted or is
unstable.`,
  },
  {
    id: "pediatric-day-surgery-recovery",
    title: "Caring for a child recovering from a common day-surgery procedure (e.g. tonsillectomy)",
    source:
      'Paraphrased from MedlinePlus (U.S. National Library of Medicine): "Tonsil and adenoid removal - discharge" (medlineplus.gov/ency/patientinstructions/000155.htm)',
    condition: ["tonsillectomy", "pediatric", "day surgery", "child", "adenoid removal"],
    content: `Most children go home the same day after a tonsillectomy, with full recovery
typically taking about one to two weeks — faster if only the adenoids were removed. Expect a sore
throat, bad breath, ear pain, and mild fever for the first day or two; these are normal, not signs
of a complication. Soft, cool foods (yogurt, mashed potatoes, ice cream, smoothies) go down
easiest — acidic juices, spicy food, and rough or crunchy textures can irritate the healing throat
and are best avoided for the first couple of weeks. Keep your child away from strenuous play or
sports for about two weeks, since increased activity can raise the risk of bleeding at the
surgical site. If any bleeding shows up in the mouth, have your child spit it out rather than
swallow it, and use only acetaminophen for pain, not aspirin. Seek care right away for bright red
bleeding, trouble breathing or swallowing, vomiting that won't stop, or a fever that persists —
these need prompt medical attention rather than a wait-and-see approach.`,
  },
];
