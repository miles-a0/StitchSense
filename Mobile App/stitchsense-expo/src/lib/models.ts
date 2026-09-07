export type User = {
  id: string;
  email: string;
  displayName?: string | null;
  role: string;
};

export type Entitlement = {
  plan: string;
  status: string;
  accessSource: string;
  trialEndsAt?: string | null;
  features: {
    patternUploads: boolean;
    aiChat: boolean;
    rewrite: boolean;
    stitchVision: boolean;
    ravelryImport: boolean;
  };
};

export type PromotionAction = {
  type: 'url' | 'checkout' | 'app_route';
  url?: string | null;
  appRoute?: string | null;
  checkoutPlan?: 'monthly' | 'annual' | null;
  promoCode?: string | null;
  couponId?: string | null;
  promotionCodeId?: string | null;
};

export type Promotion = {
  id: string;
  title?: string | null;
  body?: string | null;
  imageUrl: string;
  buttonLabel?: string | null;
  audience?: 'all' | 'trial' | 'free' | 'pro' | string;
  startsAt?: string | null;
  endsAt?: string | null;
  dismissKey?: string | null;
  action: PromotionAction;
};

export type PromotionsResponse = {
  promotions: Promotion[];
};

export type UserSettings = {
  defaultSkill: string;
  measurementUnit: string;
  language: string;
  preferences: Record<string, unknown>;
};

export type WordPressSyncStatus = {
  configured: boolean;
  linked: boolean;
  siteUrl?: string | null;
  wpUserId?: string | null;
  lastWordpressSyncAt?: string | null;
  counts: {
    patterns: number;
    chats: number;
    rewrites: number;
  };
};

export type WordPressPendingSyncStatus = {
  available: boolean;
  reason?: string | null;
  siteUrl?: string | null;
  wpUserId?: string | null;
  checkedAt?: string | null;
  hasPending: boolean;
  counts: {
    patterns: number;
    chats: number;
    rewrites: number;
  };
};

export type Pattern = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  craftType?: string | null;
  originalFilename?: string | null;
  fileUrl?: string | null;
  fileKey?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  sourceUrl?: string | null;
  patternSummaryText?: string | null;
  patternSummaryHtml?: string | null;
  metadata?: Record<string, unknown>;
  source: string;
  isArchived?: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
  activityCounts?: {
    chats: number;
    rewrites: number;
  };
};

export type ProjectStatus = 'planned' | 'active' | 'paused' | 'completed' | 'archived';
export type ProjectProgressMode = 'percent' | 'rows' | 'rounds' | 'motifs' | 'sections';

export type Project = {
  id: string;
  userId: string;
  patternId: string;
  title: string;
  craftType?: string | null;
  status: ProjectStatus;
  stageLabel: string;
  progressMode: ProjectProgressMode;
  progressValue?: number | null;
  progressPercent: number;
  recipient?: string | null;
  isGift: boolean;
  occasion?: string | null;
  deadlineAt?: string | null;
  notes?: string | null;
  yarnDetails?: string | null;
  needleHookDetails?: string | null;
  coverImageUrl?: string | null;
  latestPhotoId?: string | null;
  latestPhotoUrl?: string | null;
  latestPhotoTakenAt?: string | null;
  isFavorite: boolean;
  lastWorkedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  linkedPattern?: {
    id: string;
    title: string;
    craftType?: string | null;
    originalFilename?: string | null;
    fileMimeType?: string | null;
    source?: string | null;
    updatedAt?: string | null;
    thumbnailUrl?: string | null;
  } | null;
  topCounter?: {
    label: string;
    counterType?: string | null;
    currentValue: number;
    targetValue?: number | null;
  } | null;
  latestWorkLog?: {
    title: string;
    body?: string | null;
    createdAt?: string | null;
  } | null;
};

export type ProjectCounterType = 'rows' | 'rounds' | 'repeats' | 'sections' | 'motifs' | 'custom';

