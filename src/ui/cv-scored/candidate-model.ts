export interface ScreeningListRef {
  _id?: string;
  id?: string;
  name: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CVProfile {
  _id: string;
  name: string;
  status: string;
  score?: number;
  category?: string;
  reason?: string;
  email?: string;
  sdt?: string;
  position?: string;
  customFields?: unknown;
  inviteMailSent?: boolean;
}

export interface CVBoardData {
  listId: string;
  listName: string;
  createdAt?: string;
  created_at?: string;
  stagesMap: Record<string, string>;
  fieldsMap: Record<string, string>;
  cvs: CVProfile[];
}

export interface CandidateApplication extends CVProfile {
  applicationKey: string;
  sourceListId: string;
  sourceListName: string;
  jobTitle?: string;
  departmentLabel?: string;
  recruitmentPeriod?: string;
}

export interface CandidateMetricSummary {
  total: number;
  passed: number;
  awaitingInterview: number;
  interviewed: number;
}
