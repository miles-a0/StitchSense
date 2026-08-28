import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { Project } from '@/src/lib/models';
import { useSession } from '@/src/providers/session-provider';

type ProjectsContextValue = {
  projects: Project[];
  isLoading: boolean;
  errorMessage: string | null;
  refreshProjects: () => Promise<void>;
  upsertProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

function projectRecency(project: Project) {
  return project.lastWorkedAt ?? project.updatedAt ?? project.createdAt ?? '';
}

export function ProjectsProvider({ children }: React.PropsWithChildren) {
  const { accessToken } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortProjects = useCallback((nextProjects: Project[]) => {
    return [...nextProjects].sort((left, right) => {
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }
      return projectRecency(right).localeCompare(projectRecency(left));
    });
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!accessToken) {
      setProjects([]);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const nextProjects = await stitchSenseAPI.projects(accessToken);
      setProjects(sortProjects(nextProjects));
    } catch (error) {
      setErrorMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not load projects.' }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, sortProjects]);

  const upsertProject = useCallback((project: Project) => {
    setProjects((current) =>
      sortProjects([project, ...current.filter((item) => item.id !== project.id)]),
    );
  }, [sortProjects]);

  const removeProject = useCallback((projectId: string) => {
    setProjects((current) => current.filter((item) => item.id !== projectId));
  }, []);

  useEffect(() => {
    if (accessToken) {
      void refreshProjects();
      return;
    }

    setProjects([]);
    setErrorMessage(null);
  }, [accessToken, refreshProjects]);

  const value = useMemo(
    () => ({
      projects,
      isLoading,
      errorMessage,
      refreshProjects,
      upsertProject,
      removeProject,
    }),
    [errorMessage, isLoading, projects, refreshProjects, removeProject, upsertProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used inside ProjectsProvider');
  }
  return context;
}
