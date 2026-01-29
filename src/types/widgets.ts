export interface WidgetTestConfig {
  testType: 'stroop' | 'ran_vocal' | 'voice' | 'digit_span' | 'reaction_time';
  enabled: boolean;
  trials?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  timeLimit?: number;
}

export interface Widget {
  id: string;
  name: string;
  siteUrl: string;
  tenantId?: string;
  testsConfig: WidgetTestConfig[];
  theme: 'light' | 'dark' | 'auto';
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  testType: string;
  score: number;
  duration: number;
  data: any;
}
