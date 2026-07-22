// Core domain types for the Project Agnus dashboard.
// All emails are normalized (lowercased, trimmed) at parse time.
// All dates used for bucketing are LA-calendar-date strings "YYYY-MM-DD".

export type Severity = "major" | "minor";

export interface TaskError {
  type: string;
  severity: Severity;
}

export interface Task {
  taskId: string;
  writerClaimTime: number | null;
  reviewerClaimTime: number | null;
  qaClaimTime: number | null;
  writerEmail: string; // normalized
  reviewerEmail: string | null; // normalized; null when blank (awaiting review)
  qaEmail: string | null;
  writerName: string;
  reviewerName: string;
  qaName: string;
  dateWritten: string | null; // LA date "YYYY-MM-DD"
  dateReviewed: string | null;
  dateQaReviewed: string | null;
  dateWrittenRaw: string; // original timestamp for display/sorting within a day
  dateReviewedRaw: string;
  dateQaReviewedRaw: string;
  numWriterAttempts: number;
  approved: boolean;
  qaApproved: boolean;
  errors: TaskError[];
  errorCategoryRaw: string;
  errorParseFailed: boolean; // raw value present but not (fully) parseable
  fieldDomain: string;
  numSources: string;
  listLength: string;
  /** Self-review row: writer_email === reviewer_email (super-writer). NOT a real review. */
  isSelfReview: boolean;
  /** approved = y OR qa_approved = y (the dedup rule). */
  isApproved: boolean;
  /** LA date the approval counts on: date_reviewed, falling back to date_written;
   *  QA-only approvals date to date_qa_reviewed. Null if not approved. */
  approvalDate: string | null;
}

export interface HoursSnapshot {
  userId: string;
  userName: string;
  email: string; // normalized @mercor.expert
  totalHoursAllTime: number;
  totalHoursInPeriod: number;
  hoursLast1d: number;
  hoursLast3d: number;
  hoursLast7d: number;
  date: string; // LA date "YYYY-MM-DD"
}

/** Reconstructed per-user daily hours. */
export interface DailyHours {
  email: string;
  date: string;
  hours: number; // clamped ≥ 0
  rawDiff: number; // pre-clamp value (negative diffs surface on data-health)
  isFirstSnapshot: boolean;
}

export type ResolvedRole = "Reviewer" | "Writer" | "Staff";

export interface RoleRow {
  name: string;
  personalEmail: string; // display only, never a join key
  contractorEmail: string; // normalized join key
  helper: string;
  tags: string[];
  contractStatus: string;
  resolvedRole: ResolvedRole;
  isOnboarding: boolean; // tags only Onboarding/blank → Writer targets + badge
}

export interface Dataset {
  tasks: Task[];
  hoursSnapshots: HoursSnapshot[];
  dailyHours: DailyHours[];
  roles: RoleRow[];
  /** Latest LA date present anywhere in the data. */
  dataThrough: string;
  health: DataHealth;
}

export interface DataHealth {
  unparseableErrorCategories: { taskId: string; raw: string }[];
  negativeDailyDiffs: { email: string; date: string; diff: number }[];
  hoursValidationDiscrepancies: {
    email: string;
    date: string;
    field: "hours_last_3d" | "hours_last_7d";
    reported: number;
    reconstructed: number;
  }[];
  attemptOutliers: { taskId: string; writerEmail: string; attempts: number }[];
  approvedWithoutReviewDate: string[]; // task ids
  emailsInTasksNotInRoles: string[];
  emailsInHoursNotInRoles: string[];
  emailsInRolesNotInData: string[];
  taskRowsSkipped: { line: number; reason: string }[];
  hoursRowsSkipped: { line: number; reason: string }[];
  rolesRowsSkipped: { line: number; reason: string }[];
}

export const TARGETS = {
  Writer: { aht: 2.5, output: 10, outputLabel: "approved tasks / week" },
  Reviewer: { aht: 1.5, output: 32, outputLabel: "touches / week" },
} as const;

export const KNOWN_ERROR_TYPES = [
  "Objectivity",
  "Accuracy",
  "Source",
  "Comprehensiveness",
  "Timelessness",
  "Contrivance",
  "Formatting",
  "Question Type",
] as const;
