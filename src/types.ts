import { z } from "zod";

export const ChapterSchema = z.object({
  title: z.string(),
  url: z.url(),
  pageCount: z.number().int().nonnegative(),
});

export const SectionSchema = z.object({
  name: z.string(),
  chapters: z.array(ChapterSchema),
});

export const ComicInfoSchema = z.object({
  title: z.string(),
  id: z.string(),
  sections: z.array(SectionSchema),
});

export type Chapter = z.infer<typeof ChapterSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type ComicInfo = z.infer<typeof ComicInfoSchema>;
