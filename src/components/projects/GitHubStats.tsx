import { useState, useEffect } from "react";

interface GitHubStats {
  stars: number;
  forks: number;
  watchers: number;
}

interface GitHubRepoResponse {
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
}

interface Props {
  repo: string;
}

function extractRepoPath(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

export function GitHubStats({ repo }: Props) {
  const [stats, setStats] = useState<GitHubStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const repoPath = extractRepoPath(repo);
    if (!repoPath) {
      setError(true);
      setLoading(false);
      return;
    }

    fetch(`https://api.github.com/repos/${repoPath}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json() as Promise<GitHubRepoResponse>;
      })
      .then((data) => {
        setStats({
          stars: data.stargazers_count,
          forks: data.forks_count,
          watchers: data.watchers_count,
        });
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [repo]);

  if (loading) {
    return (
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="animate-pulse">Loading stats...</span>
      </div>
    );
  }

  if (error || !stats) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-1">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        {stats.stars}
      </span>
      <span className="flex items-center gap-1">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="18" r="3" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
          <path d="M12 12v3" />
        </svg>
        {stats.forks}
      </span>
      <span className="flex items-center gap-1">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {stats.watchers}
      </span>
    </div>
  );
}
