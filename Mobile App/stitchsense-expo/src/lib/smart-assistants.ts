export type SmartAssistantCategory =
  | 'Pattern setup'
  | 'Yarn & stash'
  | 'Making help'
  | 'Finishing';

export type SmartAssistantDestination =
  | { type: 'gauge' }
  | { type: 'dictionary'; query?: string }
  | { type: 'vision' }
  | {
      type: 'helper';
      title: string;
      starter: string;
      context: string;
      toolMode: string;
    };

export type SmartAssistant = {
  id: string;
  category: SmartAssistantCategory;
  description: string;
  featured?: boolean;
  icon: string;
  kicker: string;
  shortTitle: string;
  subtitle: string;
  title: string;
  destination: SmartAssistantDestination;
};

export const smartAssistants: SmartAssistant[] = [
  {
    id: 'gauge-assistant',
    category: 'Pattern setup',
    description:
      'Compare swatch results with pattern gauge, predict finished-size changes, and decide whether to adjust needle or hook size.',
    featured: true,
    icon: 'ruler-square',
    kicker: 'Tension & fit',
    shortTitle: 'Gauge',
    subtitle: 'Measure & match',
    title: 'Gauge Assistant',
    destination: { type: 'gauge' },
  },
  {
    id: 'pattern-size-assistant',
    category: 'Pattern setup',
    description:
      'Choose between pattern sizes, understand ease, and turn finished measurements into a beginner-friendly decision.',
    featured: true,
    icon: 'human-male-height-variant',
    kicker: 'Sizing',
    shortTitle: 'Pattern size',
    subtitle: 'Choose size',
    title: 'Pattern Size Assistant',
    destination: {
      type: 'helper',
      title: 'Pattern size assistant',
      starter:
        'Please help me choose the right pattern size. Ask for the measurements you need, explain ease simply, and help me avoid choosing too small or too large.',
      context:
        'The user opened the Pattern Size Assistant. Focus on size options, body/garment measurements, units, ease, and how to choose safely before starting a project.',
      toolMode: 'pattern_size_assistant',
    },
  },
  {
    id: 'fit-ease-assistant',
    category: 'Pattern setup',
    description:
      'Explain positive or negative ease, expected fit, and what a finished garment measurement really means.',
    icon: 'tape-measure',
    kicker: 'Garment fit',
    shortTitle: 'Fit & ease',
    subtitle: 'Fit check',
    title: 'Fit & Ease Assistant',
    destination: {
      type: 'helper',
      title: 'Fit and ease assistant',
      starter:
        'Please help me understand the ease and finished measurements for this pattern, then tell me which fit questions I should answer before I start.',
      context:
        'The user opened the Fit & Ease Assistant. Keep explanations practical and beginner-friendly, and distinguish body measurements from finished garment measurements.',
      toolMode: 'fit_ease_assistant',
    },
  },
  {
    id: 'yarn-assistant',
    category: 'Yarn & stash',
    description:
      'Estimate yarn needs, check substitutions, compare meterage, and think through leftovers, dye lots, cost, and stash-first options.',
    featured: true,
    icon: 'swap-horizontal',
    kicker: 'Yarn choices',
    shortTitle: 'Yarn',
    subtitle: 'Swap & check',
    title: 'Yarn Assistant',
    destination: {
      type: 'helper',
      title: 'Yarn assistant',
      starter:
        'Please help me work out yarn requirements or a yarn substitution. Ask for weight, fibre, meterage, gauge, and stash details if needed.',
      context:
        'The user opened the Yarn Assistant. Cover yarn quantity, substitutions, meterage conversions, dye lot reminders, leftovers, project cost, and stash-first suggestions where useful.',
      toolMode: 'yarn_assistant',
    },
  },
  {
    id: 'stash-assistant',
    category: 'Yarn & stash',
    description:
      'Turn saved yarn, needles, hooks, and supplies into realistic project ideas and shopping gaps.',
    featured: true,
    icon: 'basket-outline',
    kicker: 'Supplies',
    shortTitle: 'Stash ideas',
    subtitle: 'Use what you own',
    title: 'Stash Assistant',
    destination: {
      type: 'helper',
      title: 'Stash assistant',
      starter:
        'Please help me make better use of my stash. Ask what yarn, needles, hooks, and supplies I have, then suggest realistic project ideas and what I might still need.',
      context:
        'The user opened the Stash Assistant. Prioritise using existing supplies, realistic quantities, leftover yarn ideas, and clear shopping gaps.',
      toolMode: 'stash_assistant',
    },
  },
  {
    id: 'project-planner',
    category: 'Pattern setup',
    description:
      'Break a new project into clear setup decisions: size, yarn, tools, swatch, schedule, and first row.',
    icon: 'calendar-check-outline',
    kicker: 'Planning',
    shortTitle: 'Project plan',
    subtitle: 'Start clearly',
    title: 'Project Planner',
    destination: {
      type: 'helper',
      title: 'Project planner',
      starter:
        'Please help me plan a new knitting or crochet project from the beginning. Give me a simple checklist covering size, yarn, tools, gauge, timing, and first steps.',
      context:
        'The user opened the Project Planner. Keep the plan concise and sequenced so a beginner knows what to do before casting on or starting the first round.',
      toolMode: 'project_planner',
    },
  },
  {
    id: 'progress-assistant',
    category: 'Making help',
    description:
      'Restart a paused project, work out what to do next, and turn the current row or round into a calm checklist.',
    icon: 'format-list-checks',
    kicker: 'In progress',
    shortTitle: 'Progress',
    subtitle: 'Next step',
    title: 'Pattern Progress Assistant',
    destination: {
      type: 'helper',
      title: 'Pattern progress assistant',
      starter:
        'Please help me work out what to do next in my current knitting or crochet project. Ask what row, round, section, or instruction I am on, then give me the next steps.',
      context:
        'The user opened the Pattern Progress Assistant. Focus on current row/round, section transitions, markers, notes, and safe next actions.',
      toolMode: 'pattern_progress_assistant',
    },
  },
  {
    id: 'mistake-recovery',
    category: 'Making help',
    description:
      'Diagnose mistakes, choose whether to fix or leave them, and recover stitches or pattern repeats without panic.',
    featured: true,
    icon: 'lifebuoy',
    kicker: 'Fix it',
    shortTitle: 'Mistake help',
    subtitle: 'Recover calmly',
    title: 'Mistake Recovery Assistant',
    destination: {
      type: 'helper',
      title: 'Mistake recovery assistant',
      starter:
        'I think I made a mistake in my knitting or crochet. Please help me diagnose it calmly, decide whether it needs fixing, and give me safe recovery steps.',
      context:
        'The user opened the Mistake Recovery Assistant. Ask for stitch/row details, photos if useful, and give calm repair options with beginner-safe language.',
      toolMode: 'mistake_recovery_assistant',
    },
  },
  {
    id: 'technique-coach',
    category: 'Making help',
    description:
      'Look up terms, decode abbreviations, compare UK and US wording, and get technique explanations.',
    featured: true,
    icon: 'book-alphabet',
    kicker: 'Reference',
    shortTitle: 'Technique',
    subtitle: 'Terms & stitches',
    title: 'Technique Coach',
    destination: { type: 'dictionary' },
  },
  {
    id: 'pattern-translator',
    category: 'Making help',
    description:
      'Turn a confusing instruction into plain English, including UK/US terminology and abbreviation checks.',
    icon: 'translate',
    kicker: 'Plain English',
    shortTitle: 'Translator',
    subtitle: 'Decode wording',
    title: 'Pattern Translator',
    destination: {
      type: 'helper',
      title: 'Pattern translator',
      starter:
        'Please translate this knitting or crochet instruction into plain English. Also flag any UK/US terminology differences and tell me exactly what to do next.',
      context:
        'The user opened the Pattern Translator. Focus on plain-English explanation, abbreviations, UK/US terminology, and next action.',
      toolMode: 'pattern_translator',
    },
  },
  {
    id: 'needle-hook-assistant',
    category: 'Making help',
    description:
      'Decide whether to move up or down a needle or hook size and understand the likely fabric changes.',
    icon: 'needle',
    kicker: 'Fabric control',
    shortTitle: 'Needle/hook',
    subtitle: 'Size direction',
    title: 'Needle & Hook Assistant',
    destination: {
      type: 'helper',
      title: 'Needle and hook assistant',
      starter:
        'Please help me decide whether to move my needle or hook size up or down. Explain why, what fabric changes to expect, and what to check in the next swatch.',
      context:
        'The user opened the Needle & Hook Assistant. Explain tension, gauge changes, yarn behaviour, fabric feel, and common causes of tight or loose work.',
      toolMode: 'needle_hook_assistant',
    },
  },
  {
    id: 'difficulty-predictor',
    category: 'Pattern setup',
    description:
      'Check whether a pattern is likely to feel beginner, intermediate, or advanced before committing.',
    icon: 'signal-cellular-2',
    kicker: 'Confidence',
    shortTitle: 'Difficulty',
    subtitle: 'Skill check',
    title: 'Pattern Difficulty Predictor',
    destination: {
      type: 'helper',
      title: 'Pattern difficulty predictor',
      starter:
        'Please help me judge how difficult this knitting or crochet pattern will be. Ask about techniques, construction, shaping, charts, finishing, and my skill level.',
      context:
        'The user opened the Pattern Difficulty Predictor. Give a realistic difficulty rating, likely tricky spots, and prep steps.',
      toolMode: 'pattern_difficulty_predictor',
    },
  },
  {
    id: 'time-estimator',
    category: 'Pattern setup',
    description:
      'Estimate project time, break work into sessions, and plan around deadlines or gift dates.',
    icon: 'clock-outline',
    kicker: 'Time',
    shortTitle: 'Time',
    subtitle: 'Plan sessions',
    title: 'Time Estimator',
    destination: {
      type: 'helper',
      title: 'Project time estimator',
      starter:
        'Please help me estimate how long this knitting or crochet project might take and break it into realistic making sessions.',
      context:
        'The user opened the Time Estimator. Ask about project type, size, yarn weight, pace, deadline, and available sessions.',
      toolMode: 'time_estimator',
    },
  },
  {
    id: 'finishing-assistant',
    category: 'Finishing',
    description:
      'Create a finishing checklist for blocking, seams, ends, buttons, care labels, photos, and storage.',
    icon: 'check-decagram-outline',
    kicker: 'Finish well',
    shortTitle: 'Finishing',
    subtitle: 'Block & care',
    title: 'Finishing Assistant',
    destination: {
      type: 'helper',
      title: 'Finishing assistant',
      starter:
        'Please help me finish this knitting or crochet project properly. Give me a checklist for blocking, ends, seams, care, photos, and storage.',
      context:
        'The user opened the Finishing Assistant. Keep advice practical and adapt it to fibre, project type, and user confidence.',
      toolMode: 'finishing_assistant',
    },
  },
  {
    id: 'yarn-care-assistant',
    category: 'Finishing',
    description:
      'Understand fibre care, washing, blocking, storage, and gift-care notes before or after making.',
    icon: 'water-outline',
    kicker: 'Care',
    shortTitle: 'Yarn care',
    subtitle: 'Wash & store',
    title: 'Yarn Care Assistant',
    destination: {
      type: 'helper',
      title: 'Yarn care assistant',
      starter:
        'Please help me understand how to wash, block, and store this yarn or finished item safely. Ask for fibre content and project type if needed.',
      context:
        'The user opened the Yarn Care Assistant. Cover fibre care, washing, blocking, storage, and gift-care notes.',
      toolMode: 'yarn_care_assistant',
    },
  },
  {
    id: 'stitch-vision',
    category: 'Making help',
    description:
      'Use a photo for stitch identification, fabric questions, or visible project problems.',
    icon: 'camera-outline',
    kicker: 'Photo help',
    shortTitle: 'Stitch Vision',
    subtitle: 'Photo help',
    title: 'Stitch Vision',
    destination: { type: 'vision' },
  },
];

export const featuredSmartAssistants = smartAssistants.filter(
  (assistant) => assistant.featured,
);

export const smartAssistantCategories: SmartAssistantCategory[] = [
  'Pattern setup',
  'Yarn & stash',
  'Making help',
  'Finishing',
];
