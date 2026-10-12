import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  {
    path: 'Mobile App/backend/stitchsense-api/.env.staging.example',
    markers: [
      'CORS_ORIGINS=',
      'TRUST_PROXY=',
      'N8N_SHARED_SECRET=',
      'N8N_CHAT_SHARED_SECRET=',
      'N8N_UPLOAD_SHARED_SECRET=',
      'REVENUECAT_WEBHOOK_AUTHORIZATION=',
    ],
  },
  {
    path: 'Mobile App/backend/stitchsense-api/.env.vps.example',
    markers: [
      'CORS_ORIGINS=',
      'TRUST_PROXY=',
      'N8N_SHARED_SECRET=',
      'N8N_CHAT_SHARED_SECRET=',
      'N8N_UPLOAD_SHARED_SECRET=',
      'REVENUECAT_WEBHOOK_AUTHORIZATION=',
    ],
  },
  {
    path: 'Mobile App/shared/api-contracts/stitchsense-api.v1.yaml',
    markers: [
      '/billing/revenuecat/webhook:',
      'RevenueCatWebhookRequest:',
      'required: [id, type, app_user_id]',
      '/admin/users/access:',
      '/admin/entitlements:',
      'AdminUserAccessList:',
      'ManualEntitlementGrantRequest:',
      'enum: [lifetime_pro, extended_trial, courtesy_access]',
      'enum: [manual_lifetime, manual_trial, courtesy_access, stripe, apple, google, standard_trial, none]',
    ],
  },
  {
    path: 'docs/ACCESSIBILITY_AUDIT_CHECKLIST.md',
    markers: ['## Screen Reader', '## Visual And Motion', '## Decision'],
  },
  {
    path: 'docs/ASSET_VALIDATION_CHECKLIST.md',
    markers: ['## Icons And Launch Assets', '## Store Screenshots', '## Decision'],
  },
  {
    path: 'docs/BACKUP_RESTORE_EVIDENCE.md',
    markers: ['## Backup Snapshot', '## Backup Verification', '## Restore Validation', 'Deleted-account replay/check performed', '## Decision'],
  },
  {
    path: 'docs/BETA_FEEDBACK_TRIAGE.md',
    markers: ['## Intake', '## Severity Definitions', '## Release Decision'],
  },
  {
    path: 'docs/BRANCH_PROTECTION_SETUP.md',
    markers: ['## Required Checks', 'Backend build, test, and audit', 'Production image build', '## Ruleset Settings', '## Decision'],
  },
  {
    path: 'docs/BRIDGE_SECURITY_DEPLOYMENT_RUNBOOK.md',
    markers: ['## Preconditions', '## 2. Rotate the bridge credential', '## Rollback'],
  },
  {
    path: 'docs/CRASH_REPORTING_PLAN.md',
    markers: ['## Required Signals', '## Privacy Rules', '## Rollout Thresholds'],
  },
  {
    path: 'docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md',
    markers: [
      '## Count Reconciliation',
      'Deleted/tombstoned records',
      '## Bidirectional Flow Checks',
      'Metadata-only paid Ravelry pattern blocks AI content operations',
      '## Pattern Context Matrix',
      'Pattern A chat cannot read Pattern B content',
      '## Object Storage Reconciliation',
      'Signed URLs require owner access',
    ],
  },
  {
    path: 'docs/DATA_RETENTION_AND_DELETION_POLICY.md',
    markers: ['## Proposed retention schedule', '## Account deletion behaviour', '## Launch blockers'],
  },
  {
    path: 'docs/DEVICE_ACCEPTANCE_MATRIX.md',
    markers: ['## Smoke Flows', '## Offline, Slow Network, And Recovery', '## Accessibility And Layout'],
  },
  {
    path: 'docs/EAS_ENVIRONMENT_SETUP_CHECKLIST.md',
    markers: ['## Required Environments', '## Public App Config', '## Decision'],
  },
  {
    path: 'docs/ENVIRONMENT_CONFIGURATION_MATRIX.md',
    markers: ['## Backend', '## Mobile / EAS', '## Decision'],
  },
  {
    path: 'docs/EXPO_BUILD_AND_RELEASE_RUNBOOK.md',
    markers: ['## Lightweight local path', '## Required EAS environment variables', '## Production release checklist'],
  },
  {
    path: 'docs/INCIDENT_POSTMORTEM_TEMPLATE.md',
    markers: ['## Summary', '## Root Cause', '## Follow-Up'],
  },
  {
    path: 'docs/IOS_PRIVACY_MANIFEST_REVIEW.md',
    markers: ['## Manifest Inventory', '## Store Label Alignment', '## Decision'],
  },
  {
    path: 'docs/LEGAL_PUBLICATION_CHECKLIST.md',
    markers: ['## Required Public URLs', 'Privacy policy', 'Subscription terms', 'Support/contact', '## Consistency Checks', '## Decision'],
  },
  {
    path: 'docs/MIGRATION_ROLLBACK_REHEARSAL.md',
    markers: ['## Migration Plan', '## Forward Rehearsal', '## Rollback Rehearsal', 'Deleted-account replay/check performed'],
  },
  {
    path: 'docs/N8N_WORKFLOW_RELEASE_CHECKLIST.md',
    markers: ['## Workflow Inventory', '## Contract Checks', '## Rollback'],
  },
  {
    path: 'docs/OPERATIONS_REHEARSAL_LOG.md',
    markers: ['## Deployment Rehearsal', '## Rollback Rehearsal', '## Restore Rehearsal'],
  },
  {
    path: 'docs/OPERATIONS_RUNBOOK.md',
    markers: ['## Standard backend deployment', '## Rollback procedure', '## Restore validation'],
  },
  {
    path: 'docs/PERFORMANCE_ACCEPTANCE_PLAN.md',
    markers: ['## Target Flows', '## Resource Conditions', '## Decision'],
  },
  {
    path: 'docs/POST_RELEASE_MONITORING_CHECKLIST.md',
    markers: ['## Staged Rollout Policy', '## First Hour', '## First Day', '## Hold Or Roll Back'],
  },
  {
    path: 'docs/PRIVACY_DATA_SAFETY_WORKSHEET.md',
    markers: ['## Data Collection Inventory', '## Apple Privacy Labels Draft', '## Google Data Safety Draft', '## Launch Approval'],
  },
  {
    path: 'docs/PRODUCTION_READINESS_ACTION_PLAN.md',
    markers: ['## Action Items', '## Fastest Safe Execution Sequence', '## Immediate Next Task'],
  },
  {
    path: 'docs/PRODUCTION_SERVICE_INVENTORY.md',
    markers: ['## Public services', '## Backup evidence', '## Restore validation'],
  },
  {
    path: 'docs/RELEASE_DECISION_LOG.md',
    markers: ['## Go / No-Go Checklist', '## Decision Record', '## Follow-Up'],
  },
  {
    path: 'docs/REACT_COMPILER_CLEANUP_PLAN.md',
    markers: ['## Current Suppressions', '## Cleanup Order', '## Exit Criteria'],
  },
  {
    path: 'docs/RELEASE_CANDIDATE_EVIDENCE.md',
    markers: [
      '## Candidate Identity',
      '## Pre-Build Gates',
      'Public mobile lifetime product intentionally omitted',
      'Manual developer/support/beta lifetime access evidence',
      'Current rollout step',
      '## Decision',
    ],
  },
  {
    path: 'docs/RELEASE_RISK_REGISTER.md',
    markers: ['## Risk Register', '## Rollback Thresholds', '## Decision'],
  },
  {
    path: 'docs/REVIEW_TEST_ACCOUNT_PROTOCOL.md',
    markers: ['## Account Inventory', 'Manual entitlement test user', '## Reviewer Access', '## Rotation And Cleanup'],
  },
  {
    path: 'docs/REVENUECAT_STORE_TEST_MATRIX.md',
    markers: [
      '## Test Store Smoke',
      '## Configuration',
      '`pro` entitlement attached',
      'Webhook authorization configured',
      'Lifetime product intentionally omitted',
      'Manual lifetime access survives expired/cancelled store state',
      '## Purchase And Restore',
      "One user cannot receive another user's entitlement",
      '## Decision',
    ],
  },
  {
    path: 'docs/revenuecat-subscriptions-and-payouts.md',
    markers: [
      '## Target setup',
      'StitchSense entitlement ID: `pro`',
      'RevenueCat `appUserID` must equal the StitchSense backend user ID',
      '## RevenueCat dashboard checklist',
      'The webhook authorization secret belongs only on the backend/VPS',
      '## Testing checklist',
    ],
  },
  {
    path: 'docs/SECURITY_SIGNOFF_CHECKLIST.md',
    markers: ['## Backend And Data', '## Mobile And Release', '## Decision'],
  },
  {
    path: 'docs/STORE_REVIEW_NOTES.md',
    markers: ['## Review Account', '## Reviewer Instructions', '## Sensitive-Feature Notes'],
  },
  {
    path: 'docs/STAGE_1_RELEASE_BUILD_ACTION_PLAN.md',
    markers: ['## Stage 1 Release Standard', '## Suggested Execution Order', '## Daily Launch Board'],
  },
  {
    path: 'docs/STORE_CONSOLE_SETUP_CHECKLIST.md',
    markers: [
      '## App Store Connect',
      'Agreements, tax, and banking',
      'Lifetime product',
      '## Google Play Console',
      'Payments profile',
      '## RevenueCat Alignment',
      'No public lifetime package is exposed by the launch offering',
      'Webhook authorization value is set only in RevenueCat and backend env',
    ],
  },
  {
    path: 'docs/STORE_SUBMISSION_CHECKLIST.md',
    markers: ['## App Identity', '## Store Assets', '## Subscriptions'],
  },
  {
    path: 'docs/SUPPORT_MACRO_LIBRARY.md',
    markers: ['## Identity And Login', '## Patterns And AI', '## Billing', 'Manual/developer access missing'],
  },
  {
    path: 'docs/SUPPORT_READINESS_RUNBOOK.md',
    markers: ['## Support Channels', '## Triage Playbook', 'Manual/developer access missing', '## Escalation Paths'],
  },
  {
    path: 'docs/TABLET_SUPPORT_DECISION.md',
    markers: ['## Decision Options', '## QA Matrix', '## Decision'],
  },
  {
    path: 'StitchSense Chat API - Qdrant RAG + Client History - UK Metric.json',
    json: true,
    markers: [
      '$env.N8N_CHAT_SHARED_SECRET',
      '$env.N8N_SHARED_SECRET',
      '$env.STITCHSENSE_EMBEDDINGS_URL',
      '$env.STITCHSENSE_QDRANT_URL',
      "String(req.platform_user_id || req.platformUserId || '').trim()",
      "key: 'platform_user_id'",
      "noResultsFilter('pattern_priority_without_scope')",
      'function sharedKnowledgeFilter()',
    ],
  },
  {
    path: 'Pattern Helper AI - RAG Chat API - v7.6.0 - Google Drive Storage.json',
    json: true,
    markers: [
      '$env.N8N_UPLOAD_SHARED_SECRET',
      '$env.N8N_SHARED_SECRET',
      '$env.STITCHSENSE_EMBEDDINGS_URL',
      '$env.STITCHSENSE_QDRANT_URL',
      '$env.STITCHSENSE_STIRLING_URL',
      "Object.keys(binary).includes('file') ? 'file'",
      'inputDataFieldName": "={{ $json.upload_key }}"',
      'platform_user_id: $json.platform_user_id',
    ],
  },
  {
    path: 'ops/monitoring/stitchsense-dashboard.json',
    json: true,
    markers: ['stitchsense_api_requests_total', 'stitchsense_workflow_requests_total'],
  },
  {
    path: 'ops/monitoring/stitchsense-alerts.yml',
    markers: ['StitchSenseApiHighErrorRate', 'StitchSenseWorkflowFailures', 'StitchSenseBillingWebhookExceptions'],
  },
];

const errors = [];

for (const file of requiredFiles) {
  const absolutePath = path.join(root, file.path);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`${file.path} is missing`);
    continue;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  if (file.json) {
    try {
      JSON.parse(content);
    } catch (error) {
      errors.push(`${file.path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const marker of file.markers) {
    if (!content.includes(marker)) {
      errors.push(`${file.path} is missing required marker: ${marker}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Production artifact validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Production artifact validation passed');
