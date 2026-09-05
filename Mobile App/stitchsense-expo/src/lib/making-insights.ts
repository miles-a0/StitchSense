import type { Project } from '@/src/lib/models';

export type MakingFocusKind = 'deadline' | 'counter' | 'materials' | 'idle';

export type MakingFocusCard = {
  kind: MakingFocusKind;
  icon: 'calendar-alert-outline' | 'counter' | 'basket-outline' | 'clock-outline';
  title: string;
  copy: string;
  project: Project;
};

export function projectRecency(project: Project) {
  return project.lastWorkedAt ?? project.updatedAt ?? project.createdAt ?? '';
}

export function isProjectDueSoon(project: Project) {
  if (!project.deadlineAt || project.status === 'completed') return false;
  const time = new Date(project.deadlineAt).getTime();
  if (Number.isNaN(time)) return false;
  const diff = time - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days >= 0 && days <= 3;
}

export function projectIdleDays(project: Project) {
  const date = project.lastWorkedAt ?? project.updatedAt ?? project.createdAt;
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function nextProjectAction(project: Project) {
  if (project.status === 'completed') {
    return 'Add final notes or photos';
  }
  if (isProjectDueSoon(project)) {
    return 'Deadline is close';
  }
  if (project.progressPercent <= 0) {
    return 'Set first progress marker';
  }
  if (project.progressPercent >= 90) {
    return 'Finish and mark complete';
  }
  if (project.topCounter) {
    return `Update ${project.topCounter.label}`;
  }
  if (!project.yarnDetails && !project.needleHookDetails) {
    return 'Add materials';
  }
  return 'Continue making';
}

export function buildProjectFocusCards(projects: Project[]) {
  const dueFocusProject = projects.find(isProjectDueSoon) ?? null;
  const counterFocusProject =
    projects.find((project) => project.status === 'active' && !project.topCounter) ?? null;
  const materialsFocusProject =
    projects.find((project) => !project.yarnDetails && !project.needleHookDetails) ?? null;
  const idleFocusProject =
    projects
      .filter((project) => project.status === 'active')
      .find((project) => {
        const days = projectIdleDays(project);
        return days !== null && days >= 7;
      }) ?? null;

  const cards: (MakingFocusCard | null)[] = [
    dueFocusProject
      ? {
          kind: 'deadline',
          icon: 'calendar-alert-outline',
          title: 'Deadline needs attention',
          copy: `${dueFocusProject.title} is close enough to plan today.`,
          project: dueFocusProject,
        }
      : null,
    counterFocusProject
      ? {
          kind: 'counter',
          icon: 'counter',
          title: 'Add a first counter',
          copy: `${counterFocusProject.title} will be easier to resume with a row, round, or repeat counter.`,
          project: counterFocusProject,
        }
      : null,
    materialsFocusProject
      ? {
          kind: 'materials',
          icon: 'basket-outline',
          title: 'Materials missing',
          copy: `${materialsFocusProject.title} needs yarn, needle, hook, or tool details.`,
          project: materialsFocusProject,
        }
      : null,
    idleFocusProject
      ? {
          kind: 'idle',
          icon: 'clock-outline',
          title: 'Gentle restart',
          copy: `${idleFocusProject.title} has been quiet for a while.`,
          project: idleFocusProject,
        }
      : null,
  ];

  return cards.filter((card): card is MakingFocusCard => card !== null);
}
