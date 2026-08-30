export type Severity = "red" | "amber" | "green";

export interface Tier {
  person_id: number;
  core_completed: string[];
  core_missing: string[];
  leadership_held: string[];
  pending_approval: string[];
  highest_qualification: string | null;
  deployable: boolean;
  can_lead: boolean;
  tier_label: string;
  disciple_status: string | null;
  next_module: string | null;
}

export interface Person {
  id: number;
  preferred_name: string;
  full_name: string | null;
  phone_e164: string;
  email: string | null;
  age_band: string | null;
  preferred_language: string;
  home_zone: string | null;
  home_precinct: string | null;
  status: string;
  registration_source: string;
  assisted_registration: boolean;
  disciple_status: string | null;
  created_at: string;
  interests: string[];
  tier: Tier | null;
}

export interface ScheduledEvent {
  id: number;
  kind: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
  assessment_required: boolean;
  module_code: string | null;
  seats_taken: number;
  seats_available: number;
  acknowledged_yes: number;
  acknowledged_no: number;
  acknowledged_maybe: number;
  awaiting_reply: number;
}

export interface Enrollment {
  id: number;
  person_id: number;
  event_id: number;
  status: string;
  source: string;
  attended_at: string | null;
  assessment_outcome: string | null;
  preferred_name: string | null;
}

export interface Module {
  id: number;
  code: string;
  name: string;
  sequence: number;
  kind: string;
  required_for_deployment: boolean;
  display_title: string | null;
  default_capacity: number;
}

export interface Finding {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
  metrics: Record<string, unknown>;
}

export interface LaunchControl {
  generated_at: string;
  worst_severity: Severity;
  headline: {
    deployable: number;
    deployable_target: number;
    registered: number;
    cb5_leaders: number;
    leader_duties_per_week: number;
    assets_live: number;
    assets_target: number;
    training_slots: number;
    learner_seats_total: number;
    learner_seats_remaining: number;
    learner_seat_gap: number;
    red_findings: number;
    amber_findings: number;
  };
  findings: Finding[];
}

export interface Asset {
  id: number;
  code: string;
  name: string;
  block_address: string | null;
  zone: string | null;
  precinct: string | null;
  status: string;
  planned_launch_date: string | null;
  actual_launch_date: string | null;
  gates_met: number;
  blockers: string[];
  is_ready_to_launch: boolean;
}

export interface PipelineSummary {
  registered: number;
  by_module: Record<string, number>;
  deployable: number;
  missing_exactly_one_module: {
    person_id: number;
    preferred_name: string;
    missing: string;
  }[];
  disciples: number;
}

export interface PendingQualification {
  qualification_id: number;
  person_id: number;
  preferred_name: string;
  module_code: string;
  module_name: string;
  achieved_at: string | null;
}
