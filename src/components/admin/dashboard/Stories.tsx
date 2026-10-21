import { getStoriesAdmin } from "@/data/admin";
import { getStoryPipeline } from "@/data/admin-dashboard";
import { CreateStoryForm, StoryList, type StoryView } from "./StoriesClient";

export async function StoriesBody() {
  const [stories, pipeline] = await Promise.all([getStoriesAdmin(), getStoryPipeline()]);
  const rows: StoryView[] = stories.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    beat: s.beat,
    status: s.status,
    articleCount: s.articleCount,
    openCandidates: pipeline[s.id] ?? 0,
    lastPublishedAt: s.lastPublishedAt,
    isSample: s.isSample,
  }));

  return (
    <div className="grid items-start gap-4 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 xl:order-2">
        <CreateStoryForm />
      </div>
      <div className="min-w-0 xl:order-1">
        <StoryList stories={rows} />
      </div>
    </div>
  );
}

export function StoriesSkeleton() {
  return (
    <div className="grid items-start gap-4 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_21rem]" aria-busy="true" aria-label="스토리 불러오는 중">
      <div className="skeleton h-[420px]" />
      <div className="skeleton hidden h-[360px] xl:block" />
    </div>
  );
}
