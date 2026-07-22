// Small fixture CSVs used across the metric tests.
// Timeline: dataThrough = 2026-07-15 (a Wednesday; current week = Mon 7/13 – Sun 7/19).
// All task timestamps use 18:00 UTC = 11:00 LA (same calendar date) unless
// deliberately testing the timezone boundary.

export const ALICE = "alice@mercor.expert";
export const BOB = "bob@mercor.expert";
export const CAROL = "carol@mercor.expert";
export const DAVE = "dave@mercor.expert"; // in roles, no tasks/hours

const H = "TASK_ID,WRITER_CLAIM_TIME,REVIEWER_CLAIM_TIME,QA_CLAIM_TIME,writer_email,reviewer_email,qa_email,writer_name,reviewer_name,qa_name,date_written,date_reviewed,date_qa_reviewed,num_writer_attempts,approved,qa_approved,ERROR_CATEGORY,FIELD_DOMAIN,NUM_SOURCES,LIST_LENGTH";

const row = (
  id: string,
  writer: string,
  reviewer: string,
  written: string,
  reviewed: string,
  qaReviewed: string,
  attempts: number,
  approved: string,
  qaApproved: string,
  errors: string
) =>
  `${id},100,50,,${writer},${reviewer},,W Name,R Name,,${written},${reviewed},${qaReviewed},${attempts},${approved},${qaApproved},${errors},Travel,3,LL2`;

export const TASKS_CSV = [
  H,
  // t1: plain approved write, 2 attempts, one major + one minor error
  row("t1", ALICE, BOB, "2026-07-10 18:00:00+00", "2026-07-10 18:30:00+00", "", 2, "y", "n",
    '"[""Accuracy - major"",""Source - minor""]"'),
  // t2: approved AND qa_approved — the OR/dedup rule: counts exactly once
  row("t2", ALICE, BOB, "2026-07-13 18:00:00+00", "2026-07-14 18:00:00+00", "", 1, "y", "y", ""),
  // t3: blank reviewer → awaiting review
  row("t3", ALICE, "", "2026-07-15 18:00:00+00", "", "", 1, "n", "n", ""),
  // t4: super-writer self row — write + quality yes, review no
  row("t4", CAROL, CAROL, "2026-07-14 18:00:00+00", "2026-07-14 18:10:00+00", "", 3, "y", "n",
    '"[""Objectivity - minor""]"'),
  // t5: approved but no date_reviewed → approvalDate falls back to date_written (7/12)
  row("t5", ALICE, BOB, "2026-07-12 18:00:00+00", "", "", 1, "y", "n", ""),
  // t6: QA-only approval → dated by date_qa_reviewed (7/05); reviewed 7/02 (2w edge)
  row("t6", ALICE, BOB, "2026-07-01 18:00:00+00", "2026-07-02 18:00:00+00", "2026-07-05 18:00:00+00", 2, "n", "y", ""),
  // t7: timezone boundary — 03:00 UTC on 7/15 is 20:00 LA on 7/14
  row("t7", ALICE, "", "2026-07-15 03:00:00+00", "", "", 4, "n", "n", ""),
  // t8: bob writes one (reviewer carol) — feeds bob's own-write touches
  row("t8", BOB, CAROL, "2026-07-14 18:00:00+00", "2026-07-15 18:00:00+00", "", 2, "y", "n", ""),
  // t9: unparseable ERROR_CATEGORY → no errors, flagged on data-health
  row("t9", ALICE, BOB, "2026-07-14 18:00:00+00", "2026-07-15 18:00:00+00", "", 1, "n", "n", "notjson"),
].join("\n");

const HH = "USERID,USER_NAME,MERCOR_EXPERT_EMAIL,total_hours_all_time,total_hours_in_period,hours_last_1d,hours_last_3d,hours_last_7d,Date (Add)";

const hrow = (email: string, total: number, last1: number, last3: number, last7: number, date: string) =>
  `uid-${email},Name,${email},${total},0,${last1},${last3},${last7},${date}`;

export const HOURS_CSV = [
  HH,
  // alice: first row daily = hours_last_1d (2); 7/14 diff +2; 7/15 diff −1 → clamp 0
  hrow(ALICE, 10, 2, 2, 2, "7/13/2026"),
  hrow(ALICE, 12, 2, 4, 4, "7/14/2026"),
  hrow(ALICE, 11, 0, 4, 4, "7/15/2026"), // last_3d=4 matches reconstruction (0+2+2)
  hrow(BOB, 6, 1.5, 1.5, 1.5, "7/15/2026"),
  hrow(CAROL, 5, 1, 1, 1, "7/10/2026"),
  hrow(CAROL, 8, 0, 0, 0, "7/15/2026"), // gap → 3d/7d not fully covered, no validation
].join("\n");

export const ROLES_CSV = [
  "Name,Email,Contractor Email,Helper,Tags,Contract Status",
  `Alice A,alice.personal@gmail.com,${ALICE},Unique,Writer,Active`,
  `Bob B,bob.personal@gmail.com,${BOB},Unique,"Reviewer, Super-Writer",Active`,
  `Carol C,carol.personal@gmail.com,${CAROL},Unique,Super-Writer,Active`,
  `Dave D,dave.personal@gmail.com,${DAVE},Unique,Onboarding,Active`,
].join("\n");