export type ProjectCounter = {
  id: string;
  projectId: string;
  userId: string;
  label: string;
  counterType: ProjectCounterType;
  currentValue: number;
  targetValue?: number | null;
  stepValue: number;
  sortOrder: number;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProjectWorkLogEntryType = 'note' | 'progress' | 'session' | 'milestone';

export type ProjectWorkLogEntry = {
  id: string;
  projectId: string;
  userId: string;
  entryType: ProjectWorkLogEntryType;
  title: string;
  body?: string | null;
  progressPercent?: number | null;
  minutesSpent?: number | null;
  createdAt?: string | null;
};

export type ProjectPhoto = {
  id: string;
  projectId: string;
  userId: string;
  photoUrl: string;
  fileMimeType?: string | null;
  fileSize?: number | null;
  caption?: string | null;
  takenAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProjectPatternMarkType = 'resume' | 'bookmark' | 'annotation';

export type ProjectPatternMark = {
  id: string;
  projectId: string;
  userId: string;
  patternId: string;
  type: ProjectPatternMarkType;
  label: string;
  pageNumber?: number | null;
  locationLabel?: string | null;
  note?: string | null;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SyncValidationBucket = {
  count: number;
  lastUpdatedAt?: string | null;
};

export type SyncParityBucket = {
  platformCount: number;
  wordpressCount: number | null;
  matched: boolean | null;
  platformLastUpdatedAt?: string | null;
};

export type SyncParityPatternItem = {
  key: string;
  title: string;
  originalFilename?: string | null;
};

export type SyncValidationProjectItem = {
  id: string;
  title: string;
  status: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

export type SyncValidationSummary = {
  serverTime: string;
  wordpress: WordPressSyncStatus;
  library: {
    patterns: SyncValidationBucket;
    chatSessions: SyncValidationBucket;
    chatMessages: SyncValidationBucket;
    rewrites: SyncValidationBucket;
  };
  projects: {
    projects: SyncValidationBucket;
    counters: SyncValidationBucket;
    workLogEntries: SyncValidationBucket;
    photos: SyncValidationBucket;
    marks: SyncValidationBucket;
  };
  parity: {
    wordpressMirror: {
      available: boolean;
      reason?: string;
      siteUrl?: string | null;
      wpUserId?: string | null;
      fetchedAt?: string | null;
      counts?: {
        patterns: number;
        chats: number;
        chatMessages: number;
        rewrites: number;
      };
      patternParity?: {
        matchedCount: number;
        missingInPlatform: SyncParityPatternItem[];
        extraInPlatform: SyncParityPatternItem[];
      };
    };
    library: {
      patterns: SyncParityBucket;
      chatSessions: SyncParityBucket;
      chatMessages: SyncParityBucket;
      rewrites: SyncParityBucket;
    };
    projects: {
      mode: 'platform_only';
      note: string;
      buckets: {
        projects: SyncValidationBucket;
        counters: SyncValidationBucket;
        workLogEntries: SyncValidationBucket;
        photos: SyncValidationBucket;
        marks: SyncValidationBucket;
      };
      recentProjects?: SyncValidationProjectItem[];
      recentDeletedProjects?: SyncValidationProjectItem[];
      integrity?: {
        orphanProjects: number;
        orphanCounters: number;
        orphanWorkLogEntries: number;
        orphanPhotos: number;
        orphanMarks: number;
      };
      createUpdateDeleteValidation?: {
        activeProjectCount: number;
        recentMutationCount: number;
        recentDeletedCount: number;
        orphanCount: number;
        passed: boolean;
      };
    };
  };
};

export type ChatSession = {
  id: string;
  userId: string;
  patternId?: string | null;
  title: string;
  skillLevel?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ChatMessage = {
  id: number;
  sessionId?: string | null;
  role: 'user' | 'assistant' | string;
  content: string;
  kind?: string | null;
  toolMode?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
};

export type RewriteSession = {
  id: string;
  userId: string;
  patternId: string;
  prompt?: string | null;
  rewriteResult: string;
  rewriteChanges?: unknown[] | null;
  rewriteWarnings?: unknown[] | null;
  confidenceScore?: number | null;
  createdAt?: string | null;
};

export type AuthResponse = {
  user: User;
  accessToken: string;
  refreshToken: string;
};

export type MeResponse = {
  user: User;
};

export type EntitlementResponse = {
  entitlement: Entitlement;
};

export type UserSettingsResponse = {
  settings: {
    default_skill?: string;
    measurement_unit?: string;
    language?: string;
    preferences?: Record<string, unknown>;
  };
};

export type SyncStatusResponse = WordPressSyncStatus;

export type WordPressPendingSyncResponse = WordPressPendingSyncStatus;

export type UserExportResponse = {
  exportedAt: string;
  userId: string;
  patterns: unknown[];
  projects: unknown[];
  projectCounters: unknown[];
  projectWorkLog: unknown[];
  projectPatternMarks: unknown[];
  projectPhotos: unknown[];
  stashItems: unknown[];
  chatSessions: unknown[];
  chatMessages: unknown[];
  rewriteSessions: unknown[];
  settings: unknown;
  connections: unknown[];
};

export type DeleteDataResponse = {
  deleted: boolean;
};

export type BillingCheckoutResponse = {
  checkoutUrl: string;
  sessionId: string;
};

export type BillingPortalResponse = {
  portalUrl: string;
};

export type PatternsResponse = {
  patterns: Pattern[];
};

export type ProjectsResponse = {
  projects: Project[];
};

export type ProjectResponse = {
  project: Project;
};

export type ProjectCountersResponse = {
  counters: ProjectCounter[];
};

export type ProjectCounterResponse = {
  counter: ProjectCounter;
};

export type ProjectWorkLogResponse = {
  entries: ProjectWorkLogEntry[];
};

export type ProjectWorkLogEntryResponse = {
  entry: ProjectWorkLogEntry;
};

export type ProjectPhotosResponse = {
  photos: ProjectPhoto[];
};

export type ProjectPhotoResponse = {
  photo: ProjectPhoto;
};

export type ProjectPatternMarksResponse = {
  marks: ProjectPatternMark[];
};

export type ProjectPatternMarkResponse = {
  mark: ProjectPatternMark;
};

export type PatternChatsResponse = {
  sessions: ChatSession[];
};

export type ChatMessagesResponse = {
  messages: ChatMessage[];
};

export type CreateChatResponse = {
  session: ChatSession;
};

export type SendChatMessageResponse = {
  message: ChatMessage;
  workflow?: unknown;
};

export type PatternRewritesResponse = {
  rewrites: RewriteSession[];
};

export type CreateRewriteResponse = {
  rewrite: RewriteSession;
  workflow?: unknown;
};

export type VisionAnalyseResponse = {
  result: unknown;
};

export type PatternFileResponse = {
  fileUrl?: string | null;
  fileKey?: string | null;
  expiresIn?: number | null;
};

export type WordPressSyncRunResponse = {
  synced: boolean;
  patterns: number;
  chats: number;
  rewrites: number;
};

export type SyncValidationResponse = SyncValidationSummary;

export type RavelryStatusResponse = {
  success: boolean;
  configured: boolean;
  oauthConfigured: boolean;
  basicConfigured: boolean;
  searchConfigured: boolean;
  connected: boolean;
  username?: string;
  tokenExpires?: string;
  apiOk?: boolean;
  apiError?: string;
  apiWarning?: string;
  callbackUrl?: string;
};

export type RavelryPattern = {
  id: string;
  title: string;
  designer?: string;
  craftType?: string;
  thumbnailUrl?: string;
  url?: string;
  pdfUrl?: string;
  availability?: string;
  isFree?: boolean;
  price?: string;
  currency?: string;
  priceDescription?: string;
  notes?: string;
  yardage?: string;
  gauge?: string;
  sizes?: string;
  raw?: Record<string, unknown>;
};

export type RavelryPagination = {
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  returnedCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type RavelrySearchResponse = {
  success: boolean;
  query?: string;
  username?: string;
  patterns: RavelryPattern[];
  pagination: RavelryPagination;
};

export type RavelryPatternResponse = {
  success: boolean;
  pattern: RavelryPattern;
};

export type RavelryImportResponse = {
  success: boolean;
  pattern?: Pattern | null;
  id?: string;
  action?: 'created' | 'updated';
  pdfSaved?: boolean;
  pdfUrl?: string;
  analysisSucceeded?: boolean;
  downloadError?: string;
  analysisError?: string;
};

export type APIErrorShape = {
  statusCode: number;
  message: string;
};
