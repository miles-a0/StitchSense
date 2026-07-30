import type { Pattern } from '@/src/lib/models';
import type { StashItem } from '@/src/lib/stash-store';

export type StashInsight = {
  item: StashItem;
  score: number;
  reason: string;
};

const yarnWeightAliases: Record<string, string[]> = {
  lace: ['lace'],
  fingering: ['fingering', 'sock', '4ply', '4 ply'],
  sport: ['sport', '5ply', '5 ply'],
  dk: ['dk', 'double knit', 'double knitting', '8ply', '8 ply'],
  worsted: ['worsted', 'aran', '10ply', '10 ply'],
  aran: ['aran', 'worsted', '10ply', '10 ply'],
  bulky: ['bulky', 'chunky', '12ply', '12 ply'],
  super: ['super bulky', 'super chunky', 'super-bulky'],
};

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function patternSearchText(pattern: Pattern | null | undefined) {
  if (!pattern) {
    return '';
  }

  const metadata = pattern.metadata ?? {};
  const metadataText = Object.values(metadata)
    .flatMap((value) => {
      if (typeof value === 'string' || typeof value === 'number') {
        return [String(value)];
      }
      if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string' || typeof entry === 'number').map(String);
      }
      return [];
    })
    .join(' ');

  return [
    pattern.title,
    pattern.craftType,
    pattern.originalFilename,
    pattern.patternSummaryText,
    metadataText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function stashTerms(item: StashItem) {
  return [
    item.name,
    item.brand,
    item.yarnWeight,
    item.fibre,
    item.colour,
    item.dyeLot,
    item.size,
    item.material,
    item.location,
    item.reservedFor,
    item.notes,
  ]
    .map(cleanText)
    .filter(Boolean);
}

function weightAliases(weight: string | undefined) {
  const normalized = cleanText(weight);
  if (!normalized) {
    return [];
  }

  const direct = Object.entries(yarnWeightAliases).find(([key, aliases]) =>
    normalized.includes(key) || aliases.some((alias) => normalized.includes(alias)),
  );

  return direct ? direct[1] : [normalized];
}

function compactDetail(item: StashItem) {
  return [
    item.quantity && item.unit ? `${item.quantity}${item.unit}` : item.quantity,
    item.yarnWeight,
    item.colour,
    item.fibre,
    item.size,
    item.material,
  ]
    .filter(Boolean)
    .join(', ');
}

export function describeStashItem(item: StashItem) {
  const detail = compactDetail(item);
  return detail ? `${item.name} (${detail})` : item.name;
}

export function ravelryWeightForStash(item: StashItem) {
  const normalized = cleanText(item.yarnWeight);
  if (!normalized) {
    return '';
  }

  if (normalized.includes('lace')) return 'lace';
  if (normalized.includes('fingering') || normalized.includes('sock') || normalized.includes('4ply') || normalized.includes('4 ply')) {
    return 'fingering';
  }
  if (normalized.includes('sport') || normalized.includes('5ply') || normalized.includes('5 ply')) return 'sport';
  if (normalized.includes('dk') || normalized.includes('double knit') || normalized.includes('double knitting')) return 'dk';
  if (normalized.includes('worsted') || normalized.includes('aran')) return 'worsted';
  if (normalized.includes('bulky') || normalized.includes('chunky')) return 'bulky';
  if (normalized.includes('super')) return 'super-bulky';
  return '';
}

export function stashIdeaSuggestions(item: StashItem) {
  if (item.category !== 'yarn') {
    const size = item.size ? `${item.size} ` : '';
    if (item.category === 'needle-hook') {
      return [
        `${size}hat`,
        `${size}scarf`,
        `${size}mittens`,
        `${size}shawl`,
      ];
    }
    return ['notions pouch', 'project bag', 'stitch markers', 'tool organiser'];
  }

  const weight = ravelryWeightForStash(item);
  if (weight === 'lace' || weight === 'fingering') {
    return ['shawl', 'socks', 'fingerless mitts', 'lightweight hat'];
  }
  if (weight === 'sport' || weight === 'dk') {
    return ['hat', 'fingerless mitts', 'cowl', 'baby cardigan'];
  }
  if (weight === 'worsted') {
    return ['mittens', 'hat', 'cowl', 'slippers'];
  }
  if (weight === 'bulky' || weight === 'super-bulky') {
    return ['chunky hat', 'quick cowl', 'headband', 'bulky mittens'];
  }
  return ['hat', 'scarf', 'mittens', 'cowl'];
}

export function findStashInsights(pattern: Pattern | null | undefined, items: StashItem[], limit = 3): StashInsight[] {
  const searchText = patternSearchText(pattern);
  const hasPatternContext = searchText.length > 0;

  return items
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];

      if (item.category === 'yarn') {
        score += 1;
      }

      for (const alias of weightAliases(item.yarnWeight)) {
        if (hasPatternContext && searchText.includes(alias)) {
          score += 5;
          reasons.push(`${item.yarnWeight} appears to match the pattern yarn weight`);
          break;
        }
      }

      for (const term of stashTerms(item)) {
        if (term.length >= 3 && hasPatternContext && searchText.includes(term)) {
          score += 2;
          if (reasons.length < 2) {
            reasons.push(`${term} is mentioned in the pattern details`);
          }
        }
      }

      if (item.quantity && item.unit) {
        score += 1;
      }
      if (item.reservedFor) {
        score -= 2;
        reasons.push(`reserved for ${item.reservedFor}`);
      }

      const reason =
        reasons[0] ??
        (item.category === 'yarn'
          ? 'worth checking against the required weight and yardage'
          : 'may be useful equipment for this project');

      return { item, score, reason };
    })
    .filter((insight) => insight.score > 0)
    .sort((left, right) => right.score - left.score || right.item.updatedAt.localeCompare(left.item.updatedAt))
    .slice(0, limit);
}

export function buildStashContext(items: StashItem[], limit = 8) {
  return items.slice(0, limit).map(describeStashItem).join('; ');
}

export function findStashMentionsInText(text: string, items: StashItem[], limit = 4): StashInsight[] {
  const searchText = text.toLowerCase();
  if (!searchText.trim()) {
    return [];
  }

  return items
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];

      for (const term of stashTerms(item)) {
        if (term.length >= 3 && searchText.includes(term)) {
          score += term === cleanText(item.name) ? 4 : 2;
          if (reasons.length < 2) {
            reasons.push(`${term} is already mentioned on this project`);
          }
        }
      }

      for (const alias of weightAliases(item.yarnWeight)) {
        if (alias.length >= 2 && searchText.includes(alias)) {
          score += 2;
          if (reasons.length < 2) {
            reasons.push(`${item.yarnWeight} matches the project materials`);
          }
        }
      }

      return {
        item,
        score,
        reason: reasons[0] ?? 'appears in the project materials',
      };
    })
    .filter((insight) => insight.score > 0)
    .sort((left, right) => right.score - left.score || right.item.updatedAt.localeCompare(left.item.updatedAt))
    .slice(0, limit);
}
